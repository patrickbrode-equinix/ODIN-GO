/* ------------------------------------------------ */
/* HANDOVER – ITEM                                  */
/* ------------------------------------------------ */

import { memo } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { CheckCircle, Trash2, Undo2, UserCheck, Clock, ArrowRight, Calendar, Repeat } from "lucide-react";
import { HandoverItem as Item } from "./handover.types";
import {
  formatCommitDate,
  formatCommitTime,
  getPriorityColor,
  getPriorityIcon,
  formatUserDisplay,
} from "./handover.utils";
import { formatTimestamp } from "../../utils/dateFormat";
import { HandoverFiles } from "./HandoverFiles";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

interface Props {
  handover: Item;
  showCompleted: boolean;
  currentUser: string;
  onTakeOver: (id: number) => void;
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

function HandoverItemComponent({
  handover,
  showCompleted,
  currentUser,
  onTakeOver,
  onComplete,
  onDelete,
  onRestore,
}: Props) {
  const isOptimistic = handover.id < 0;
  const { t } = useLanguage();

  const isTakenByOther =
    !!handover.takenBy && handover.takenBy !== currentUser;

  const isInProgress =
    handover.status === "In Bearbeitung" ||
    handover.status === "Übernommen";

  const isDone = handover.status === "Erledigt";

  const disabledReason = isOptimistic
    ? t("handover.syncing")
    : isTakenByOther
      ? t("handover.alreadyTaken")
      : undefined;

  // Color Coding based on Type
  const typeColors = {
    "Workload": "border-l-4 border-l-blue-500 bg-blue-500/5",
    "Terminiert": "border-l-4 border-l-purple-500 bg-purple-500/5",
    "Other Teams": "border-l-4 border-l-orange-500 bg-orange-500/5",
    "Task": "border-l-4 border-l-green-500 bg-green-500/5",
    "Manual": "border-l-4 border-l-gray-500 bg-gray-500/5"
  };

  const typeColorClass = typeColors[handover.type] || "border-l-4 border-l-gray-500";

  return (
    <div
      className={`p-4 rounded-lg shadow-sm mb-3 transition-all border border-border/50 ${typeColorClass} ${isDone ? "opacity-60 grayscale" : ""}`}
    >
      {/* ------------------------------------------------ */}
      {/* HEADER ROW                                      */}
      {/* ------------------------------------------------ */}
      <div className="flex justify-between items-start gap-4 mb-2">
        <div className="flex items-center gap-3 overflow-hidden">

          {/* TYPE BADGE */}
          <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-bold">
            {handover.type}
          </Badge>

          {/* TICKET ID (IF EXISTS) */}
          {handover.ticketNumber && (
            <span className="font-mono font-bold text-lg">{handover.ticketNumber}</span>
          )}

          {/* TICKET TYPE & PRIO */}
          {handover.ticketType && <Badge variant="secondary" className="text-[10px]">{handover.ticketType}</Badge>}

          {handover.priority !== "Low" && (
            <Badge className={`${getPriorityColor(handover.priority)} text-white border-0 text-[10px]`}>
              {handover.priority}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
          {handover.createdAt && <span>{new Date(handover.createdAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</span>}
          <HandoverFiles files={handover.files ?? []} />
        </div>
      </div>

      {/* ------------------------------------------------ */}
      {/* MAIN CONTENT GRID                               */}
      {/* ------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-2">

        {/* LEFT: INFO & DESCRIPTION (8 Cols) */}
        <div className="md:col-span-8 space-y-2">

          {/* 1. Ticket Meta Data Row */}
          {(handover.ticketNumber) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {handover.systemName && (
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-foreground">{handover.systemName}</span>
                </div>
              )}
              {handover.activity && (
                <div className="flex items-center gap-1">
                  <span>|</span>
                  <span>{handover.activity}</span>
                </div>
              )}
              {handover.customerName && (
                <div className="flex items-center gap-1 text-blue-400">
                  <span>|</span>
                  <span>{handover.customerName}</span>
                </div>
              )}
            </div>
          )}

          {/* 2. SPECIFIC FIELDS ROW */}
          <div className="flex flex-wrap gap-3 text-sm font-medium">
            {/* COMMIT / REMAINING */}
            {handover.commitAt && (
              <div className={`flex items-center gap-1 ${handover.remainingTime?.includes("-") ? "text-red-400" : "text-green-400"}`}>
                <Clock className="w-4 h-4" />
                <span>{formatCommitDate(handover.commitAt)} {formatCommitTime(handover.commitAt)}</span>
                {handover.remainingTime && <span>({handover.remainingTime})</span>}
              </div>
            )}

            {/* START DATE (Terminiert) */}
            {handover.startDatetime && (
              <div className="flex items-center gap-1 text-purple-400">
                <Calendar className="w-4 h-4" />
                <span>Start: {new Date(handover.startDatetime).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</span>
              </div>
            )}

            {/* TARGET TEAM (Other Teams) */}
            {handover.targetTeam && (
              <div className="flex items-center gap-1 text-orange-400">
                <ArrowRight className="w-4 h-4" />
                <span>To: {handover.targetTeam}</span>
              </div>
            )}

            {/* ASSIGNEE & DUE DATE (Task) */}
            {handover.assigneeName && (
              <div className="flex items-center gap-1 text-blue-400">
                <UserCheck className="w-4 h-4" />
                <span>Assigned: {handover.assigneeName}</span>
              </div>
            )}
            {handover.dueDatetime && (
              <div className="flex items-center gap-1 text-red-400">
                <Clock className="w-4 h-4" />
                <span>Due: {new Date(handover.dueDatetime).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}</span>
              </div>
            )}
            {handover.recurrence && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Repeat className="w-4 h-4" />
                <span>{handover.recurrence}</span>
              </div>
            )}
          </div>

          {/* 3. DESCRIPTION */}
          <div className="mt-2 text-sm whitespace-pre-wrap bg-white/5 p-2 rounded border border-white/5">
            {handover.description}
          </div>
        </div>


        {/* RIGHT: ACTIONS & STATUS (4 Cols) */}
        <div className="md:col-span-4 flex flex-col justify-between items-end gap-2">

          <div className="text-xs text-muted-foreground text-right w-full">
            <div>Created by <span className="text-foreground">{formatUserDisplay(handover.createdBy)}</span></div>
            {handover.takenBy && (
              <div className="mt-1">
                {isDone ? "Completed by " : "Taken by "}
                <span className={`${isDone ? "text-green-400" : "text-blue-400"} font-bold`}>
                  {formatUserDisplay(handover.takenBy)}
                </span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-2 w-full justify-end">
            {/* OFFEN */}
            {handover.status === "Offen" && (
              <Button
                size="sm"
                variant="outline"
                className="w-full md:w-auto"
                disabled={isOptimistic || isTakenByOther}
                title={disabledReason}
                onClick={() => onTakeOver(handover.id)}
              >
                <UserCheck className="w-4 h-4 mr-1" />
                {t("handover.takeOver")}
              </Button>
            )}

            {/* IN PROGRESS */}
            {(handover.status === "In Bearbeitung" || handover.status === "Übernommen") && !isDone && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 w-full md:w-auto"
                disabled={isOptimistic}
                title={disabledReason}
                onClick={() => onComplete(handover.id)}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                {t("handover.done")}
              </Button>
            )}

            {/* ERLEDIGT */}
            {isDone && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isOptimistic}
                  title={disabledReason}
                  onClick={() => onRestore(handover.id)}
                >
                  <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                  disabled={isOptimistic}
                  title={disabledReason}
                  onClick={() => onDelete(handover.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

/* ------------------------------------------------ */
/* MEMO EXPORT                                      */
/* ------------------------------------------------ */

export const HandoverItem = memo(HandoverItemComponent);
