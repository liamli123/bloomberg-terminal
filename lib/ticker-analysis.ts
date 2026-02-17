import { promises as fs } from "node:fs";
import path from "node:path";
import * as finnhub from "./providers/finnhub";
import * as fmp from "./providers/fmp";
import type { ProviderFundamentals, ProviderHistoricalPoint } from "./providers/types";
import * as yahoo from "./providers/yahoo-finance";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "ticker-analysis-cache.json");
const CORE_TTL_MS = 10 * 60 * 1000;
const NEWS_TTL_MS = 30 * 60 * 1000;

type HeadlineItem = {
  title: string;
  summary: string;
  source: string;
  time_published: string;
  overall_sentiment_score?: number;
};

type TestResult = {
  name: string;
  status: "PASS" | "WARN" | "FAIL" | "MANUAL";
  details: string;
  rationale: string;
};

export type TickerAnalysisResult = {
  ticker: string;
  fetchedAt: string;
  meta: {
    dataMode: "LIVE" | "MIXED" | "CACHED";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    notes: string[];
    missingFields: string[];
    endpointStatus: Record<string, "ok" | "partial" | "rate_limited" | "error">;
  };
  market: {
    price: number | null;
    changePct: number | null;
  };
  fundamentals: {
    eps: number | null;
    bvps: number | null;
    pe: number | null;
    pb: number | null;
    roe: number | null;
    roic: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    dividendYield: number | null;
    freeCashFlowPerShare: number | null;
    analystTargetPrice: number | null;
  };
  history: {
    cagr10y: number | null;
    maxDrawdown: number | null;
    monthlyVolatility: number | null;
    positiveMonthRatio: number | null;
  };
  sentiment: {
    score: number;
    coverage: number;
    redFlags: number;
    headlines: HeadlineItem[];
  };
  valuation: {
    intrinsicValue: number | null;
    marginOfSafety: number | null;
    recommendation: "STRONG BUY" | "BUY" | "HOLD" | "REDUCE" | "SELL" | "INSUFFICIENT DATA";
    qualityScore: number;
    modelBreakdown: Record<string, number>;
    growthUsed: number;
  };
  buffettMunger: {
    recommendation: "STRONG BUY" | "BUY" | "HOLD" | "REDUCE" | "SELL" | "INSUFFICIENT DATA";
    scores: {
      moat: number;
      quality: number;
      predictability: number;
      management: number;
      risk: number;
      sentiment: number;
      marginOfSafety: number;
    };
    tests: TestResult[];
    wisdom: string[];
  };
  warnings: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/,/g, "");
  if (!text || text === "-" || text.toUpperCase() === "N/A" || text.toUpperCase() === "NONE")
    return null;
  const parsed = Number(text);
  if (Number.isFinite(parsed)) return parsed;
  return null;
}

async function readTickerCache(ticker: string): Promise<TickerAnalysisResult | null> {
  try {
    const content = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(content) as Record<string, TickerAnalysisResult>;
    return parsed[ticker] || null;
  } catch {
    return null;
  }
}

async function writeTickerCache(result: TickerAnalysisResult): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    let parsed: Record<string, TickerAnalysisResult> = {};
    try {
      const content = await fs.readFile(CACHE_FILE, "utf8");
      parsed = JSON.parse(content) as Record<string, TickerAnalysisResult>;
    } catch {
      parsed = {};
    }
    parsed[result.ticker] = result;
    await fs.writeFile(CACHE_FILE, JSON.stringify(parsed, null, 2), "utf8");
  } catch {
    // non-fatal cache write failure
  }
}

function fillNullsFromCache<T extends Record<string, unknown>>(
  current: T,
  cached: T | undefined,
  touched: string[],
  prefix: string
): T {
  if (!cached) return current;
  const next: Record<string, unknown> = { ...current };
  for (const key of Object.keys(next)) {
    if (next[key] === null || next[key] === undefined) {
      const cachedValue = (cached as Record<string, unknown>)[key];
      if (cachedValue !== null && cachedValue !== undefined) {
        next[key] = cachedValue;
        touched.push(`${prefix}.${key}`);
      }
    }
  }
  return next as T;
}

