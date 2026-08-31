/* ------------------------------------------------ */
/* FEEDBACK BUTTON – HEADER-INTEGRATED              */
/* Modal: Typ, Titel, Beschreibung, Screenshot      */
/* Speichert Feedback direkt in ODIN                 */
/* ------------------------------------------------ */

import { useState, useRef } from "react";
import { MessageSquare, Bug, Lightbulb, Upload, X, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Label } from "./ui/label";
import { api } from "../api/api";
import { useLocation } from "react-router-dom";
import { useTheme } from "./ThemeProvider";

type FeedbackType = "Bug" | "Verbesserung";

export function FeedbackButton({ variant = "fixed" }: { variant?: "fixed" | "header" }) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("Bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const reset = () => {
    setType("Bug");
    setTitle("");
    setDescription("");
    setScreenshot(null);
    setErrors({});
    setResult(null);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = "Titel ist erforderlich";
    if (!description.trim()) newErrors.description = "Beschreibung ist erforderlich";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSending(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("route", location.pathname);
      if (screenshot) {
        formData.append("screenshot", screenshot);
      }

      const res = await api.post("/feedback", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setResult({ success: true, message: res.data?.message || "Feedback wurde gespeichert." });
      // Reset form after success
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 2000);
    } catch (err: any) {
      const msg = err?.response?.data?.error || "Feedback konnte nicht gespeichert werden.";
      setResult({ success: false, message: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Feedback Trigger Button */}
      {variant === "header" ? (
        <button
          onClick={() => { setOpen(true); setResult(null); }}
          className={isLight
            ? "flex h-10 items-center gap-1.5 whitespace-nowrap rounded-2xl border border-slate-200/80 bg-white/74 px-3 text-[11px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_12px_28px_rgba(148,163,184,0.10)] transition-all duration-300 hover:border-indigo-300/70 hover:bg-white hover:text-indigo-700 hover:shadow-[0_18px_36px_rgba(99,102,241,0.12)]"
            : "flex h-10 items-center gap-1.5 whitespace-nowrap rounded-2xl border border-white/10 bg-white/[0.035] px-3 text-[11px] font-bold text-white/65 transition-all duration-300 hover:border-indigo-400/35 hover:bg-white/6 hover:text-indigo-200 hover:shadow-[0_0_24px_rgba(99,102,241,0.10)]"
          }
          title="Feedback erfassen"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Feedback</span>
        </button>
      ) : (
        <button
          onClick={() => { setOpen(true); setResult(null); }}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-105 active:scale-100"
          title="Feedback erfassen"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Feedback</span>
        </button>
      )}

      {/* Modal */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              Feedback erfassen
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-white/10 bg-white/3 p-3 text-sm text-muted-foreground">
              Dein Hinweis wird direkt in ODIN gespeichert und kann im Admin-Bereich ohne separaten Mailversand geprueft werden.
            </div>

            {/* Typ-Auswahl */}
            <div className="space-y-2">
              <Label>Typ</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setType("Bug")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    type === "Bug"
                      ? "bg-red-500/15 border-red-500/40 text-red-400 shadow-sm"
                      : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Bug className="w-4 h-4" />
                  Bug
                </button>
                <button
                  type="button"
                  onClick={() => setType("Verbesserung")}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    type === "Verbesserung"
                      ? "bg-blue-500/15 border-blue-500/40 text-blue-400 shadow-sm"
                      : "bg-muted/30 border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <Lightbulb className="w-4 h-4" />
                  Verbesserung
                </button>
              </div>
            </div>

            {/* Titel */}
            <div className="space-y-2">
              <Label htmlFor="fb-title">Titel *</Label>
              <Input
                id="fb-title"
                placeholder="Kurze Zusammenfassung"
                value={title}
                onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors(prev => ({ ...prev, title: "" })); }}
                className={errors.title ? "border-red-500" : ""}
              />
              {errors.title && <p className="text-xs text-red-400">{errors.title}</p>}
            </div>

            {/* Beschreibung */}
            <div className="space-y-2">
              <Label htmlFor="fb-desc">Beschreibung *</Label>
              <Textarea
                id="fb-desc"
                placeholder="Was ist passiert, was sollte passieren und welche Auswirkung hat es?"
                value={description}
                onChange={(e) => { setDescription(e.target.value); if (errors.description) setErrors(prev => ({ ...prev, description: "" })); }}
                rows={4}
                className={errors.description ? "border-red-500" : ""}
              />
              {errors.description && <p className="text-xs text-red-400">{errors.description}</p>}
            </div>

            {/* Screenshot */}
            <div className="space-y-2">
              <Label>Screenshot (optional)</Label>
              {screenshot ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border">
                  <span className="text-sm truncate flex-1">{screenshot.name}</span>
                  <span className="text-xs text-muted-foreground">{(screenshot.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    onClick={() => { setScreenshot(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:bg-muted/30 transition w-full"
                >
                  <Upload className="w-4 h-4" />
                  Bild auswählen
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setScreenshot(f);
                }}
              />
            </div>

            {/* Result */}
            {result && (
              <div className={`p-3 rounded-lg text-sm ${
                result.success
                  ? "bg-green-500/10 border border-green-500/30 text-green-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              }`}>
                {result.message}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); reset(); }} disabled={sending}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Speichere...
                </>
              ) : (
                "Feedback speichern"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
