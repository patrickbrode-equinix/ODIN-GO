/* ------------------------------------------------ */
/* HANDOVER – PAGE                                  */
/* ------------------------------------------------ */

import { useEffect, useMemo, useCallback, useState } from "react";
import { Button } from "../ui/button";
import { HandoverList } from "./HandoverList";
import { useAuth } from "../../context/AuthContext";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";
import {
  deleteHandover,
  takeOverHandover,
  completeHandover,
  restoreHandover,
} from "./handover.api";
import { useHandoverStore } from "../../store/handoverStore";
import { CreateTaskModal } from "./CreateTaskModal";
import { Plus, FileText } from "lucide-react";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader } from "../layout/EnterpriseLayout";
import { useLanguage } from "../../context/LanguageContext";


/* ------------------------------------------------ */
/* SKELETON                                         */
/* ------------------------------------------------ */

function HandoverListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-16 rounded-md bg-muted animate-pulse" />
      ))}
    </div>
  );
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function isOptimistic(id: number) {
  return id < 0;
}

/* ------------------------------------------------ */
/* PAGE                                             */
/* ------------------------------------------------ */

export function HandoverPage() {
  const { user } = useAuth();
  const currentUser = user?.displayName || "";
  const { t } = useLanguage();

  /* ------------------------------------------------ */
  /* STORE SELECTORS                                 */
  /* ------------------------------------------------ */

  const handovers = useHandoverStore((s) => s.handovers);
  const isLoaded = useHandoverStore((s) => s.isLoaded);

  const load = useHandoverStore((s) => s.load);
  const update = useHandoverStore((s) => s.update);
  const remove = useHandoverStore((s) => s.remove);

  /* ------------------------------------------------ */
  /* LOCAL UI STATE                                  */
  /* ------------------------------------------------ */

  const [showCompleted, setShowCompleted] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  /* ------------------------------------------------ */
  /* LOAD ONCE + REALTIME REFRESH                    */
  /* ------------------------------------------------ */

  useEffect(() => {
    load();
  }, []);

  /* Re-load when another user creates a handover in real-time */
  useRealtimeUpdates({
    handover_created: () => { void load(); },
  });

  /* ------------------------------------------------ */
  /* DERIVED DATA                                    */
  /* ------------------------------------------------ */

  const visible = useMemo(() => {
    return handovers.filter((h) =>
      showCompleted ? h.status === "Erledigt" : h.status !== "Erledigt"
    );
  }, [handovers, showCompleted]);

  /* ------------------------------------------------ */
  /* ACTIONS (GUARDED)                                */
  /* ------------------------------------------------ */

  const handleTakeOver = useCallback(
    async (id: number) => {
      if (isOptimistic(id)) return;

      update({ id, takenBy: currentUser, status: "In Bearbeitung" });
      await takeOverHandover(id, currentUser);
    },
    [currentUser, update]
  );

  const handleComplete = useCallback(
    async (id: number) => {
      if (isOptimistic(id)) return;

      update({ id, status: "Erledigt" });
      await completeHandover(id, currentUser);
    },
    [currentUser, update]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (isOptimistic(id)) return;

      remove(id);
      await deleteHandover(id);
    },
    [remove]
  );

  const handleRestore = useCallback(
    async (id: number) => {
      if (isOptimistic(id)) return;

      update({ id, status: "Offen", takenBy: null });
      await restoreHandover(id);
    },
    [update]
  );

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <EnterprisePageShell>

      {/* TOP HEADER */}
      <EnterpriseHeader
        title="HANDOVER"
        subtitle={<span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{t("handover.subtitle")}</span>}
        icon={<FileText className="w-5 h-5 text-indigo-400" />}
        rightContent={
          <div className="flex gap-2">
            <Button onClick={() => setIsTaskModalOpen(true)} size="sm" className="h-7 px-3 text-[11px] font-bold tracking-wider uppercase bg-indigo-600/90 hover:bg-indigo-600 text-white shadow-sm border-transparent">
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t("handover.newTask")}
            </Button>

            <Button variant={showCompleted ? "default" : "secondary"} size="sm" className={`h-7 px-3 text-[11px] font-bold tracking-wider uppercase ${showCompleted ? 'bg-indigo-600/80 hover:bg-indigo-600 text-white border-transparent' : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 shadow-sm'}`} onClick={() => setShowCompleted((p) => !p)}>
              {showCompleted ? t("handover.hideCompleted") : t("handover.showCompleted")}
            </Button>
          </div>
        }
      />

      <EnterpriseFeatureHero
        tone="indigo"
        eyebrow={t("handover.subtitle")}
        title="Handover"
        description="Offene Uebergaben, aktive Bearbeitung und abgeschlossene Aufgaben bleiben in einer gemeinsamen Schichtuebersicht sichtbar."
        metrics={[
          { label: "Visible", value: visible.length },
          { label: "Total", value: handovers.length },
          { label: "Mode", value: showCompleted ? t("handover.hideCompleted") : t("handover.showCompleted") },
        ]}
      />

      {/* CONTENT GRID */}
      <EnterpriseCard
        noPadding
        className="w-full flex-1 min-h-0"
        style={{ background: "transparent", border: "0", boxShadow: "none" }}
      >
        {!isLoaded ? (
          <HandoverListSkeleton />
        ) : (
          <HandoverList
            handovers={visible}
            showCompleted={showCompleted}
            currentUser={currentUser}
            onTakeOver={handleTakeOver}
            onComplete={handleComplete}
            onDelete={handleDelete}
            onRestore={handleRestore}
          />
        )}
      </EnterpriseCard>

      <CreateTaskModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
      />

    </EnterprisePageShell>
  );
}
