/* ------------------------------------------------ */
/* TV TYPES                                         */
/* ------------------------------------------------ */

export type TvPriority = "Critical" | "High" | "Medium" | "Low";

export type TvStatus = "Offen" | "Übernommen" | "Erledigt";

/* ------------------------------------------------ */
/* HANDOVER                                         */
/* ------------------------------------------------ */

export interface TvHandover {
  id: number;
  title?: string;
  ticketNumber: string;
  priority: TvPriority;
  area: string;
  customerName?: string;
  commitDate?: string | null;
  commitTime?: string | null;
  status: TvStatus;
  description: string;
  createdBy: string;
  createdAt?: string;
  takenBy?: string | null;
}

/* ------------------------------------------------ */
/* SHIFTPLAN                                        */
/* ------------------------------------------------ */

export type TvShiftEmployee = {
  name: string;
  shift: string;
  time: string;
  weekplanRole?: string | null;
  jarvisDisplayName?: string | null;
  jarvisOwnerCode?: string | null;
  jarvisInitials?: string | null;
  info: {
    color: string;
  };
  category?: string;
};

/* ------------------------------------------------ */
/* COMPONENT PROPS                                  */
/* ------------------------------------------------ */

export interface TvCardsProps {
  now: Date;
  earlyCount: number;
  lateCount: number;
  nightCount: number;
}

export interface TvShiftplanProps {
  early?: TvShiftEmployee[];
  late?: TvShiftEmployee[];
  night?: TvShiftEmployee[];
  counts?: { early: number; late: number; night: number };
  ticketsByOwner?: Map<string, any[]>;
  crawlerStale?: boolean;
}

export interface TvHandoverListProps {
  handovers?: TvHandover[];
}

export interface TvLayoutProps {
  now: Date;
  early?: TvShiftEmployee[];
  late?: TvShiftEmployee[];
  night?: TvShiftEmployee[];
  handovers?: TvHandover[];
  isFullscreen?: boolean;
  crawlerStale?: boolean;
}
