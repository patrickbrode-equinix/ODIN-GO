/* ———————————————————————————————— */
/* USER ACCESS EDITOR – ABTEILUNGSSTANDARD + OVERRIDES */
/* FINAL: none | view | write                          */
/* ———————————————————————————————— */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/api";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import type { AccessLevel } from "../../context/AuthContext";
import { PAGE_DEFS, translatePageLabel } from "../../config/navigation";
import { useLanguage } from "../../context/LanguageContext";

/* ———————————————————————————————— */
/* TYPES                                            */
/* ———————————————————————————————— */

type UserAccessOverrideResponse = {
  id: number;
  group: string;
  role: "user" | "admin";
  basePolicy: Record<string, AccessLevel>;
  accessOverride: Record<string, AccessLevel>;
};

type UserAccessEditorProps = {
  userId: number;
  userEmail: string;
  userGroup: string;
};

type OverrideValue = "__default__" | AccessLevel;

/* ———————————————————————————————— */
/* HELPERS                                          */
/* ———————————————————————————————— */

function normalizeKey(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function safeLevel(level: any): AccessLevel {
  if (level === "view" || level === "write") return level;
  return "none";
}

function levelLabel(level: AccessLevel, t: (key: any) => string) {
  switch (level) {
    case "view":
      return t("userAccess.read");
    case "write":
      return t("userAccess.write");
    default:
      return t("userAccess.noAccess");
  }
}

/* Ensure FULL policy shape */
function normalizePolicy(
  raw?: Record<string, AccessLevel>
): Record<string, AccessLevel> {
  const base: Record<string, AccessLevel> = {};

  PAGE_DEFS.forEach((p) => {
    base[p.key] = safeLevel(raw?.[p.key]);
  });

  return base;
}

/* ———————————————————————————————— */
/* COMPONENT                                        */
/* ———————————————————————————————— */

export function UserAccessEditor({
  userId,
  userEmail,
  userGroup,
}: UserAccessEditorProps) {
  const { t } = useLanguage();
  const copy = {
    loadFailed: t("userAccess.loadFailed"),
    saveFailed: t("userAccess.saveFailed"),
    resetFailed: t("userAccess.resetFailed"),
    title: t("userAccess.title"),
    department: t("userAccess.department"),
    role: t("userAccess.role"),
    overrideHint: t("userAccess.overrideHint"),
    loading: t("userAccess.loading"),
    standard: t("userAccess.standard"),
    departmentDefault: t("userAccess.departmentDefault"),
    noAccess: t("userAccess.noAccess"),
    read: t("userAccess.read"),
    write: t("userAccess.write"),
    clearOverrides: t("userAccess.clearOverrides"),
    saving: t("common.saving"),
    save: t("common.save"),
  };
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [basePolicy, setBasePolicy] = useState<Record<string, AccessLevel>>(
    {}
  );
  const [override, setOverride] = useState<Record<string, AccessLevel>>({});
  const [role, setRole] = useState<"user" | "admin">("user");

  const normalizedGroup = useMemo(
    () => normalizeKey(userGroup),
    [userGroup]
  );

  /* ------------------------------------------------ */
  /* LOAD DATA                                       */
  /* ------------------------------------------------ */

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const overrideRes = await api.get<UserAccessOverrideResponse>(
        `/admin/users/${userId}/access-override`
      );

      setBasePolicy(normalizePolicy(overrideRes.data?.basePolicy));
      setOverride(overrideRes.data?.accessOverride || {});
      setRole(overrideRes.data?.role === "admin" ? "admin" : "user");
    } catch (e: any) {
      setError(
        e?.response?.data?.message || copy.loadFailed
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  /* ------------------------------------------------ */
  /* VIEW MODEL                                      */
  /* ------------------------------------------------ */

  const rows = useMemo(() => {
    return PAGE_DEFS.map((p) => {
      const base = safeLevel(basePolicy[p.key]);
      const hasOverride = Object.prototype.hasOwnProperty.call(
        override || {},
        p.key
      );

      const selected: OverrideValue = hasOverride
        ? safeLevel(override[p.key])
        : "__default__";

      return {
        key: p.key,
        label: translatePageLabel(p.key, t),
        base,
        selected,
      };
    });
  }, [basePolicy, override, t]);

  /* ------------------------------------------------ */
  /* CHANGE HANDLER                                  */
  /* ------------------------------------------------ */

  function setOverrideValue(pageKey: string, value: OverrideValue) {
    setOverride((prev) => {
      const next = { ...(prev || {}) };

      if (value === "__default__") {
        delete next[pageKey];
        return next;
      }

      next[pageKey] = value;
      return next;
    });
  }

  /* ------------------------------------------------ */
  /* SAVE / RESET                                    */
  /* ------------------------------------------------ */

  async function save() {
    setSaving(true);
    setError("");

    try {
      await api.put(`/admin/users/${userId}/access-override`, {
        accessOverride: override || {},
      });
      await load();
    } catch (e: any) {
      setError(
        e?.response?.data?.message || copy.saveFailed
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetOverrides() {
    setSaving(true);
    setError("");

    try {
      await api.put(`/admin/users/${userId}/access-override`, {
        accessOverride: {},
      });
      setOverride({});
      await load();
    } catch (e: any) {
      setError(
        e?.response?.data?.message || copy.resetFailed
      );
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <Card className="border border-border/60 bg-card">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{copy.title}</CardTitle>

        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{userEmail}</span>
          <span className="mx-2">•</span>
          {copy.department}: <span className="font-medium">{normalizedGroup}</span>
          <span className="mx-2">•</span>
          {copy.role}: <span className="font-medium uppercase">{role}</span>
        </div>

        <div className="text-xs text-muted-foreground">
          {copy.overrideHint}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">{copy.loading}</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="flex flex-col gap-2 rounded-md border border-border/60 bg-card px-3 py-2 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {copy.standard}: <strong>{levelLabel(r.base, t)}</strong> • {r.key}
                  </div>
                </div>

                <div className="w-full md:w-64">
                  <Select
                    value={r.selected}
                    onValueChange={(v) =>
                      setOverrideValue(r.key, v as OverrideValue)
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        {copy.departmentDefault}
                      </SelectItem>
                      <SelectItem value="none">{copy.noAccess}</SelectItem>
                      <SelectItem value="view">{copy.read}</SelectItem>
                      <SelectItem value="write">{copy.write}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-border/50 pt-4">
          <Button
            variant="secondary"
            onClick={resetOverrides}
            disabled={saving || loading}
          >
            {copy.clearOverrides}
          </Button>

          <Button onClick={save} disabled={saving || loading}>
            {saving ? copy.saving : copy.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
