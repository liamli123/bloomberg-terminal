"use client";

import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";
import { BloombergButton } from "../core/bloomberg-button";
import { useTickerAnalysis } from "../hooks";
import { bloombergColors } from "../lib/theme-config";
import type { MarketData } from "../types";

type BuffettMungerBoardViewProps = {
  isDarkMode: boolean;
  onBack: () => void;
  marketData?: MarketData;
  onRefresh: () => void;
  isLoading: boolean;
};

function scoreColor(score: number, colors: typeof bloombergColors.dark) {
  if (score >= 0.2) return colors.positive;
  if (score >= 0) return colors.accent;
  return colors.negative;
}

function badgeColor(mode: "LIVE" | "MIXED" | "CACHED", colors: typeof bloombergColors.dark) {
  if (mode === "LIVE") return colors.positive;
  if (mode === "MIXED") return colors.accent;
  return colors.negative;
}

export default function BuffettMungerBoardView({
  isDarkMode,
  onBack,
  onRefresh,
  isLoading,
}: BuffettMungerBoardViewProps) {
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
        <span className="text-sm font-bold">BUFFETT_MUNGER_BOARD</span>
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
          {error instanceof Error ? error.message : "Failed to load Buffett/Munger analysis."}
        </div>
      ) : isAnalysisLoading || !analysis ? (
        <div className="p-4 text-sm">Loading Buffett/Munger board for {analysisTicker}...</div>
      ) : (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-xs" style={{ color: colors.textSecondary }}>
                Recommendation
              </div>
              <div
                className="text-2xl font-bold"
                style={{
                  color: analysis.buffettMunger.recommendation.includes("BUY")
                    ? colors.positive
                    : analysis.buffettMunger.recommendation === "HOLD"
                      ? colors.accent
                      : colors.negative,
                }}
              >
                {analysis.buffettMunger.recommendation}
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
                className="text-2xl font-bold"
                style={{ color: scoreColor(analysis.buffettMunger.scores.marginOfSafety, colors) }}
              >
                {(analysis.buffettMunger.scores.marginOfSafety * 100).toFixed(2)}%
              </div>
            </div>
            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-xs" style={{ color: colors.textSecondary }}>
                Narrative Risk
              </div>
              <div className="text-sm mt-1">Sentiment: {analysis.sentiment.score.toFixed(3)}</div>
              <div className="text-sm">Red Flags: {analysis.sentiment.redFlags}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-sm font-bold mb-2">Munger Mental-Model Scorecard (-1..+1)</div>
              <div className="space-y-1 text-xs">
                <div>Moat: {analysis.buffettMunger.scores.moat.toFixed(3)}</div>
                <div>Quality: {analysis.buffettMunger.scores.quality.toFixed(3)}</div>
                <div>Predictability: {analysis.buffettMunger.scores.predictability.toFixed(3)}</div>
                <div>Management: {analysis.buffettMunger.scores.management.toFixed(3)}</div>
                <div>Risk: {analysis.buffettMunger.scores.risk.toFixed(3)}</div>
                <div>Sentiment: {analysis.buffettMunger.scores.sentiment.toFixed(3)}</div>
              </div>
            </div>

            <div
              className="border p-3"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <div className="text-sm font-bold mb-2">Buffett/Munger Tests</div>
              <div className="space-y-2 text-xs">
                {analysis.buffettMunger.tests.map((test) => (
                  <div
                    key={test.name}
                    className="border p-2"
                    style={{ borderColor: colors.border }}
                  >
                    <div className="flex justify-between">
                      <span className="font-bold">{test.name}</span>
                      <span
                        style={{
                          color:
                            test.status === "PASS"
                              ? colors.positive
                              : test.status === "WARN" || test.status === "MANUAL"
                                ? colors.accent
                                : colors.negative,
                        }}
                      >
                        {test.status}
                      </span>
                    </div>
                    <div>{test.details}</div>
                    <div style={{ color: colors.textSecondary }}>{test.rationale}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="border p-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <div className="text-sm font-bold mb-2">Famous Wisdom Applied</div>
            <div className="space-y-1 text-xs">
              {analysis.buffettMunger.wisdom.map((line) => (
                <div key={line}>- {line}</div>
              ))}
            </div>
          </div>

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

          <div
            className="border p-3"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <div className="text-sm font-bold mb-2">Headline Diagnostics</div>
            <div className="space-y-2 text-xs">
              {analysis.sentiment.headlines.slice(0, 8).map((item) => (
                <div
                  key={`${item.time_published}-${item.title}`}
                  className="border p-2"
                  style={{ borderColor: colors.border }}
                >
                  <div className="font-bold">{item.title}</div>
                  <div style={{ color: colors.textSecondary }}>{item.source}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
