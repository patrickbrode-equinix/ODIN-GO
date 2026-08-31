/* ------------------------------------------------ */
/* TV Config API Client                             */
/* ------------------------------------------------ */

import { api } from "./api";

export interface TvSlideConfig {
  slide_id: string;
  label: string;
  enabled: boolean;
  duration_ms: number;
  sort_order: number;
  only_if_data: boolean;
  updated_by?: string;
  updated_at?: string;
}

/** Fetch slide config (public, for TV kiosk) */
export async function fetchTvSlideConfig(): Promise<TvSlideConfig[]> {
  const { data } = await api.get("/tv/config");
  return data;
}

/** Update all slide configs */
export async function updateTvSlideConfig(slides: Partial<TvSlideConfig>[]): Promise<TvSlideConfig[]> {
  const { data } = await api.put("/tv/config", slides);
  return data;
}

/** Update a single slide */
export async function updateSingleSlide(slideId: string, update: Partial<TvSlideConfig> & { change_note?: string }): Promise<TvSlideConfig> {
  const { data } = await api.patch(`/tv/config/${slideId}`, update);
  return data;
}
