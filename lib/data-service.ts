// Unified data service - replaces alpha-vantage.ts
// Orchestrates yahoo-finance2, Finnhub, FMP, and Twelve Data with fallback chains

import * as finnhub from "./providers/finnhub";
import * as fmp from "./providers/fmp";
import * as twelveData from "./providers/twelve-data";
import type { ProviderIntradayPoint } from "./providers/types";
import * as yahoo from "./providers/yahoo-finance";

// Map our market indices to Yahoo Finance symbols
const MARKET_INDICES: Record<string, string> = {
  "DOW JONES": "^DJI",
  "S&P 500": "^GSPC",
  NASDAQ: "^IXIC",
  "S&P/TSX Comp": "^GSPTSE",
  "S&P/BMV IPC": "^MXX",
  IBOVESPA: "^BVSP",
  "Euro Stoxx 50": "^STOXX50E",
  "FTSE 100": "^FTSE",
  "CAC 40": "^FCHI",
  DAX: "^GDAXI",
  "IBEX 35": "^IBEX",
  "FTSE MIB": "FTSEMIB.MI",
  "OMX STKH30": "^OMX",
  "SWISS MKT": "^SSMI",
  NIKKEI: "^N225",
  "HANG SENG": "^HSI",
  "CSI 300": "000300.SS",
  "S&P/ASX 200": "^AXJO",
};

export function generateRandomSparkline(): number[] {
  return Array.from({ length: 8 }, () => Math.min(1, Math.max(0, Math.random())));
}

export function generateFallbackData(indexName: string, region: string, index: number) {
  const value = 1000 + Math.random() * 10000;
  const change = Math.random() * 100 - 50;
  const pctChange = (change / value) * 100;

  return {
    id: indexName,
    num: `${region === "americas" ? "1" : region === "emea" ? "2" : "3"}${index + 1})`,
    rmi: "□",
    value,
    change,
    pctChange,
    avat: Math.random() * 100 - 50,
    time: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    ytd: Math.random() * 30 - 15,
    ytdCur: Math.random() * 30 - 10,
    sparkline1: generateRandomSparkline(),
    sparkline2: generateRandomSparkline(),
  };
}

interface MarketIndexData {
  id: string;
  num: string;
  rmi: string;
  value: number;
  change: number;
  pctChange: number;
  avat: number;
  time: string;
  ytd: number;
  ytdCur: number;
  sparkline1: number[];
  sparkline2: number[];
  twoDayData?: { timestamp: string; close: number }[] | null;
}

export interface FetchAllMarketDataResult {
  americas: MarketIndexData[];
  emea: MarketIndexData[];
  asiaPacific: MarketIndexData[];
  lastUpdated: string;
  dataSource: string;
  [key: string]: MarketIndexData[] | string | boolean | undefined;
}

function normalizeToSparkline(values: number[]): number[] {
  if (values.length === 0) return generateRandomSparkline();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const normalized = values.map((v) => (v - min) / range);
  while (normalized.length < 16) normalized.push(normalized[normalized.length - 1] ?? 0.5);
  return normalized.slice(0, 16);
}

export async function fetchAllMarketData(): Promise<FetchAllMarketDataResult> {
  const regions = {
    americas: ["DOW JONES", "S&P 500", "NASDAQ", "S&P/TSX Comp", "S&P/BMV IPC", "IBOVESPA"],
    emea: [
      "Euro Stoxx 50",
      "FTSE 100",
      "CAC 40",
      "DAX",
      "IBEX 35",
      "FTSE MIB",
      "OMX STKH30",
      "SWISS MKT",
    ],
    asiaPacific: ["NIKKEI", "HANG SENG", "CSI 300", "S&P/ASX 200"],
  };

  const result: FetchAllMarketDataResult = {
    americas: [],
    emea: [],
    asiaPacific: [],
    lastUpdated: new Date().toISOString(),
    dataSource: "multi-provider",
  };

  // Batch-fetch all 18 index quotes in one call via yahoo-finance2
  const allSymbols = Object.values(MARKET_INDICES);
  let quotesMap = new Map<string, { price: number; change: number; changePercent: number }>();
  try {
    quotesMap = await yahoo.fetchQuotesBatch(allSymbols);
  } catch {
    console.warn("[data-service] Yahoo batch quote failed, will use individual fallbacks");
  }

  for (const [region, indices] of Object.entries(regions)) {
    const regionKey = region as keyof typeof regions;
    for (let i = 0; i < indices.length; i++) {
      const indexName = indices[i];
      const symbol = MARKET_INDICES[indexName];

      try {
        let quote = quotesMap.get(symbol) ?? null;

        // Fallback: Twelve Data individual quote
        if (!quote) {
          try {
            const tdQuote = await twelveData.fetchQuote(symbol);
            if (tdQuote) {
              quote = {
                price: tdQuote.price,
                change: tdQuote.change,
                changePercent: tdQuote.changePercent,
              };
            }
          } catch {
            // will use fallback data
          }
        }

        // Fetch intraday for sparklines (yahoo chart)
        let intradayData: ProviderIntradayPoint[] = [];
        try {
          intradayData = await yahoo.fetchIntradayChart(symbol, "60m", "2d");
        } catch {
          try {
            intradayData = await twelveData.fetchIntradayTimeSeries(symbol, "1h", 16);
          } catch {
            // will use random sparkline
          }
        }

        if (quote) {
          const sparklineValues = intradayData.map((p) => p.close);
          const normalized = normalizeToSparkline(sparklineValues);

          result[regionKey].push({
            id: indexName,
            num: `${region === "americas" ? "1" : region === "emea" ? "2" : "3"}${i + 1})`,
            rmi: "□",
            value: quote.price,
            change: quote.change,
            pctChange: quote.changePercent,
            avat: Math.random() * 100 - 50,
            time: new Date().toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
            ytd: Math.random() * 30 - 15,
            ytdCur: Math.random() * 30 - 10,
            sparkline1: normalized.slice(0, 8),
            sparkline2: normalized.slice(-8),
            twoDayData:
              intradayData.length > 0
                ? intradayData.map((p) => ({ timestamp: p.timestamp, close: p.close }))
                : null,
          });
        } else {
          result[regionKey].push(generateFallbackData(indexName, region, i));
        }
      } catch (error) {
        console.error(`[data-service] Error processing ${indexName}:`, error);
        result[regionKey].push(generateFallbackData(indexName, region, i));
      }
    }
  }

  return result;
}

export async function fetchFinancialNews(query = "market") {
  // Primary: Finnhub
  try {
    const news = await finnhub.fetchMarketNews(query === "market" ? "general" : "general");
    if (news && news.length > 0) {
      // Map to the shape expected by news-view.tsx
      return news.slice(0, 20).map((item) => ({
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: item.source,
        time_published: item.publishedAt,
        authors: item.authors || [],
        banner_image: item.imageUrl || "",
        source_domain: item.sourceDomain || item.source,
        topics: item.topics || [],
      }));
    }
  } catch {
    console.warn("[data-service] Finnhub news failed, trying FMP");
  }

  // Fallback: FMP
  try {
    const news = await fmp.fetchNews(undefined, 20);
    if (news && news.length > 0) {
      return news.slice(0, 20).map((item) => ({
        title: item.title,
        summary: item.summary,
        url: item.url,
        source: item.source,
        time_published: item.publishedAt,
        authors: [],
        banner_image: item.imageUrl || "",
        source_domain: item.sourceDomain || item.source,
        topics: [],
      }));
    }
  } catch {
    console.warn("[data-service] FMP news also failed");
  }

  return null;
}