function extractMonthlyStats(points: ProviderHistoricalPoint[]) {
  const ordered = points
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => p.adjustedClose ?? p.close)
    .filter((v) => v > 0);

  if (ordered.length < 24) {
    return {
      cagr10y: null,
      maxDrawdown: null,
      monthlyVolatility: null,
      positiveMonthRatio: null,
    };
  }

  const tenYears = ordered.slice(-120);
  const first = tenYears[0];
  const last = tenYears[tenYears.length - 1];
  const years = tenYears.length / 12;
  const cagr10y = first > 0 ? (last / first) ** (1 / years) - 1 : null;

  let peak = tenYears[0];
  let maxDrawdown = 0;
  const returns: number[] = [];
  let positive = 0;

  for (let i = 0; i < tenYears.length; i++) {
    const price = tenYears[i];
    peak = Math.max(peak, price);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, (price - peak) / peak);
    }
    if (i > 0) {
      const prev = tenYears[i - 1];
      const ret = prev > 0 ? price / prev - 1 : 0;
      returns.push(ret);
      if (ret > 0) positive += 1;
    }
  }

  const avg = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((acc, cur) => acc + (cur - avg) ** 2, 0) / (returns.length || 1);
  const monthlyVolatility = Math.sqrt(variance);
  const positiveMonthRatio = returns.length > 0 ? positive / returns.length : null;

  return {
    cagr10y,
    maxDrawdown,
    monthlyVolatility,
    positiveMonthRatio,
  };
}

function scoreLinear(value: number | null, low: number, high: number): number {
  if (value === null) return 0;
  if (high <= low) return 0;
  const scaled = (value - low) / (high - low);
  return clamp(scaled * 2 - 1, -1, 1);
}

function intrinsicValueEstimate(
  price: number,
  fundamentals: TickerAnalysisResult["fundamentals"],
  historyGrowth: number | null,
  moat: number,
  sentiment: number
) {
  const eps = fundamentals.eps;
  const bvps = fundamentals.bvps;
  const growth = clamp(historyGrowth ?? 0.05, -0.02, 0.18);
  const growthPct = growth * 100;
  const models: Record<string, number> = {};

  if (eps && eps > 0) {
    models.graham = eps * (8.5 + 2 * growthPct);
    const fairPe = clamp(
      11 + 8 * clamp(moat, -0.5, 1.0) + 3 * clamp(sentiment, -0.25, 0.25),
      8,
      28
    );
    models.earningsPower = eps * fairPe;

    const ownerEarningsGrowth = clamp(growth, 0, 0.12);
    const discountRate = 0.1;
    const terminalMultiple = 12;
    let oe = eps;
    let pv = 0;
    for (let year = 1; year <= 5; year++) {
      oe *= 1 + ownerEarningsGrowth;
      pv += oe / (1 + discountRate) ** year;
    }
    const terminal = (oe * terminalMultiple) / (1 + discountRate) ** 5;
    models.ownerEarnings = pv + terminal;
  }

  if (bvps && bvps > 0) {
    const fairPb = clamp(1.2 + 0.9 * moat, 0.6, 3.2);
    models.bookAnchor = bvps * fairPb;
  }

  const keys = Object.keys(models);
  if (keys.length === 0) {
    return { intrinsic: null, margin: null, models, growth };
  }

  const weights: Record<string, number> = {
    graham: 0.25,
    earningsPower: 0.25,
    ownerEarnings: 0.35,
    bookAnchor: 0.15,
  };

  const totalWeight = keys.reduce((sum, key) => sum + (weights[key] || 0), 0);
  const intrinsic =
    keys.reduce((sum, key) => sum + models[key] * (weights[key] || 0), 0) / (totalWeight || 1);
  const margin = price > 0 ? (intrinsic - price) / price : null;
  return { intrinsic, margin, models, growth };
}

