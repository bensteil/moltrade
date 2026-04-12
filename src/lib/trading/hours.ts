// US market holidays for 2025-2026 (NYSE)
const HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01",
  "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
  "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
];

function getETTime(): Date {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  return new Date(etString);
}

export function isMarketOpen(): {
  open: boolean;
  reason?: string;
  nextOpen?: string;
} {
  const et = getETTime();
  const day = et.getDay();
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  const dateStr = et.toISOString().split("T")[0];

  // Weekend
  if (day === 0 || day === 6) {
    return {
      open: false,
      reason: "market_closed_weekend",
      nextOpen: getNextOpen(et),
    };
  }

  // Holiday
  if (HOLIDAYS.includes(dateStr)) {
    return {
      open: false,
      reason: "market_closed_holiday",
      nextOpen: getNextOpen(et),
    };
  }

  // Before 9:30 AM ET
  if (timeInMinutes < 9 * 60 + 30) {
    return {
      open: false,
      reason: "market_closed_premarket",
      nextOpen: `${dateStr}T09:30:00-05:00`,
    };
  }

  // After 4:00 PM ET
  if (timeInMinutes >= 16 * 60) {
    return {
      open: false,
      reason: "market_closed_afterhours",
      nextOpen: getNextOpen(et),
    };
  }

  return { open: true };
}

function getNextOpen(from: Date): string {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 30, 0, 0);

  // Skip weekends and holidays
  while (
    next.getDay() === 0 ||
    next.getDay() === 6 ||
    HOLIDAYS.includes(next.toISOString().split("T")[0])
  ) {
    next.setDate(next.getDate() + 1);
  }

  return `${next.toISOString().split("T")[0]}T09:30:00-05:00`;
}
