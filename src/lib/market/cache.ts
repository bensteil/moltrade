import { getCached } from "../redis";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || "";
const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
const API_TIMEOUT = 8000;

function fetchWithTimeout(url: string, timeoutMs = API_TIMEOUT): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
}

// Cache TTLs in seconds
const QUOTE_TTL = 60; // 1 minute
const HISTORY_TTL = 3600; // 1 hour
const FUNDAMENTALS_TTL = 86400; // 24 hours
const NEWS_TTL = 900; // 15 minutes

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
}

export interface HistoryBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  try {
    return await getCached<Quote>(`quote:${symbol}`, QUOTE_TTL, async () => {
      const result = await yahooFinance.quote(symbol);
      return {
        symbol,
        price: result.regularMarketPrice ?? 0,
        change: result.regularMarketChange ?? 0,
        changePercent: result.regularMarketChangePercent ?? 0,
        volume: result.regularMarketVolume ?? 0,
        high: result.regularMarketDayHigh ?? 0,
        low: result.regularMarketDayLow ?? 0,
        open: result.regularMarketOpen ?? 0,
        previousClose: result.regularMarketPreviousClose ?? 0,
        timestamp: result.regularMarketTime?.toISOString() ?? new Date().toISOString(),
      };
    });
  } catch {
    // Fallback to Alpha Vantage
    try {
      return await fetchAlphaVantageQuote(symbol);
    } catch {
      return null;
    }
  }
}

export async function getBatchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const results: Record<string, Quote> = {};
  await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await getQuote(symbol);
      if (quote) results[symbol] = quote;
    })
  );
  return results;
}

export async function getHistory(
  symbol: string,
  period: string = "1y",
  interval: string = "1d"
): Promise<HistoryBar[]> {
  return getCached<HistoryBar[]>(
    `history:${symbol}:${period}:${interval}`,
    HISTORY_TTL,
    async () => {
      const result = await yahooFinance.chart(symbol, {
        period1: getPeriodStartDate(period),
        interval: mapInterval(interval),
      });
      return result.quotes.map((bar) => ({
        date: bar.date.toISOString().split("T")[0],
        open: bar.open ?? 0,
        high: bar.high ?? 0,
        low: bar.low ?? 0,
        close: bar.close ?? 0,
        volume: bar.volume ?? 0,
      }));
    }
  );
}

export async function getFundamentals(
  symbol: string
): Promise<Record<string, unknown> | null> {
  try {
    return await getCached(
      `fundamentals:${symbol}`,
      FUNDAMENTALS_TTL,
      async () => {
        // Try Alpha Vantage for fundamentals
        const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) throw new Error(`Alpha Vantage error: ${res.status}`);
        const data = await res.json();
        if (data["Error Message"] || data["Note"]) throw new Error("AV rate limit");
        return {
          symbol: data.Symbol,
          name: data.Name,
          sector: data.Sector,
          industry: data.Industry,
          marketCap: Number(data.MarketCapitalization),
          peRatio: Number(data.PERatio) || null,
          eps: Number(data.EPS) || null,
          dividendYield: Number(data.DividendYield) || null,
          beta: Number(data.Beta) || null,
          fiftyTwoWeekHigh: Number(data["52WeekHigh"]),
          fiftyTwoWeekLow: Number(data["52WeekLow"]),
          description: data.Description,
        };
      }
    );
  } catch {
    return null;
  }
}

export async function getNews(
  query?: string,
  symbols?: string[]
): Promise<unknown[]> {
  const searchQuery = query || symbols?.join(" OR ") || "stock market";
  return getCached(`news:${searchQuery}`, NEWS_TTL, async () => {
    if (!NEWS_API_KEY) {
      return [];
    }
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(searchQuery)}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${NEWS_API_KEY}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map(
      (a: { title: string; description: string; url: string; source: { name: string }; publishedAt: string }) => ({
        title: a.title,
        description: a.description,
        url: a.url,
        source: a.source?.name,
        publishedAt: a.publishedAt,
      })
    );
  });
}

async function fetchAlphaVantageQuote(symbol: string): Promise<Quote> {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();
  const gq = data["Global Quote"];
  if (!gq) throw new Error("No quote data");

  return {
    symbol,
    price: Number(gq["05. price"]),
    change: Number(gq["09. change"]),
    changePercent: parseFloat(gq["10. change percent"]),
    volume: Number(gq["06. volume"]),
    high: Number(gq["03. high"]),
    low: Number(gq["04. low"]),
    open: Number(gq["02. open"]),
    previousClose: Number(gq["08. previous close"]),
    timestamp: gq["07. latest trading day"],
  };
}

export async function getMarketStatus(): Promise<{
  isOpen: boolean;
  reason?: string;
  nextOpen?: string;
}> {
  const { isMarketOpen } = await import("../trading/hours");
  const status = isMarketOpen();
  return {
    isOpen: status.open,
    reason: status.reason,
    nextOpen: status.nextOpen,
  };
}

// Helper: convert period string like "1y", "6mo", "1mo" to a start Date
function getPeriodStartDate(period: string): Date {
  const now = new Date();
  const match = period.match(/^(\d+)(d|mo|y)$/);
  if (!match) return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const [, numStr, unit] = match;
  const num = parseInt(numStr, 10);
  switch (unit) {
    case "d":
      now.setDate(now.getDate() - num);
      break;
    case "mo":
      now.setMonth(now.getMonth() - num);
      break;
    case "y":
      now.setFullYear(now.getFullYear() - num);
      break;
  }
  return now;
}

// Helper: map interval strings to yahoo-finance2 format
function mapInterval(interval: string): "1d" | "1wk" | "1mo" {
  if (interval.includes("wk") || interval.includes("w")) return "1wk";
  if (interval.includes("mo") || interval.includes("m")) return "1mo";
  return "1d";
}
