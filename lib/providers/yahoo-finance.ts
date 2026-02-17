import type {
  ProviderEarningsQuarter,
  ProviderFundamentals,
  ProviderHistoricalPoint,
  ProviderIntradayPoint,
  ProviderQuote,
} from "./types";

// biome-ignore lint/suspicious/noExplicitAny: yahoo-finance2 has no exported types for the default module
let yahooFinance: any = null;

interface YfChartQuote {
  date: string | Date;
  close: number | null;
  adjclose?: number | null;
}

interface YfEarningsEntry {
  quarter?: string | Date;
  epsActual?: number | null;
}

async function getYahooFinance() {
  if (!yahooFinance) {
    const mod = await import("yahoo-finance2");
    yahooFinance = mod.default;
    // Suppress internal validation warnings
    yahooFinance.suppressNotices(["yahooSurvey"]);
  }
  return yahooFinance;
}

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchQuote(symbol: string): Promise<ProviderQuote | null> {
  try {
    const yf = await getYahooFinance();
    const result = await yf.quote(symbol);
    if (!result?.regularMarketPrice) return null;
    return {
      symbol,
      price: result.regularMarketPrice,
      change: result.regularMarketChange ?? 0,
      changePercent: result.regularMarketChangePercent ?? 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.warn(`[yahoo] fetchQuote failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchQuotesBatch(symbols: string[]): Promise<Map<string, ProviderQuote>> {
  const map = new Map<string, ProviderQuote>();
  try {
    const yf = await getYahooFinance();
    const results = await yf.quote(symbols);
    const arr = Array.isArray(results) ? results : [results];
    for (const r of arr) {
      if (r?.symbol && r?.regularMarketPrice) {
        map.set(r.symbol, {
          symbol: r.symbol,
          price: r.regularMarketPrice,
          change: r.regularMarketChange ?? 0,
          changePercent: r.regularMarketChangePercent ?? 0,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (error) {
    console.warn("[yahoo] fetchQuotesBatch failed:", error);
  }
  return map;
}

export async function fetchIntradayChart(
  symbol: string,
  interval: "1m" | "5m" | "15m" | "30m" | "60m" | "1h" = "60m",
  range: "1d" | "2d" | "5d" = "2d"
): Promise<ProviderIntradayPoint[]> {
  try {
    const yf = await getYahooFinance();
    const result = await yf.chart(symbol, {
      interval: interval === "60m" ? "1h" : interval,
      period1: getDateDaysAgo(range === "1d" ? 1 : range === "2d" ? 2 : 5),
    });
    if (!result?.quotes?.length) return [];
    return (result.quotes as YfChartQuote[])
      .filter((q) => q.close != null)
      .map((q) => ({
        timestamp: new Date(q.date).toISOString(),
        close: q.close as number,
      }));
  } catch (error) {
    console.warn(`[yahoo] fetchIntradayChart failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchMonthlyHistory(
  symbol: string,
  years = 10
): Promise<ProviderHistoricalPoint[]> {
  try {
    const yf = await getYahooFinance();
    const result = await yf.chart(symbol, {
      interval: "1mo",
      period1: getDateDaysAgo(years * 365),
    });
    if (!result?.quotes?.length) return [];
    return (result.quotes as YfChartQuote[])
      .filter((q) => q.close != null)
      .map((q) => ({
        date: new Date(q.date).toISOString().split("T")[0],
        close: q.close as number,
        adjustedClose: (q.adjclose ?? q.close) as number,
      }));
  } catch (error) {
    console.warn(`[yahoo] fetchMonthlyHistory failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchFundamentals(symbol: string): Promise<ProviderFundamentals | null> {
  try {
    const yf = await getYahooFinance();
    const result = await yf.quoteSummary(symbol, {
      modules: [
        "defaultKeyStatistics",
        "financialData",
        "incomeStatementHistory",
        "balanceSheetHistory",
      ],
    });

    if (!result) return null;

    const fd = result.financialData || {};
    const ks = result.defaultKeyStatistics || {};
    const isHistory = result.incomeStatementHistory?.incomeStatementHistory?.[0];
    const bsHistory = result.balanceSheetHistory?.balanceSheetStatements?.[0];

    return {
      eps: safeNum(ks.trailingEps),
      bookValue: safeNum(ks.bookValue),
      pe: safeNum(
        ks.trailingPE ??
          (fd.currentPrice && ks.trailingEps ? fd.currentPrice / ks.trailingEps : null)
      ),
      pb: safeNum(ks.priceToBook),
      roe: safeNum(fd.returnOnEquity),
      roa: safeNum(fd.returnOnAssets),
      grossMargin: safeNum(fd.grossMargins),
      operatingMargin: safeNum(fd.operatingMargins),
      netMargin: safeNum(fd.profitMargins),
      debtToEquity: safeNum(fd.debtToEquity != null ? fd.debtToEquity / 100 : null),
      currentRatio: safeNum(fd.currentRatio),
      dividendYield: safeNum(ks.dividendYield ?? ks.trailingAnnualDividendYield),
      freeCashFlowPerShare: safeNum(
        fd.freeCashflow && ks.sharesOutstanding ? fd.freeCashflow / ks.sharesOutstanding : null
      ),
      analystTargetPrice: safeNum(fd.targetMeanPrice),
      sharesOutstanding: safeNum(ks.sharesOutstanding),
      totalRevenue: safeNum(fd.totalRevenue ?? isHistory?.totalRevenue),
      grossProfit: safeNum(fd.grossProfits ?? isHistory?.grossProfit),
      operatingIncome: safeNum(isHistory?.operatingIncome),
      netIncome: safeNum(isHistory?.netIncome),
      totalEquity: safeNum(bsHistory?.totalStockholderEquity),
      totalLiabilities: safeNum(bsHistory?.totalLiab),
      totalCurrentAssets: safeNum(bsHistory?.totalCurrentAssets),
      totalCurrentLiabilities: safeNum(bsHistory?.totalCurrentLiabilities),
    };
  } catch (error) {
    console.warn(`[yahoo] fetchFundamentals failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchQuarterlyEarnings(symbol: string): Promise<ProviderEarningsQuarter[]> {
  try {
    const yf = await getYahooFinance();
    const result = await yf.quoteSummary(symbol, {
      modules: ["earningsHistory"],
    });
    const history = result?.earningsHistory?.history;
    if (!Array.isArray(history)) return [];
    return (history as YfEarningsEntry[]).map((q) => ({
      fiscalDate: q.quarter ? new Date(q.quarter).toISOString().split("T")[0] : "",
      reportedEPS: safeNum(q.epsActual),
    }));
  } catch (error) {
    console.warn(`[yahoo] fetchQuarterlyEarnings failed for ${symbol}:`, error);
    return [];
  }
}

function getDateDaysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
