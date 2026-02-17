import type { ProviderNewsItem, ProviderQuote } from "./types";

const API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = "https://finnhub.io/api/v1";

interface FinnhubNewsEntry {
  headline?: string;
  summary?: string;
  url?: string;
  source?: string;
  datetime?: number;
  image?: string;
}

async function finnhubFetch(path: string, params: Record<string, string> = {}) {
  if (!API_KEY) throw new Error("FINNHUB_API_KEY is not set");
  const qs = new URLSearchParams({ ...params, token: API_KEY });
  const res = await fetch(`${BASE_URL}${path}?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Finnhub HTTP ${res.status} for ${path}`);
  return res.json();
}

function mapNewsEntry(item: FinnhubNewsEntry): ProviderNewsItem {
  return {
    title: item.headline || "",
    summary: item.summary || "",
    url: item.url || "",
    source: item.source || "",
    publishedAt: item.datetime
      ? new Date(item.datetime * 1000).toISOString()
      : new Date().toISOString(),
    imageUrl: item.image || undefined,
  };
}

export async function fetchCompanyNews(symbol: string, daysBack = 7): Promise<ProviderNewsItem[]> {
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - daysBack);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const data = await finnhubFetch("/company-news", {
      symbol,
      from: formatDate(from),
      to: formatDate(to),
    });

    if (!Array.isArray(data)) return [];
    return data.slice(0, 20).map(mapNewsEntry);
  } catch (error) {
    console.warn(`[finnhub] fetchCompanyNews failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchMarketNews(category = "general"): Promise<ProviderNewsItem[]> {
  try {
    const data = await finnhubFetch("/news", { category });
    if (!Array.isArray(data)) return [];
    return data.slice(0, 20).map(mapNewsEntry);
  } catch (error) {
    console.warn("[finnhub] fetchMarketNews failed:", error);
    return [];
  }
}

export async function fetchNewsSentiment(
  symbol: string
): Promise<{ buzz: number; sentiment: number; articlesInLastWeek: number } | null> {
  try {
    const data = await finnhubFetch("/news-sentiment", { symbol });
    if (!data?.sentiment) return null;
    return {
      buzz: data.buzz?.buzz ?? 0,
      sentiment: data.sentiment?.bullishPercent
        ? (data.sentiment.bullishPercent - data.sentiment.bearishPercent) / 100
        : 0,
      articlesInLastWeek: data.buzz?.articlesInLastWeek ?? 0,
    };
  } catch (error) {
    console.warn(`[finnhub] fetchNewsSentiment failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchQuote(symbol: string): Promise<ProviderQuote | null> {
  try {
    const data = await finnhubFetch("/quote", { symbol });
    if (!data?.c) return null;
    return {
      symbol,
      price: data.c,
      change: data.d ?? 0,
      changePercent: data.dp ?? 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`[finnhub] fetchQuote failed for ${symbol}:`, error);
    return null;
  }
}
