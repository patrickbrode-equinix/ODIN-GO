import { api } from "./api";

export type MarketQuote = {
  symbol: string;
  available: boolean;
  currency: string | null;
  marketState: string | null;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  asOf: string | null;
  source: string | null;
  cached: boolean;
  stale: boolean;
};

export type MarketHistory = {
  symbol: string;
  available: boolean;
  currency: string | null;
  range: "12m";
  points: Array<{ date: string; price: number }>;
  firstPrice: number | null;
  lastPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  change: number | null;
  changePercent: number | null;
  asOf: string | null;
  source: string | null;
  cached: boolean;
  stale: boolean;
};

export async function fetchEqixQuote() {
  const { data } = await api.get<MarketQuote>("/market/eqix");
  return data;
}

export async function fetchEqixHistory() {
  const { data } = await api.get<MarketHistory>("/market/eqix/history");
  return data;
}
