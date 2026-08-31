/* ------------------------------------------------ */
/* TICKET COLOR CODING – SHARED UTILITY             */
/* ------------------------------------------------ */

/**
 * Calculates remaining hours from a commit date string.
 * Prefers revised_commit_date, falls back to commit_date.
 */
export function getRemainingMs(ticket: Record<string, any>): number | null {
    const dateStr =
        ticket.revised_commit_date ??
        ticket.revisedCommitDate ??
        ticket.commit_date ??
        ticket.commitDate ??
        null;

    if (!dateStr) return null;

    const target = new Date(dateStr).getTime();
    if (!Number.isFinite(target)) return null;

    return target - Date.now();
}

/**
 * Returns a human-readable remaining time string.
 * - hours (floor) if >= 1h
 * - minutes if < 1h
 * - negative values shown as "Überfällig Xh" / "Xm"
 */
export function formatRemainingTime(ms: number | null): string {
    if (ms === null) return "—";

    const totalMinutes = Math.floor(Math.abs(ms) / 60_000);
    let h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;

    const prefix = ms < 0 ? "-" : "";

    // If more than 24 hours, show days and hours (e.g. "1d 5h")
    if (h >= 24) {
        const d = Math.floor(h / 24);
        h = h % 24;
        return `${prefix}${d}d ${h}h`;
    }

    if (h >= 1) return `${prefix}${h}h ${m}m`;
    return `${prefix}${m}m`;
}

/**
 * Color tier based on remaining milliseconds.
 * Expired (ms < 0) → "grey"  (pushed to bottom)
 * 0–8h             → "red"
 * 8–15h            → "orange"
 * 15–24h           → "yellow"
 * > 24h            → "green"
 * null             → "grey"
 */
export type ColorTier = "green" | "yellow" | "orange" | "red" | "grey";

export function getColorTier(ms: number | null): ColorTier {
    if (ms === null) return "grey";
    const hours = ms / 3_600_000;

    if (hours < 0) return "grey";       // Overdue → bottom
    if (hours <= 8) return "red";       // 0–8h
    if (hours <= 15) return "orange";   // 8–15h
    if (hours <= 24) return "yellow";   // 15–24h
    return "green";                     // > 24h
}

/**
 * Sort key: expired tickets go to the very end.
 * Otherwise sort ascending (soonest deadline first).
 */
export function getTicketSortKey(ms: number | null): number {
    if (ms === null) return Number.MAX_SAFE_INTEGER;
    if (ms < 0) return Number.MAX_SAFE_INTEGER - Math.abs(ms); // expired last, but ordered among themselves
    return ms;
}

/**
 * Tailwind classes for tile background + border per tier.
 */
export const tierClasses: Record<ColorTier, string> = {
    green:  "bg-green-500/10 border-green-400/25",
    yellow: "bg-yellow-500/10 border-yellow-400/25",
    orange: "bg-orange-500/10 border-orange-400/25",
    red:    "bg-red-500/10 border-red-400/25",
    grey:   "bg-gray-500/10 border-gray-400/20",
};

/**
 * Enterprise glow shadow per tier — subtle but clearly professional.
 */
export const tierGlow: Record<ColorTier, string> = {
    green:  "shadow-[0_0_16px_2px_rgba(34,197,94,0.18),0_2px_8px_rgba(0,0,0,0.4)]",
    yellow: "shadow-[0_0_16px_2px_rgba(234,179,8,0.18),0_2px_8px_rgba(0,0,0,0.4)]",
    orange: "shadow-[0_0_16px_2px_rgba(249,115,22,0.22),0_2px_8px_rgba(0,0,0,0.4)]",
    red:    "shadow-[0_0_20px_3px_rgba(239,68,68,0.28),0_2px_8px_rgba(0,0,0,0.4)]",
    grey:   "shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
};

/**
 * One-call convenience: ticket → CSS classes.
 */
export function getTicketClasses(ticket: Record<string, any>): string {
    const ms = getRemainingMs(ticket);
    const tier = getColorTier(ms);
    return `${tierClasses[tier]} ${tierGlow[tier]}`;
}

export function getTicketTierClasses(ticket: Record<string, any>): string {
    return tierClasses[getColorTier(getRemainingMs(ticket))];
}
