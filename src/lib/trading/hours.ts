// NYSE market holidays through 2030.
// Fixed-date holidays that fall on Saturday are observed Friday;
// those falling on Sunday are observed Monday.
// Good Friday dates are hardcoded since Easter calculation is non-trivial.
const HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01",
  "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
  "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26",
  "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06",
  "2027-11-25", "2027-12-24",
  // 2028
  "2028-01-17", "2028-02-21", "2028-04-14",
  "2028-05-29", "2028-06-19", "2028-07-04", "2028-09-04",
  "2028-11-23", "2028-12-25",
  // 2029
  "2029-01-01", "2029-01-15", "2029-02-19", "2029-03-30",
  "2029-05-28", "2029-06-19", "2029-07-04", "2029-09-03",
  "2029-11-22", "2029-12-25",
  // 2030
  "2030-01-01", "2030-01-21", "2030-02-18", "2030-04-19",
  "2030-05-27", "2030-06-19", "2030-07-04", "2030-09-02",
  "2030-11-28", "2030-12-25",
];

/**
 * Returns the current date/time components in America/New_York timezone.
 * Avoids re-parsing locale strings (which is fragile) by extracting
 * individual parts via Intl.DateTimeFormat.
 */
function getETComponents(): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
  dateStr: string;
} {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map((p) => [p.type, p.value]),
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24; // Intl may return "24" for midnight
  const minute = Number(parts.minute);

  // Map weekday abbreviation to JS day number
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = dayMap[parts.weekday] ?? 0;

  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;

  return { year, month, day, weekday, hour, minute, dateStr };
}

/**
 * Returns the UTC offset string for America/New_York at a given date,
 * e.g. "-05:00" in winter or "-04:00" during DST.
 */
function getETOffset(dateStr: string): string {
  // Create a date at noon ET on the given day to avoid edge cases
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const utcStr = probe.toLocaleString("en-US", { timeZone: "UTC" });
  const etStr = probe.toLocaleString("en-US", { timeZone: "America/New_York" });
  const diffMs = new Date(utcStr).getTime() - new Date(etStr).getTime();
  const diffHours = diffMs / (60 * 60 * 1000);
  // diffHours will be 5 (EST) or 4 (EDT)
  const sign = diffHours >= 0 ? "-" : "+";
  const abs = Math.abs(diffHours);
  const h = String(Math.floor(abs)).padStart(2, "0");
  const m = String(Math.round((abs % 1) * 60)).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

/**
 * Warn once per process if the current year is beyond our holiday coverage.
 */
let _holidayWarningEmitted = false;
function checkHolidayCoverage(year: number): void {
  if (_holidayWarningEmitted) return;
  const maxYear = 2030;
  if (year > maxYear) {
    console.warn(
      `[trading/hours] Holiday calendar only covers through ${maxYear}. ` +
      `Current year is ${year}. Market-closed checks for holidays may be inaccurate. ` +
      `Please update the HOLIDAYS array in src/lib/trading/hours.ts.`,
    );
    _holidayWarningEmitted = true;
  }
}

export function isMarketOpen(): {
  open: boolean;
  reason?: string;
  nextOpen?: string;
} {
  const et = getETComponents();
  checkHolidayCoverage(et.year);

  const timeInMinutes = et.hour * 60 + et.minute;

  // Weekend
  if (et.weekday === 0 || et.weekday === 6) {
    return {
      open: false,
      reason: "market_closed_weekend",
      nextOpen: getNextOpen(et.dateStr, et.weekday),
    };
  }

  // Holiday
  if (HOLIDAYS.includes(et.dateStr)) {
    return {
      open: false,
      reason: "market_closed_holiday",
      nextOpen: getNextOpen(et.dateStr, et.weekday),
    };
  }

  // Before 9:30 AM ET
  if (timeInMinutes < 9 * 60 + 30) {
    const offset = getETOffset(et.dateStr);
    return {
      open: false,
      reason: "market_closed_premarket",
      nextOpen: `${et.dateStr}T09:30:00${offset}`,
    };
  }

  // After 4:00 PM ET
  if (timeInMinutes >= 16 * 60) {
    return {
      open: false,
      reason: "market_closed_afterhours",
      nextOpen: getNextOpen(et.dateStr, et.weekday),
    };
  }

  return { open: true };
}

/**
 * Find the next market-open timestamp (9:30 AM ET) after the given date.
 * Accepts a dateStr in YYYY-MM-DD format and the JS weekday number.
 */
function getNextOpen(dateStr: string, weekday: number): string {
  // Start from the next calendar day
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d);
  next.setDate(next.getDate() + 1);

  // Skip weekends and holidays (limit iterations to avoid infinite loop)
  let safety = 0;
  while (safety++ < 30) {
    const wd = next.getDay();
    const ds = formatLocalDate(next);
    if (wd !== 0 && wd !== 6 && !HOLIDAYS.includes(ds)) {
      const offset = getETOffset(ds);
      return `${ds}T09:30:00${offset}`;
    }
    next.setDate(next.getDate() + 1);
  }

  // Fallback (should never reach here)
  const ds = formatLocalDate(next);
  const offset = getETOffset(ds);
  return `${ds}T09:30:00${offset}`;
}

/** Format a local Date as YYYY-MM-DD (using local calendar, not UTC). */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
