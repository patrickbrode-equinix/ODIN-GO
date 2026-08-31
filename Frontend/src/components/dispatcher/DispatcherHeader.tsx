/* ------------------------------------------------ */
/* DISPATCHER HEADER                                */
/* WEEK / DATE RANGE (ISO WEEK)                     */
/* ------------------------------------------------ */

import {
  startOfISOWeek,
  endOfISOWeek,
  getISOWeek,
  format,
} from "date-fns";

import { Button } from "../ui/button";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { EnterpriseHeader } from "../layout/EnterpriseLayout";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type Props = {
  weekDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
};

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function DispatcherHeader({
  weekDate,
  onPrevWeek,
  onNextWeek,
}: Props) {
  const weekNumber = getISOWeek(weekDate);
  const from = startOfISOWeek(weekDate);
  const to = endOfISOWeek(weekDate);

  return (
    <EnterpriseHeader
      icon={<CalendarClock className="h-5 w-5 text-cyan-400" />}
      title="Dispatcher Console"
      subtitle={`KW ${weekNumber} · ${format(from, "dd.MM.yyyy")} – ${format(to, "dd.MM.yyyy")}`}
      rightContent={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="border-sky-400/16 bg-sky-400/5 hover:bg-sky-400/10" onClick={onPrevWeek}>
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Button variant="outline" size="icon" className="border-sky-400/16 bg-sky-400/5 hover:bg-sky-400/10" onClick={onNextWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      }
    />
  );
}
