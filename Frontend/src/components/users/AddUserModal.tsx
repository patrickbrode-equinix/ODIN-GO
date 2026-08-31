/* ------------------------------------------------ */
/* ADD USER MODAL – CREATE USER                     */
/* ------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/api";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type AddUserModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
};

function normalizeEmailPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u00df/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function generateSsoEmail(firstName: string, lastName: string) {
  const first = normalizeEmailPart(firstName.split(/\s+/).filter(Boolean)[0] || "");
  const last = normalizeEmailPart(lastName.split(/\s+/).filter(Boolean).at(-1) || "");
  return first && last ? `${first}.${last}@eu.equinix.com` : "";
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function AddUserModal({ open, onClose, onCreated }: AddUserModalProps) {
  const { t } = useLanguage();
  const copy = {
    createFailed: t("addUser.createFailed"),
    title: t("addUser.title"),
    subtitle: t("addUser.subtitle"),
    note: t("addUser.note"),
    firstName: t("addUser.firstName"),
    lastName: t("addUser.lastName"),
    email: t("addUser.email"),
    cancel: t("common.cancel"),
    saving: t("common.saving"),
    submit: t("addUser.submit"),
  };
  /* ------------------------------------------------ */
  /* STATE                                           */
  /* ------------------------------------------------ */

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState(EMPTY_FORM);
  const generatedEmail = useMemo(
    () => generateSsoEmail(form.firstName, form.lastName),
    [form.firstName, form.lastName]
  );

  const canSubmit = useMemo(() => {
    return Boolean(
      form.firstName.trim() &&
      form.lastName.trim() &&
      generatedEmail
    );
  }, [form.firstName, form.lastName, generatedEmail]);

  useEffect(() => {
    if (open) {
      setError("");
      setLoading(false);
      return;
    }

    setError("");
    setLoading(false);
    setForm(EMPTY_FORM);
  }, [open]);

  /* ------------------------------------------------ */
  /* SUBMIT                                          */
  /* ------------------------------------------------ */

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    setLoading(true);

    try {
      await api.post("/admin/users", {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      });

      onClose();
      onCreated?.();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          copy.createFailed
      );
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <Card className="w-full max-w-lg border border-border/50 bg-background/90 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold">
            {copy.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {copy.subtitle}
          </p>
          <p className="text-xs text-muted-foreground">
            {copy.note}
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* NAME */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{copy.firstName}</Label>
                <Input
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  disabled={loading}
                  autoComplete="given-name"
                />
              </div>

              <div className="space-y-2">
                <Label>{copy.lastName}</Label>
                <Input
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  disabled={loading}
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{copy.email} / Nutzerkennung</Label>
              <Input
                value={generatedEmail}
                readOnly
                placeholder="wird automatisch erzeugt"
                className="bg-muted/40"
              />
              <p className="text-xs text-muted-foreground">Wird automatisch aus Vor- und Nachname erzeugt und für Jarvis SSO verwendet.</p>
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={loading}
              >
                {copy.cancel}
              </Button>

              <Button
                type="submit"
                disabled={loading || !canSubmit}
              >
                {loading ? copy.saving : copy.submit}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
