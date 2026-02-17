"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";
import { BloombergButton } from "../core/bloomberg-button";
import { useTickerAnalysis } from "../hooks";
import { bloombergColors } from "../lib/theme-config";
import type { MarketData } from "../types";

type ValueInvestorValuationViewProps = {
  isDarkMode: boolean;
  onBack: () => void;
  marketData?: MarketData;
  onRefresh: () => void;
  isLoading: boolean;
};

function formatPct(value: number | null) {
  if (value === null || Number.isNaN(value)) return "N/A";
  return `${(value * 100).toFixed(2)}%`;
}

function formatNum(value: number | null, digits = 2) {
  if (value === null || Number.isNaN(value)) return "N/A";
  return value.toFixed(digits);
}

function badgeColor(mode: "LIVE" | "MIXED" | "CACHED", colors: typeof bloombergColors.dark) {
  if (mode === "LIVE") return colors.positive;
  if (mode === "MIXED") return colors.accent;
  return colors.negative;
}

export default function ValueInvestorValuationView({
  isDarkMode,
  onBack,
  onRefresh,
  isLoading,
}: ValueInvestorValuationViewProps) {
  const colors = isDarkMode ? bloombergColors.dark : bloombergColors.light;
  const {
    analysisTicker,
    setAnalysisTicker,
    analysis,
    isLoading: isAnalysisLoading,
    error,
    refreshCore,
    refreshWithNews,
  } = useTickerAnalysis();
  const [draftTicker, setDraftTicker] = useState(analysisTicker);

  const submitTicker = () => {
    const next = draftTicker.trim().toUpperCase();
    if (!next) return;
    setAnalysisTicker(next);
  };

  return (
    <div
      className="min-h-screen font-mono"
      style={{ backgroundColor: colors.background, color: colors.text }}
    >
      <div
        className="flex items-center gap-2 px-2 py-1"
        style={{ backgroundColor: colors.surface }}
      >
        <BloombergButton color="default" onClick={onBack}>
          <ArrowLeft className="h-3 w-3 mr-1" />
          BACK
        </BloombergButton>
        <span className="text-sm font-bold">VALUE INVESTOR VALUATION</span>
        <div className="ml-auto flex items-center gap-2">
          <BloombergButton color="accent" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "MKT REFR"}
          </BloombergButton>
          <BloombergButton
            color="accent"
            onClick={() => refreshCore()}
            disabled={isAnalysisLoading}
          >
            {isAnalysisLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "ANLZ REFR"}
          </BloombergButton>
          <BloombergButton
            color="accent"
            onClick={() => refreshWithNews()}
            disabled={isAnalysisLoading}
          >
            {isAnalysisLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "NEWS REFR"}
          </BloombergButton>
        </div>
      </div>

      <div
        className="p-3 flex flex-wrap items-center gap-2 text-xs"
        style={{ backgroundColor: colors.surface }}
      >
        <span>Ticker:</span>
        <input
          value={draftTicker}
          onChange={(e) => setDraftTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitTicker();
          }}
          className="h-7 w-32 px-2 border text-xs uppercase"
          style={{
            backgroundColor: colors.background,
            borderColor: colors.border,
            color: colors.text,
          }}
          placeholder="AAPL"
        />
        <BloombergButton color="green" onClick={submitTicker}>
          LOAD
        </BloombergButton>
        <span style={{ color: colors.textSecondary }}>Loaded: {analysisTicker}</span>
        {analysis && (
          <span
            className="px-2 py-1 border text-[10px] font-bold"
            style={{
              borderColor: badgeColor(analysis.meta.dataMode, colors),
              color: badgeColor(analysis.meta.dataMode, colors),
            }}
          >
            {analysis.meta.dataMode} / {analysis.meta.confidence}
          </span>
        )}
      </div>

      {error ? (
        <div className="p-4 text-sm" style={{ color: colors.negative }}>
          {error instanceof Error ? error.message : "Failed to load ticker analysis."}
        </div>
      ) : isAnalysisLoading || !analysis ? (
        <div className="p-4 text-sm">Loading valuation model for {analysisTicker}...</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-xs" style={{ color: colors.textSecondary }}>
                Price
              </div>
              <div className="text-xl font-bold">{formatNum(analysis.market.price)}</div>
            </div>
            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-xs" style={{ color: colors.textSecondary }}>
                Intrinsic Value
              </div>
              <div className="text-xl font-bold">
                {formatNum(analysis.valuation.intrinsicValue)}
              </div>
            </div>
            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-xs" style={{ color: colors.textSecondary }}>
                Margin of Safety
              </div>
              <div
                className="text-xl font-bold"
                style={{
                  color:
                    (analysis.valuation.marginOfSafety || 0) >= 0
                      ? colors.positive
                      : colors.negative,
                }}
              >
                {formatPct(analysis.valuation.marginOfSafety)}
              </div>
            </div>
            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-xs" style={{ color: colors.textSecondary }}>
                Recommendation
              </div>
              <div
                className="text-xl font-bold"
                style={{
                  color: analysis.valuation.recommendation.includes("BUY")
                    ? colors.positive
                    : analysis.valuation.recommendation === "HOLD"
                      ? colors.accent
                      : colors.negative,
                }}
              >
                {analysis.valuation.recommendation}
              </div>
            </div>
          </div>

          <div
            className="border p-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <div className="text-sm font-bold mb-2">Full Valuation Model</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              <div>Growth Used: {formatPct(analysis.valuation.growthUsed)}</div>
              <div>Quality Score: {analysis.valuation.qualityScore.toFixed(3)}</div>
              {Object.entries(analysis.valuation.modelBreakdown).map(([key, value]) => (
                <div key={key}>
                  Model [{key}]: {value.toFixed(2)}
                </div>
              ))}
            </div>
          </div>

          <div
            className="border p-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <div className="text-sm font-bold mb-2">Fundamentals Used</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div>EPS: {formatNum(analysis.fundamentals.eps, 3)}</div>
              <div>Book Value/Share: {formatNum(analysis.fundamentals.bvps, 3)}</div>
              <div>P/E: {formatNum(analysis.fundamentals.pe, 2)}</div>
              <div>P/B: {formatNum(analysis.fundamentals.pb, 2)}</div>
              <div>ROE: {formatPct(analysis.fundamentals.roe)}</div>
              <div>ROIC Proxy: {formatPct(analysis.fundamentals.roic)}</div>
              <div>Debt/Equity: {formatNum(analysis.fundamentals.debtToEquity, 2)}</div>
              <div>Current Ratio: {formatNum(analysis.fundamentals.currentRatio, 2)}</div>
              <div>Dividend Yield: {formatPct(analysis.fundamentals.dividendYield)}</div>
            </div>
          </div>

          <div
            className="border p-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <div className="text-sm font-bold mb-2">History and Sentiment Inputs</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div>10Y CAGR: {formatPct(analysis.history.cagr10y)}</div>
              <div>Max Drawdown: {formatPct(analysis.history.maxDrawdown)}</div>
              <div>Monthly Volatility: {formatPct(analysis.history.monthlyVolatility)}</div>
              <div>Positive Month Ratio: {formatPct(analysis.history.positiveMonthRatio)}</div>
              <div>Sentiment Score: {analysis.sentiment.score.toFixed(3)}</div>
              <div>News Coverage: {analysis.sentiment.coverage}</div>
            </div>
          </div>

          {analysis.warnings.length > 0 && (
            <div
              className="border p-3 text-xs"
              style={{ borderColor: colors.negative, color: colors.negative }}
            >
              {analysis.warnings.map((warning) => (
                <div key={warning}>- {warning}</div>
              ))}
            </div>
          )}

          {analysis.meta.notes.length > 0 && (
            <div
              className="border p-3 text-xs"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="font-bold mb-1">Data Source Notes</div>
              {analysis.meta.notes.map((note) => (
                <div key={note}>- {note}</div>
              ))}
              <div className="font-bold mt-2 mb-1">Endpoint Status</div>
              {Object.entries(analysis.meta.endpointStatus).map(([name, status]) => (
                <div key={name}>
                  - {name}: {status}
                </div>
              ))}
              {analysis.meta.missingFields.length > 0 && (
                <>
                  <div className="font-bold mt-2 mb-1">Missing Fields</div>
                  {analysis.meta.missingFields.map((field) => (
                    <div key={field}>- {field}</div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
