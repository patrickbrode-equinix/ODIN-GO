/* ------------------------------------------------ */
/* HANDOVER – LIST                                  */
/* ------------------------------------------------ */

import { memo } from "react";
import { HandoverItem } from "./HandoverItem";
import { HandoverItem as Item } from "./handover.types";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

interface Props {
  handovers: Item[];
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

function HandoverListComponent({
  handovers,
  showCompleted,
  currentUser,
  onTakeOver,
  onComplete,
  onDelete,
  onRestore,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col h-full rounded-2xl w-full">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="font-semibold leading-none tracking-tight">
          {showCompleted ? t("handover.completedHandovers") : t("handover.latestHandovers")}
        </h3>
      </div>

      <div className="p-6 pt-0 space-y-3">
        {handovers.length === 0 && (
          <p className="text-[13px] text-[#4b5563]">
            {t("common.noData")}
          </p>
        )}

        {handovers.map((handover) => (
          <HandoverItem
            key={handover.id}
            handover={handover}
            showCompleted={showCompleted}
            currentUser={currentUser}
            onTakeOver={onTakeOver}
            onComplete={onComplete}
            onDelete={onDelete}
            onRestore={onRestore}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------ */
/* MEMO EXPORT                                      */
/* ------------------------------------------------ */

export const HandoverList = memo(HandoverListComponent);
