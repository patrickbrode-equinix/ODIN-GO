/* ------------------------------------------------ */
/* COMMIT – TABLE (VIRTUAL + CLEAN + SKELETON)      */
/* ------------------------------------------------ */

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Badge } from "../ui/badge";
import { EnrichedCommitTicket } from "./commit.types";
import { formatDateDE, calcCommitHours, getActivityIcon } from "./commit.logic";

/* ------------------------------------------------ */
/* CONFIG                                           */
/* ------------------------------------------------ */

const ROW_HEIGHT = 56;
const SKELETON_ROWS = 12;

interface Props {
  tickets: EnrichedCommitTicket[];
}

/* ------------------------------------------------ */
/* HELPERS (VISUAL ONLY)                            */
/* ------------------------------------------------ */

function getRemainingColor(ticket: EnrichedCommitTicket): string {
  const h = calcCommitHours(ticket);

  if (h === null) return "text-muted-foreground";
  if (h < 0) return "text-zinc-500";
  if (h < 4) return "text-red-500 font-semibold";
  if (h < 8) return "text-orange-400 font-semibold";
  if (h < 24) return "text-emerald-400 font-semibold";

  return "text-sky-400";
}

function formatRemainingTime(ticket: EnrichedCommitTicket): string {
  const hours = calcCommitHours(ticket);
  if (hours === null) return "";

  const abs = Math.abs(hours);
  const totalMinutes = Math.floor(abs * 60);

  const days = Math.floor(totalMinutes / (60 * 24));
  const remainingMinutes = totalMinutes - days * 24 * 60;
  const h = Math.floor(remainingMinutes / 60);
  const m = remainingMinutes % 60;

  return `${hours < 0 ? "-" : ""}${days} Days, ${h}h ${m}m`;
}

function safeFormatDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  return !isNaN(d.getTime()) ? formatDateDE(d) : value;
}

function getRowGlowStyle(ticket: EnrichedCommitTicket): React.CSSProperties {
  const h = calcCommitHours(ticket);
  if (h === null || h > 48) return {};

  const typeStr = (ticket.activityType || "") + " " + (ticket.activitySubType || "");
  const lower = typeStr.toLowerCase();

  let rgb = "56, 189, 248"; // default: sky-400
  if (lower.includes("trouble")) {
    rgb = "249, 115, 22"; // orange-500
  } else if (lower.includes("smart")) {
    rgb = "52, 211, 153"; // emerald-400
  } else if (lower.includes("cc")) {
    rgb = "167, 139, 250"; // violet-400
  }

  let opacity = 0;
  let spread = 0;
  let blur = 0;

  if (h < 0) {
    opacity = 0.6;
    spread = 1;
    blur = 12;
  } else if (h <= 12) {
    opacity = 0.35;
    spread = 0;
    blur = 10;
  } else if (h <= 24) {
    opacity = 0.2;
    spread = 0;
    blur = 6;
  } else if (h <= 48) {
    opacity = 0.1;
    spread = 0;
    blur = 4;
  }

  if (opacity === 0) return {};

  return {
    boxShadow: `inset 4px 0 0 rgba(${rgb}, 0.8), inset 0 0 ${blur}px ${spread}px rgba(${rgb}, ${opacity})`
  };
}

/* ------------------------------------------------ */
/* SKELETON ROW                                     */
/* ------------------------------------------------ */

function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 px-4 border-b border-border/40 animate-pulse"
      style={{ height: ROW_HEIGHT }}
    >
      {Array.from({ length: 14 }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted/40 rounded"
          style={{ width: 80 + (i % 3) * 40 }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function CommitTable({ tickets }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const isLoading = tickets.length === 0;

  const rowVirtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="h-full flex flex-col">
      {/* ================= HEADER ================= */}
      <div className="border-b border-border bg-accent/50">
        <table className="w-full text-sm table-fixed">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-4 py-3 w-[80px] text-left">IBX</th>
              <th className="px-4 py-3 w-[220px] text-left">System</th>
              <th className="px-4 py-3 w-[140px] text-left">Group</th>
              <th className="px-4 py-3 w-[140px] text-left">SO</th>
              <th className="px-4 py-3 w-[180px] text-left">Activity</th>
              <th className="px-4 py-3 w-[160px] text-left">Type</th>
              <th className="px-4 py-3 w-[220px] text-left">Sub-Type</th>
              <th className="px-4 py-3 w-[160px] text-left">Product</th>
              <th className="px-4 py-3 w-[160px] text-left">Serial</th>
              <th className="px-4 py-3 w-[180px] text-left">Maint.</th>
              <th className="px-4 py-3 w-[180px] text-left">Commit</th>
              <th className="px-4 py-3 w-[160px] text-left">Remaining</th>
              <th className="px-4 py-3 w-[180px] text-left">Status</th>
              <th className="px-4 py-3 w-[160px] text-left">Owner</th>
            </tr>
          </thead>
        </table>
      </div>

      {/* ================= BODY ================= */}
      <div ref={parentRef} className="flex-1 overflow-y-auto relative">
        {isLoading ? (
          <div>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : (
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((row) => {
              const t = tickets[row.index];
              const activityIcon = getActivityIcon(t.activitySubType);

              return (
                <div
                  key={t.id}
                  className="absolute left-0 w-full border-b border-border/40 hover:bg-accent/30"
                  style={{
                    transform: `translateY(${row.start}px)`,
                    height: ROW_HEIGHT,
                    ...getRowGlowStyle(t)
                  }}
                >
                  <table className="w-full text-sm table-fixed">
                    <tbody>
                      <tr>
                        <td className="px-4 py-3 w-[80px] truncate">{t.ibx}</td>
                        <td className="px-4 py-3 w-[220px] truncate font-medium">
                          {t.systemName}
                        </td>
                        <td className="px-4 py-3 w-[140px] truncate">{t.group}</td>
                        <td className="px-4 py-3 w-[140px] truncate">{t.salesOrder}</td>

                        <td className="px-4 py-3 w-[180px]">
                          <div className="flex items-center gap-2 truncate">
                            {t.activityNumber}
                            {activityIcon && (
                              <img
                                src={activityIcon}
                                alt=""
                                className="w-10 h-10 shrink-0"
                              />
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 w-[160px] truncate">{t.activityType}</td>

                        <td className="px-4 py-3 w-[220px] truncate">
                          <div className="flex items-center gap-2">
                            {t.activitySubType}
                            {t.isComplianceRelevant && (
                              <Badge variant="secondary">Compliance</Badge>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 w-[160px] truncate">{t.product}</td>
                        <td className="px-4 py-3 w-[160px] truncate">{t.serialNumber}</td>

                        <td className="px-4 py-3 w-[180px] truncate text-muted-foreground">
                          {safeFormatDate(t.maintenanceStart)}
                        </td>
                        <td className="px-4 py-3 w-[180px] truncate text-muted-foreground">
                          {safeFormatDate(t.commitDate)}
                        </td>

                        <td className="px-4 py-3 w-[160px]">
                          <span className={getRemainingColor(t)}>
                            {formatRemainingTime(t)}
                          </span>
                        </td>

                        <td className="px-4 py-3 w-[180px] truncate">{t.activityStatus}</td>
                        <td className="px-4 py-3 w-[160px] truncate">{t.owner}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
