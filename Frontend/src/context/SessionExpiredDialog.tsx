/* ——————————————————————————————————————————————— */
/* SESSION EXPIRED DIALOG                           */
/* Extracted from AuthContext.tsx                   */
/* Shown when idle timeout threshold is reached.    */
/* ——————————————————————————————————————————————— */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";

interface SessionExpiredDialogProps {
  open: boolean;
  secondsLeft: number;
  onLogout: () => void;
  onStay: () => void;
}

export function SessionExpiredDialog({
  open,
  secondsLeft,
  onLogout,
  onStay,
}: SessionExpiredDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Automatischer Logout</DialogTitle>
          <DialogDescription>
            Du wirst in {secondsLeft}s automatisch abgemeldet.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onLogout}>
            Abmelden
          </Button>
          <Button onClick={onStay}>Eingeloggt bleiben</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
