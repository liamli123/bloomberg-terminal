import type { ProviderFundamentals, ProviderNewsItem } from "./types";

const API_KEY = process.env.FMP_API_KEY;
const BASE_URL = "https://financialmodelingprep.com/api/v3";

async function fmpFetch(path: string, params: Record<string, string> = {}) {
  if (!API_KEY) throw new Error("FMP_API_KEY is not set");
  const qs = new URLSearchParams({ ...params, apikey: API_KEY });
  const res = await fetch(`${BASE_URL}${path}?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`FMP HTTP ${res.status} for ${path}`);
  return res.json();
}

function safeNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchFundamentals(symbol: string): Promise<ProviderFundamentals | null> {
  try {
    const [profileArr, ratiosArr] = await Promise.all([
      fmpFetch(`/profile/${symbol}`),
      fmpFetch(`/ratios-ttm/${symbol}`),
    ]);

    const profile = Array.isArray(profileArr) ? profileArr[0] : null;
    const ratios = Array.isArray(ratiosArr) ? ratiosArr[0] : null;

    if (!profile && !ratios) return null;

    return {
      eps: safeNum(profile?.eps),
      bookValue: safeNum(profile?.bookValuePerShare ?? ratios?.bookValuePerShareTTM),
      pe: safeNum(profile?.pe ?? ratios?.peRatioTTM),
      pb: safeNum(ratios?.priceToBookRatioTTM),
      roe: safeNum(ratios?.returnOnEquityTTM),
      roa: safeNum(ratios?.returnOnAssetsTTM),
      grossMargin: safeNum(ratios?.grossProfitMarginTTM),
      operatingMargin: safeNum(ratios?.operatingProfitMarginTTM),
      netMargin: safeNum(ratios?.netProfitMarginTTM),
      debtToEquity: safeNum(ratios?.debtEquityRatioTTM),
      currentRatio: safeNum(ratios?.currentRatioTTM),
      dividendYield: safeNum(ratios?.dividendYieldTTM),
      freeCashFlowPerShare: safeNum(ratios?.freeCashFlowPerShareTTM),
      analystTargetPrice: safeNum(profile?.targetMeanPrice),
      sharesOutstanding: safeNum(
        profile?.sharesOutstanding ??
          (profile?.mktCap && profile?.price ? profile.mktCap / profile.price : null)
      ),
      totalRevenue: safeNum(profile?.revenue),
      grossProfit: null,
      operatingIncome: null,
      netIncome: safeNum(profile?.netIncome),
      totalEquity: null,
      totalLiabilities: null,
      totalCurrentAssets: null,
      totalCurrentLiabilities: null,
    };
  } catch (error) {
    console.warn(`[fmp] fetchFundamentals failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchIncomeStatement(symbol: string) {
  try {
    const data = await fmpFetch(`/income-statement/${symbol}`, { limit: "1" });
    const report = Array.isArray(data) ? data[0] : null;
    if (!report) return null;
    return {
      totalRevenue: safeNum(report.revenue),
      grossProfit: safeNum(report.grossProfit),
      operatingIncome: safeNum(report.operatingIncome),
      netIncome: safeNum(report.netIncome),
    };
  } catch (error) {
    console.warn(`[fmp] fetchIncomeStatement failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchBalanceSheet(symbol: string) {
  try {
    const data = await fmpFetch(`/balance-sheet-statement/${symbol}`, { limit: "1" });
    const report = Array.isArray(data) ? data[0] : null;
    if (!report) return null;
    return {
      totalEquity: safeNum(report.totalStockholdersEquity),
      totalLiabilities: safeNum(report.totalLiabilities),
      totalCurrentAssets: safeNum(report.totalCurrentAssets),
      totalCurrentLiabilities: safeNum(report.totalCurrentLiabilities),
      sharesOutstanding: safeNum(report.commonStock),
    };
  } catch (error) {
    console.warn(`[fmp] fetchBalanceSheet failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchNews(symbol?: string, limit = 20): Promise<ProviderNewsItem[]> {
  try {
    const params: Record<string, string> = { limit: String(limit) };
    if (symbol) params.tickers = symbol;
    const data = await fmpFetch("/stock_news", params);

    if (!Array.isArray(data)) return [];
    return data
      .slice(0, limit)
      .map(
        (item: {
          title?: string;
          text?: string;
          url?: string;
          site?: string;
          publishedDate?: string;
          image?: string;
        }) => ({
          title: item.title || "",
          summary: item.text || "",
          url: item.url || "",
          source: item.site || "",
          publishedAt: item.publishedDate || new Date().toISOString(),
          imageUrl: item.image || undefined,
        })
      );
  } catch (error) {
    console.warn("[fmp] fetchNews failed:", error);
    return [];
  }
}
