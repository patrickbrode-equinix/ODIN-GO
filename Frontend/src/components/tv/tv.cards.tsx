/* ------------------------------------------------ */
/* TV TOP CARDS (COUNTERS + PLACEHOLDER)            */
/* ------------------------------------------------ */

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import type { TvCardsProps } from "./tv.types";

export function TvCards({ now, earlyCount, lateCount, nightCount }: TvCardsProps) {
  // 'now' currently isn't shown here (date/time is in page header),
  // but we keep the prop to allow future extensions.
  void now;

  return (
    <>
      {/* LEFT: EMPLOYEES TODAY */}
      <Card className="col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Mitarbeiter Heute</CardTitle>
          <p className="text-xs text-muted-foreground -mt-1">
            Übersicht aller Schichten
          </p>
        </CardHeader>

        <CardContent className="flex items-center justify-end gap-2">
          <Badge className="bg-orange-500/15 text-orange-300 border border-orange-500/30">
            Frühschicht: {earlyCount}
          </Badge>
          <Badge className="bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">
            Spätschicht: {lateCount}
          </Badge>
          <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/30">
            Nachtschicht: {nightCount}
          </Badge>
        </CardContent>
      </Card>

      {/* RIGHT: SCHEDULED TICKETS PLACEHOLDER */}
      <Card className="col-span-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Scheduled Tickets · Heute</CardTitle>
          <p className="text-xs text-muted-foreground -mt-1">
            Geplante Wartungen &amp; Installationen
          </p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          (kommt als nächstes)
        </CardContent>
      </Card>
    </>
  );
}
