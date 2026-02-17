"use client";

import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { queryKeys } from "../api/query-keys";
import { analysisTickerAtom } from "../atoms";

type AnalysisResponse = {
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
    headlines: Array<{
      title: string;
      summary: string;
      source: string;
      time_published: string;
      overall_sentiment_score?: number;
    }>;
  };
  valuation: {
    intrinsicValue: number | null;
    marginOfSafety: number | null;
    recommendation: string;
    qualityScore: number;
    modelBreakdown: Record<string, number>;
    growthUsed: number;
  };
  buffettMunger: {
    recommendation: string;
    scores: {
      moat: number;
      quality: number;
      predictability: number;
      management: number;
      risk: number;
      sentiment: number;
      marginOfSafety: number;
    };
    tests: Array<{
      name: string;
      status: "PASS" | "WARN" | "FAIL" | "MANUAL";
      details: string;
      rationale: string;
    }>;
    wisdom: string[];
  };
  warnings: string[];
};

async function fetchTickerAnalysis(
  ticker: string,
  opts?: { includeNews?: boolean; force?: boolean }
): Promise<AnalysisResponse> {
  const params = new URLSearchParams({ ticker });
  if (opts?.includeNews) params.set("includeNews", "1");
  if (opts?.force) params.set("force", "1");
  const response = await fetch(`/api/ticker-analysis?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.details || body?.error || `Request failed (${response.status})`);
  }
  return response.json();
}

export function useTickerAnalysis() {
  const [analysisTicker, setAnalysisTicker] = useAtom(analysisTickerAtom);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.tickerAnalysis.detail(analysisTicker),
    queryFn: () => fetchTickerAnalysis(analysisTicker, { includeNews: false, force: false }),
    enabled: !!analysisTicker,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  const refreshCore = async () => {
    const data = await fetchTickerAnalysis(analysisTicker, { includeNews: false, force: true });
    queryClient.setQueryData(queryKeys.tickerAnalysis.detail(analysisTicker), data);
    return data;
  };

  const refreshWithNews = async () => {
    const data = await fetchTickerAnalysis(analysisTicker, { includeNews: true, force: true });
    queryClient.setQueryData(queryKeys.tickerAnalysis.detail(analysisTicker), data);
    return data;
  };

  return {
    analysisTicker,
    setAnalysisTicker,
    analysis: query.data,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    refreshCore,
    refreshWithNews,
  };
}
