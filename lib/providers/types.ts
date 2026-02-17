export interface ProviderQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface ProviderIntradayPoint {
  timestamp: string;
  close: number;
}

export interface ProviderHistoricalPoint {
  date: string;
  close: number;
  adjustedClose?: number;
}

export interface ProviderFundamentals {
  eps: number | null;
  bookValue: number | null;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  roa: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  dividendYield: number | null;
  freeCashFlowPerShare: number | null;
  analystTargetPrice: number | null;
  sharesOutstanding: number | null;
  totalRevenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalEquity: number | null;
  totalLiabilities: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
}

export interface ProviderNewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  sentimentScore?: number;
  authors?: string[];
  imageUrl?: string;
  sourceDomain?: string;
  topics?: Array<{ topic: string; relevanceScore: string }>;
}

export interface ProviderEarningsQuarter {
  fiscalDate: string;
  reportedEPS: number | null;
}
