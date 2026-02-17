import type { ProviderHistoricalPoint, ProviderIntradayPoint, ProviderQuote } from "./types";

const API_KEY = process.env.TWELVE_DATA_API_KEY;
const BASE_URL = "https://api.twelvedata.com";

async function twFetch(path: string, params: Record<string, string> = {}) {
  if (!API_KEY) throw new Error("TWELVE_DATA_API_KEY is not set");
  const qs = new URLSearchParams({ ...params, apikey: API_KEY });
  const res = await fetch(`${BASE_URL}${path}?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status} for ${path}`);
  return res.json();
}

export async function fetchIntradayTimeSeries(
  symbol: string,
  interval = "1h",
  outputsize = 16
): Promise<ProviderIntradayPoint[]> {
  try {
    const data = await twFetch("/time_series", {
      symbol,
      interval,
      outputsize: String(outputsize),
    });
    if (!Array.isArray(data?.values)) return [];
    return data.values.map((v: { datetime?: string; close?: string }) => ({
      timestamp: v.datetime || "",
      close: Number.parseFloat(v.close || "0") || 0,
    }));
  } catch (error) {
    console.warn(`[twelvedata] fetchIntradayTimeSeries failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchMonthlyTimeSeries(
  symbol: string,
  outputsize = 120
): Promise<ProviderHistoricalPoint[]> {
  try {
    const data = await twFetch("/time_series", {
      symbol,
      interval: "1month",
      outputsize: String(outputsize),
    });
    if (!Array.isArray(data?.values)) return [];
    return data.values.map((v: { datetime?: string; close?: string }) => ({
      date: v.datetime || "",
      close: Number.parseFloat(v.close || "0") || 0,
    }));
  } catch (error) {
    console.warn(`[twelvedata] fetchMonthlyTimeSeries failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchQuote(symbol: string): Promise<ProviderQuote | null> {
  try {
    const data = await twFetch("/quote", { symbol });
    if (!data?.close) return null;
    return {
      symbol,
      price: Number.parseFloat(data.close) || 0,
      change: Number.parseFloat(data.change) || 0,
      changePercent: Number.parseFloat(data.percent_change) || 0,
      timestamp: data.datetime || new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`[twelvedata] fetchQuote failed for ${symbol}:`, error);
    return null;
  }
}
