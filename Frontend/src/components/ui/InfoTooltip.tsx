/* ------------------------------------------------ */
/* INFO TOOLTIP – Reusable explanation hover card   */
/* Used across ODIN Logic and Teams Center          */
/* ------------------------------------------------ */

import { HoverCard, HoverCardTrigger, HoverCardContent } from "./hover-card";
import { HelpCircle } from "lucide-react";

interface InfoTooltipProps {
  /** Main title shown bold at the top */
  title?: string;
  /** Multi-line explanation content */
  children: React.ReactNode;
  /** Icon size - default 14px */
  size?: number;
  /** Additional CSS classes for the trigger icon */
  className?: string;
  /** Alignment of the popup */
  align?: "start" | "center" | "end";
  /** Side */
  side?: "top" | "right" | "bottom" | "left";
  /** Width class - default w-80 */
  width?: string;
}

/**
 * InfoTooltip – hover-triggered explanation card.
 *
 * Usage:
 * <InfoTooltip title="Crawler Max-Alter">
 *   <p>Legt fest, wie alt die zuletzt eingegangenen Crawler-Daten maximal sein dürfen...</p>
 * </InfoTooltip>
 */
export function InfoTooltip({
  title,
  children,
  size = 14,
  className = "",
  align = "center",
  side = "top",
  width = "w-80",
}: InfoTooltipProps) {
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded-sm ${className}`}
          aria-label={title ? `Info: ${title}` : "Weitere Informationen"}
        >
          <HelpCircle style={{ width: size, height: size }} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align={align}
        side={side}
        className={`${width} theme-popover-surface rounded-xl border p-4 text-sm shadow-2xl space-y-2 z-[100]`}
      >
        {title && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
            {title}
          </div>
        )}
        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