function recommendationFromWeighted(
  margin: number | null,
  moat: number,
  quality: number,
  predictability: number,
  management: number,
  risk: number,
  sentiment: number
): TickerAnalysisResult["valuation"]["recommendation"] {
  if (margin === null) return "INSUFFICIENT DATA";
  const total =
    margin * 0.45 +
    moat * 0.12 +
    quality * 0.15 +
    predictability * 0.12 +
    management * 0.08 +
    risk * 0.05 +
    sentiment * 0.03;

  if (total >= 0.28) return "STRONG BUY";
  if (total >= 0.12) return "BUY";
  if (total > -0.04) return "HOLD";
  if (total > -0.15) return "REDUCE";
  return "SELL";
}

const RED_FLAG_WORDS = [
  "fraud",
  "investigation",
  "restatement",
  "bankruptcy",
  "default",
  "insolvency",
  "probe",
  "subpoena",
  "whistleblower",
  "accounting",
  "liquidity",
  "downgrade",
];

function mapProviderFundamentals(pf: ProviderFundamentals): TickerAnalysisResult["fundamentals"] {
  return {
    eps: pf.eps,
    bvps: pf.bookValue,
    pe: pf.pe,
    pb: pf.pb,
    roe: pf.roe,
    roic: pf.roa,
    grossMargin: pf.grossMargin,
    operatingMargin: pf.operatingMargin,
    netMargin: pf.netMargin,
    debtToEquity: pf.debtToEquity,
    currentRatio: pf.currentRatio,
    dividendYield: pf.dividendYield,
    freeCashFlowPerShare: pf.freeCashFlowPerShare,
    analystTargetPrice: pf.analystTargetPrice,
  };
}

export async function analyzeTicker(
  ticker: string,
  options?: { includeNews?: boolean; force?: boolean }
): Promise<TickerAnalysisResult> {
  const symbol = ticker.toUpperCase().trim();
  const includeNews = Boolean(options?.includeNews);
  const force = Boolean(options?.force);
  const warnings: string[] = [];
  const cached = await readTickerCache(symbol);
  let dataMode: TickerAnalysisResult["meta"]["dataMode"] = "LIVE";
  const modeNotes: string[] = [];
  const endpointStatus: Record<string, "ok" | "partial" | "rate_limited" | "error"> = {
    yahoo_fundamentals: "ok",
    yahoo_quote: "ok",
    yahoo_history: "ok",
    finnhub_news: "ok",
  };

  if (cached && !force) {
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    const newsOk = cached.sentiment.coverage > 0;
    if ((!includeNews && ageMs <= CORE_TTL_MS) || (includeNews && newsOk && ageMs <= NEWS_TTL_MS)) {
      return {
        ...cached,
        fetchedAt: new Date().toISOString(),
        meta: {
          ...cached.meta,
          dataMode: "CACHED",
          confidence: "LOW",
          notes: [
            ...(cached.meta?.notes || []),
            `TTL cache hit (${Math.round(ageMs / 1000)}s old).`,
          ],
        },
      };
    }
  }

  // Parallel fetch from multiple providers
  let yahooFundamentals: ProviderFundamentals | null = null;
  let quoteData: { price: number; changePercent: number } | null = null;
  let monthlyHistory: ProviderHistoricalPoint[] = [];
  let newsHeadlines: HeadlineItem[] = [];
  let finnhubSentiment: { sentiment: number; articlesInLastWeek: number } | null = null;

  try {
    const [fundResult, quoteResult, historyResult, newsResult] = await Promise.all([
      yahoo.fetchFundamentals(symbol),
      yahoo.fetchQuote(symbol),
      yahoo.fetchMonthlyHistory(symbol, 10),
      includeNews
        ? Promise.all([finnhub.fetchCompanyNews(symbol, 7), finnhub.fetchNewsSentiment(symbol)])
        : Promise.resolve([[], null] as const),
    ]);

    yahooFundamentals = fundResult;
    if (quoteResult) {
      quoteData = { price: quoteResult.price, changePercent: quoteResult.changePercent };
    }
    monthlyHistory = historyResult;

    if (includeNews) {
      const [newsItems, sentimentData] = newsResult as [
        Awaited<ReturnType<typeof finnhub.fetchCompanyNews>>,
        Awaited<ReturnType<typeof finnhub.fetchNewsSentiment>>,
      ];
      finnhubSentiment = sentimentData;
      newsHeadlines = newsItems.map((item) => ({
        title: item.title,
        summary: item.summary,
        source: item.source,
        time_published: item.publishedAt,
        overall_sentiment_score: item.sentimentScore ?? sentimentData?.sentiment ?? undefined,
      }));
    }
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        fetchedAt: new Date().toISOString(),
        meta: {
          dataMode: "CACHED",
          confidence: "LOW",
          notes: [
            ...(cached.meta?.notes || []),
            "Network/API failure. Returned last cached analysis.",
          ],
          missingFields: cached.meta?.missingFields || [],
          endpointStatus: cached.meta?.endpointStatus || endpointStatus,
        },
        warnings: [
          ...cached.warnings,
          "Provider request failed; served from cached analysis.",
          String(error),
        ],
      };
    }
    throw error;
  }

  // Track endpoint statuses
  if (!yahooFundamentals) endpointStatus.yahoo_fundamentals = "partial";
  if (!quoteData) endpointStatus.yahoo_quote = "partial";
  if (monthlyHistory.length === 0) endpointStatus.yahoo_history = "partial";
  if (!includeNews) {
    endpointStatus.finnhub_news = "partial";
    modeNotes.push("News skipped on standard refresh. Use manual NEWS REFR.");
  }

  // Get fallback price from monthly history
  const fallbackClose =
    monthlyHistory.length > 0
      ? (monthlyHistory[monthlyHistory.length - 1]?.adjustedClose ??
        monthlyHistory[monthlyHistory.length - 1]?.close ??
        null)
      : null;

  const market = {
    price: quoteData?.price ?? fallbackClose,
    changePct: quoteData?.changePercent ?? null,
  };

  // Map fundamentals from provider format
  const fundamentals: TickerAnalysisResult["fundamentals"] = yahooFundamentals
    ? mapProviderFundamentals(yahooFundamentals)
    : {
        eps: null,
        bvps: null,
        pe: null,
        pb: null,
        roe: null,
        roic: null,
        grossMargin: null,
        operatingMargin: null,
        netMargin: null,
        debtToEquity: null,
        currentRatio: null,
        dividendYield: null,
        freeCashFlowPerShare: null,
        analystTargetPrice: null,
      };

  // Infer missing fundamentals from available data
  if (fundamentals.eps === null && fundamentals.pe && market.price && fundamentals.pe > 0) {
    fundamentals.eps = market.price / fundamentals.pe;
    warnings.push("EPS inferred from price and P/E.");
    dataMode = "MIXED";
    modeNotes.push("EPS inferred.");
  }
  if (fundamentals.bvps === null && fundamentals.pb && market.price && fundamentals.pb > 0) {
    fundamentals.bvps = market.price / fundamentals.pb;
    warnings.push("Book value/share inferred from price and P/B.");
    dataMode = "MIXED";
    modeNotes.push("Book value/share inferred.");
  }
  if (fundamentals.pe === null && fundamentals.eps && market.price && fundamentals.eps > 0) {
    fundamentals.pe = market.price / fundamentals.eps;
  }
  if (fundamentals.pb === null && fundamentals.bvps && market.price && fundamentals.bvps > 0) {
    fundamentals.pb = market.price / fundamentals.bvps;
  }

  // Fallback: try FMP for missing fundamentals
  const needsFundamentalFallback =
    fundamentals.eps === null ||
    fundamentals.bvps === null ||
    fundamentals.roe === null ||
    fundamentals.operatingMargin === null ||
    fundamentals.netMargin === null;

  if (needsFundamentalFallback) {
    endpointStatus.yahoo_fundamentals = "partial";
    try {
      const fmpFund = await fmp.fetchFundamentals(symbol);
      if (fmpFund) {
        if (fundamentals.eps === null && fmpFund.eps !== null) {
          fundamentals.eps = fmpFund.eps;
          modeNotes.push("EPS from FMP fallback.");
          dataMode = "MIXED";
        }
        if (fundamentals.bvps === null && fmpFund.bookValue !== null) {
          fundamentals.bvps = fmpFund.bookValue;
          modeNotes.push("Book value from FMP fallback.");
          dataMode = "MIXED";
        }
        if (fundamentals.roe === null && fmpFund.roe !== null) {
          fundamentals.roe = fmpFund.roe;
          dataMode = "MIXED";
        }
        if (fundamentals.roic === null && fmpFund.roa !== null) {
          fundamentals.roic = fmpFund.roa;
          dataMode = "MIXED";
        }
        if (fundamentals.grossMargin === null && fmpFund.grossMargin !== null) {
          fundamentals.grossMargin = fmpFund.grossMargin;
          dataMode = "MIXED";
        }
        if (fundamentals.operatingMargin === null && fmpFund.operatingMargin !== null) {
          fundamentals.operatingMargin = fmpFund.operatingMargin;
          dataMode = "MIXED";
        }
        if (fundamentals.netMargin === null && fmpFund.netMargin !== null) {
          fundamentals.netMargin = fmpFund.netMargin;
          dataMode = "MIXED";
        }
        if (fundamentals.debtToEquity === null && fmpFund.debtToEquity !== null) {
          fundamentals.debtToEquity = fmpFund.debtToEquity;
          dataMode = "MIXED";
        }
        if (fundamentals.currentRatio === null && fmpFund.currentRatio !== null) {
          fundamentals.currentRatio = fmpFund.currentRatio;
          dataMode = "MIXED";
        }
        if (fundamentals.analystTargetPrice === null && fmpFund.analystTargetPrice !== null) {
          fundamentals.analystTargetPrice = fmpFund.analystTargetPrice;
          dataMode = "MIXED";
        }
      }
    } catch {
      modeNotes.push("FMP fallback unavailable.");
    }

    // Try FMP balance sheet + income statement for remaining gaps
    const stillMissing =
      fundamentals.bvps === null ||
      fundamentals.roe === null ||
      fundamentals.operatingMargin === null;

    if (stillMissing) {
      try {
        const [bs, is] = await Promise.all([
          fmp.fetchBalanceSheet(symbol),
          fmp.fetchIncomeStatement(symbol),
        ]);

        const sharesOutstanding = yahooFundamentals?.sharesOutstanding ?? null;

        if (bs) {
          if (
            fundamentals.bvps === null &&
            bs.totalEquity &&
            sharesOutstanding &&
            sharesOutstanding > 0
          ) {
            fundamentals.bvps = bs.totalEquity / sharesOutstanding;
            modeNotes.push("Book value/share derived from FMP balance sheet.");
            dataMode = "MIXED";
          }
          if (
            fundamentals.debtToEquity === null &&
            bs.totalEquity &&
            bs.totalLiabilities &&
            bs.totalEquity !== 0
          ) {
            fundamentals.debtToEquity = bs.totalLiabilities / bs.totalEquity;
            dataMode = "MIXED";
          }
          if (
            fundamentals.currentRatio === null &&
            bs.totalCurrentAssets &&
            bs.totalCurrentLiabilities &&
            bs.totalCurrentLiabilities !== 0
          ) {
            fundamentals.currentRatio = bs.totalCurrentAssets / bs.totalCurrentLiabilities;
            dataMode = "MIXED";
          }
        }

        if (is?.totalRevenue && is.totalRevenue !== 0) {
          if (fundamentals.grossMargin === null && is.grossProfit !== null) {
            fundamentals.grossMargin = is.grossProfit / is.totalRevenue;
            dataMode = "MIXED";
          }
          if (fundamentals.operatingMargin === null && is.operatingIncome !== null) {
            fundamentals.operatingMargin = is.operatingIncome / is.totalRevenue;
            dataMode = "MIXED";
          }
          if (fundamentals.netMargin === null && is.netIncome !== null) {
            fundamentals.netMargin = is.netIncome / is.totalRevenue;
            dataMode = "MIXED";
          }
          if (
            fundamentals.roe === null &&
            is.netIncome &&
            bs?.totalEquity &&
            bs.totalEquity !== 0
          ) {
            fundamentals.roe = is.netIncome / bs.totalEquity;
            dataMode = "MIXED";
          }
        }
      } catch {
        modeNotes.push("FMP statement fallbacks unavailable.");
        endpointStatus.yahoo_fundamentals = "error";
      }
    }
  }

  // If yahoo quarterly earnings can fill EPS gap
  if (fundamentals.eps === null) {
    try {
      const quarters = await yahoo.fetchQuarterlyEarnings(symbol);
      if (quarters.length >= 4) {
        const epsTtm = quarters
          .slice(0, 4)
          .map((q) => q.reportedEPS)
          .filter((v): v is number => v !== null)
          .reduce((sum, v) => sum + v, 0);
        if (epsTtm > 0) {
          fundamentals.eps = epsTtm;
          modeNotes.push("EPS derived from quarterly earnings.");
          dataMode = "MIXED";
        }
      }
    } catch {
      // non-fatal
    }
  }

  const history = extractMonthlyStats(monthlyHistory);

  // Sentiment processing
  let redFlags = 0;
  let sentimentCoverage = 0;
  let sentimentAccum = 0;
  for (const item of newsHeadlines) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    for (const word of RED_FLAG_WORDS) {
      if (text.includes(word)) redFlags += 1;
    }
    if (typeof item.overall_sentiment_score === "number") {
      sentimentAccum += clamp(item.overall_sentiment_score, -1, 1);
      sentimentCoverage += 1;
    }
  }
  const sentimentScore =
    sentimentCoverage > 0 ? clamp(sentimentAccum / sentimentCoverage, -1, 1) : 0;

  // Scoring (identical to original)
  const moat =
    scoreLinear(fundamentals.grossMargin, 0.2, 0.6) * 0.3 +
    scoreLinear(fundamentals.operatingMargin, 0.07, 0.3) * 0.35 +
    scoreLinear(fundamentals.roe, 0.08, 0.25) * 0.35;

  const quality =
    scoreLinear(fundamentals.roe, 0.08, 0.22) * 0.3 +
    scoreLinear(fundamentals.roic, 0.07, 0.2) * 0.3 +
    scoreLinear(
      fundamentals.debtToEquity === null ? null : 1.5 - fundamentals.debtToEquity,
      0.0,
      1.3
    ) *
      0.2 +
    scoreLinear(fundamentals.currentRatio, 1.0, 2.2) * 0.2;

  const predictability =
    scoreLinear(history.cagr10y, 0.02, 0.15) * 0.35 +
    scoreLinear(history.maxDrawdown === null ? null : -history.maxDrawdown, 0.15, 0.55) * 0.25 +
    scoreLinear(
      history.monthlyVolatility === null ? null : 0.2 - history.monthlyVolatility,
      -0.05,
      0.16
    ) *
      0.2 +
    scoreLinear(history.positiveMonthRatio, 0.45, 0.7) * 0.2;

  const management =
    scoreLinear(fundamentals.roic, 0.07, 0.18) * 0.4 +
    scoreLinear(fundamentals.dividendYield, 0, 0.04) * 0.15 +
    scoreLinear(
      fundamentals.debtToEquity === null ? null : 1.2 - fundamentals.debtToEquity,
      0.0,
      1.0
    ) *
      0.2 +
    sentimentScore * 0.25;

  const risk =
    -clamp(redFlags / 30, 0, 0.4) +
    scoreLinear(
      fundamentals.debtToEquity === null ? null : 1.4 - fundamentals.debtToEquity,
      -0.8,
      1.2
    ) *
      0.35 +
    scoreLinear(history.maxDrawdown === null ? null : -history.maxDrawdown, 0.1, 0.55) * 0.25;

  if (market.price === null) {
    warnings.push("Could not read quote price (live quote and monthly close unavailable).");
    endpointStatus.yahoo_quote = endpointStatus.yahoo_quote === "error" ? "error" : "partial";
  } else if (!quoteData) {
    warnings.push("Live quote unavailable; using latest monthly adjusted close as price proxy.");
    dataMode = "MIXED";
    modeNotes.push("Using monthly close as price proxy.");
    endpointStatus.yahoo_quote = "partial";
  }

  const valuationSeed = market.price || fundamentals.analystTargetPrice || 0;
  let valuationCore = intrinsicValueEstimate(
    valuationSeed,
    fundamentals,
    history.cagr10y,
    clamp(moat, -1, 1),
    sentimentScore
  );

  if (valuationCore.intrinsic === null && fundamentals.analystTargetPrice && valuationSeed > 0) {
    const target = fundamentals.analystTargetPrice;
    valuationCore = {
      intrinsic: target,
      margin: (target - valuationSeed) / valuationSeed,
      models: {
        analystTargetAnchor: target,
      },
      growth: valuationCore.growth,
    };
    warnings.push(
      "Intrinsic value fell back to analyst target anchor due to limited fundamentals."
    );
    dataMode = "MIXED";
    modeNotes.push("Intrinsic value anchored to analyst target.");
  }

  const recommendation = recommendationFromWeighted(
    valuationCore.margin,
    clamp(moat, -1, 1),
    clamp(quality, -1, 1),
    clamp(predictability, -1, 1),
    clamp(management, -1, 1),
    clamp(risk, -1, 1),
    sentimentScore
  );

  const tests: TestResult[] = [
    {
      name: "Circle of competence",
      status: "MANUAL",
      details: "Business simplicity and durability must be judged manually.",
      rationale: "Buffett: invest in understandable businesses.",
    },
    {
      name: "Consistent earnings power",
      status:
        (history.cagr10y ?? -1) >= 0.08
          ? "PASS"
          : (history.cagr10y ?? -1) >= 0.03
            ? "WARN"
            : "FAIL",
      details:
        history.cagr10y === null
          ? "10Y CAGR unavailable"
          : `10Y CAGR ${(history.cagr10y * 100).toFixed(2)}%`,
      rationale: "Buffett prefers stable compounding over long periods.",
    },
    {
      name: "Economic moat",
      status: moat >= 0.2 ? "PASS" : moat >= 0 ? "WARN" : "FAIL",
      details: `Moat score ${clamp(moat, -1, 1).toFixed(3)}`,
      rationale: "Sustainable competitive advantage is central.",
    },
    {
      name: "Balance sheet prudence",
      status:
        fundamentals.debtToEquity !== null && fundamentals.debtToEquity <= 0.8
          ? "PASS"
          : fundamentals.debtToEquity !== null && fundamentals.debtToEquity <= 1.5
            ? "WARN"
            : "FAIL",
      details:
        fundamentals.debtToEquity === null
          ? "Debt/Equity unavailable."
          : `Debt/Equity ${fundamentals.debtToEquity.toFixed(2)}`,
      rationale: "Munger inversion: avoid fragility first.",
    },
    {
      name: "Margin of safety",
      status:
        (valuationCore.margin ?? -1) >= 0.25
          ? "PASS"
          : (valuationCore.margin ?? -1) >= 0.1
            ? "WARN"
            : "FAIL",
      details:
        valuationCore.margin === null
          ? "Intrinsic value unavailable."
          : `MOS ${(valuationCore.margin * 100).toFixed(2)}%`,
      rationale: "Buy at a meaningful discount to estimated value.",
    },
    {
      name: "Narrative risk scan",
      status: redFlags === 0 ? "PASS" : redFlags <= 2 ? "WARN" : "FAIL",
      details: `${redFlags} red-flag headline hits`,
      rationale: "Munger checklist: look for disconfirming evidence.",
    },
  ];

  const result: TickerAnalysisResult = {
    ticker: symbol,
    fetchedAt: new Date().toISOString(),
    meta: {
      dataMode,
      confidence: "HIGH",
      notes: modeNotes,
      missingFields: [],
      endpointStatus,
    },
    market,
    fundamentals,
    history,
    sentiment: {
      score: sentimentScore,
      coverage: sentimentCoverage,
      redFlags,
      headlines: newsHeadlines,
    },
    valuation: {
      intrinsicValue: valuationCore.intrinsic,
      marginOfSafety: valuationCore.margin,
      recommendation,
      qualityScore: clamp(quality, -1, 1),
      modelBreakdown: valuationCore.models,
      growthUsed: valuationCore.growth,
    },
    buffettMunger: {
      recommendation,
      scores: {
        moat: clamp(moat, -1, 1),
        quality: clamp(quality, -1, 1),
        predictability: clamp(predictability, -1, 1),
        management: clamp(management, -1, 1),
        risk: clamp(risk, -1, 1),
        sentiment: sentimentScore,
        marginOfSafety: valuationCore.margin ?? 0,
      },
      tests,
      wisdom: [
        "Price is what you pay, value is what you get.",
        "Rule No.1: Never lose money. Rule No.2: Never forget Rule No.1.",
        "Invert, always invert: identify how this investment could fail first.",
        "Prefer a wonderful business at a fair price over a fair business at a wonderful price.",
      ],
    },
    warnings,
  };

  const completenessSignals = [
    result.market.price !== null,
    result.fundamentals.eps !== null,
    result.fundamentals.bvps !== null,
    result.history.cagr10y !== null,
    result.history.monthlyVolatility !== null,
    result.valuation.intrinsicValue !== null,
  ];
  const completeness = completenessSignals.filter(Boolean).length / completenessSignals.length;
  if (result.meta.dataMode === "CACHED" || completeness < 0.45) {
    result.meta.confidence = "LOW";
  } else if (result.meta.dataMode === "MIXED" || completeness < 0.75) {
    result.meta.confidence = "MEDIUM";
  } else {
    result.meta.confidence = "HIGH";
  }
  if (completeness < 0.75 && result.meta.dataMode === "LIVE") {
    result.meta.dataMode = "MIXED";
    result.meta.notes.push("Incomplete live dataset detected; partial fallbacks applied.");
  }

  const cacheFilled: string[] = [];
  if (cached) {
    result.fundamentals = fillNullsFromCache(
      result.fundamentals,
      cached.fundamentals,
      cacheFilled,
      "fundamentals"
    );
    result.history = fillNullsFromCache(result.history, cached.history, cacheFilled, "history");
    if (!result.sentiment.coverage && cached.sentiment.coverage > 0) {
      result.sentiment = cached.sentiment;
      cacheFilled.push("sentiment");
    }
    if (
      (result.market.price === null || Number.isNaN(result.market.price)) &&
      cached.market.price !== null
    ) {
      result.market.price = cached.market.price;
      cacheFilled.push("market.price");
    }
    if (cacheFilled.length > 0) {
      result.meta.dataMode = "MIXED";
      result.meta.confidence = "MEDIUM";
      result.meta.notes.push(`Filled missing fields from cache: ${cacheFilled.join(", ")}`);
    }
  }

  if (result.valuation.intrinsicValue === null && result.market.price !== null) {
    const recalc = intrinsicValueEstimate(
      result.market.price,
      result.fundamentals,
      result.history.cagr10y,
      result.buffettMunger.scores.moat,
      result.sentiment.score
    );
    if (recalc.intrinsic !== null) {
      result.valuation.intrinsicValue = recalc.intrinsic;
      result.valuation.marginOfSafety = recalc.margin;
      result.valuation.modelBreakdown = recalc.models;
      result.valuation.growthUsed = recalc.growth;
      result.valuation.recommendation = recommendationFromWeighted(
        recalc.margin,
        result.buffettMunger.scores.moat,
        result.buffettMunger.scores.quality,
        result.buffettMunger.scores.predictability,
        result.buffettMunger.scores.management,
        result.buffettMunger.scores.risk,
        result.sentiment.score
      );
      result.buffettMunger.recommendation = result.valuation.recommendation;
      result.buffettMunger.scores.marginOfSafety = recalc.margin ?? 0;
      result.meta.notes.push("Recomputed valuation after cache merge.");
    }
  }

  const missingFields: string[] = [];
  if (result.fundamentals.eps === null) missingFields.push("fundamentals.eps");
  if (result.fundamentals.bvps === null) missingFields.push("fundamentals.bvps");
  if (result.history.cagr10y === null) missingFields.push("history.cagr10y");
  if (result.history.monthlyVolatility === null) missingFields.push("history.monthlyVolatility");
  if (result.valuation.intrinsicValue === null) missingFields.push("valuation.intrinsicValue");
  result.meta.missingFields = missingFields;

  if (result.market.price !== null && result.valuation.intrinsicValue !== null) {
    await writeTickerCache(result);
  }

  return result;
}
