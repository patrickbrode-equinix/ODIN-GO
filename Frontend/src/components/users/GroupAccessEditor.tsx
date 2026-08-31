/* ———————————————————————————————— */
/* GROUP ACCESS EDITOR – ABTEILUNG (PAGES x LEVELS) */
/* ———————————————————————————————— */
/**
 * Abteilungs-Standards:
 * - pro Page wird ein Minimum-Level gesetzt
 * - User ohne Override bekommen genau diese Defaults
 */

import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/api";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
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

type GroupRow = {
  key: string;
  label: string;
  policy: Record<string, AccessLevel>;
};

type GroupAccessEditorVariant = "card" | "plain";

type GroupAccessEditorProps = {
  variant?: GroupAccessEditorVariant;
  showTitle?: boolean;
};

/* 🔑 FINAL LEVELS (kein manage) */
function normalizeGroupKey(input: string) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/* ———————————————————————————————— */
/* COMPONENT                                        */
/* ———————————————————————————————— */

export function GroupAccessEditor({
  variant = "card",
  showTitle,
}: GroupAccessEditorProps) {
  const { t } = useLanguage();
  const useCard = variant === "card";
  const useTitle = showTitle ?? useCard;
  const levelOptions: { value: AccessLevel; label: string }[] = [
    { value: "none", label: t("groupAccess.noAccess") },
    { value: "view", label: t("groupAccess.read") },
    { value: "write", label: t("groupAccess.write") },
  ];
  const copy = {
    loadFailed: t("groupAccess.loadFailed"),
    saveFailed: t("groupAccess.saveFailed"),
    keyLabelRequired: t("groupAccess.keyLabelRequired"),
    createFailed: t("groupAccess.createFailed"),
    selectDepartment: t("groupAccess.selectDepartment"),
    refresh: t("common.refresh"),
    saving: t("common.saving"),
    save: t("common.save"),
    newDepartment: t("groupAccess.newDepartment"),
    keyPlaceholder: t("groupAccess.keyPlaceholder"),
    labelPlaceholder: t("groupAccess.labelPlaceholder"),
    create: t("groupAccess.create"),
    hint: t("groupAccess.hint"),
    page: t("groupAccess.page"),
    departmentStandard: t("groupAccess.departmentStandard"),
    selectAccess: t("groupAccess.selectAccess"),
    title: t("groupAccess.title"),
  };

  /* ———————————————————————————————— */
  /* STATE                                           */
  /* ———————————————————————————————— */

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("c-ops");
  const [draftPolicy, setDraftPolicy] = useState<Record<string, AccessLevel>>(
    {}
  );

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");

  /* ———————————————————————————————— */
  /* LOAD                                             */
  /* ———————————————————————————————— */

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get<GroupRow[]>("/groups");
      const data = Array.isArray(res.data) ? res.data : [];
      setGroups(data);

      const fallback = data?.[0]?.key || "c-ops";
      const key = data.some((g) => g.key === selectedKey)
        ? selectedKey
        : fallback;
      setSelectedKey(key);
    } catch (e: any) {
      setError(e?.response?.data?.message || copy.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.key === selectedKey) || null,
    [groups, selectedKey]
  );

  useEffect(() => {
    if (selectedGroup) {
      setDraftPolicy(selectedGroup.policy || {});
    }
  }, [selectedGroup]);

  /* ———————————————————————————————— */
  /* ACTIONS                                          */
  /* ———————————————————————————————— */

  const savePolicy = async () => {
    if (!selectedGroup) return;

    setSaving(true);
    setError("");
    try {
      await api.put(
        `/groups/${encodeURIComponent(selectedGroup.key)}/policy`,
        {
          policy: draftPolicy,
        }
      );
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || copy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const createGroup = async () => {
    const key = normalizeGroupKey(newKey);
    const label = newLabel.trim();

    if (!key || !label) {
      setError(copy.keyLabelRequired);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.post("/groups", { key, label });
      setNewKey("");
      setNewLabel("");
      await load();
      setSelectedKey(key);
    } catch (e: any) {
      setError(
        e?.response?.data?.message ||
        copy.createFailed
      );
    } finally {
      setSaving(false);
    }
  };

  /* ———————————————————————————————— */
  /* CONTENT                                          */
  /* ———————————————————————————————— */

  const content = (
    <>
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="w-full md:w-80">
          <div className="mb-1 text-xs text-muted-foreground">
            {copy.selectDepartment}
          </div>
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger>
              <SelectValue placeholder={copy.selectDepartment} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.label} ({g.key})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={load}
            disabled={loading || saving}
          >
            {copy.refresh}
          </Button>
          <Button
            onClick={savePolicy}
            disabled={saving || loading || !selectedGroup}
          >
            {saving ? copy.saving : copy.save}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <div className="mb-2 text-sm font-medium">{copy.newDepartment}</div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={copy.keyPlaceholder}
          />
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={copy.labelPlaceholder}
          />
          <Button onClick={createGroup} disabled={saving}>
            {copy.create}
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          {copy.hint}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-12 border-b bg-muted/40 px-3 py-2 text-xs font-medium">
          <div className="col-span-7">{copy.page}</div>
          <div className="col-span-5">{copy.departmentStandard}</div>
        </div>

        <div className="divide-y">
          {PAGE_DEFS.map((p) => {
            const current = (draftPolicy?.[p.key] || "none") as AccessLevel;

            return (
              <div
                key={p.key}
                className="grid grid-cols-12 items-center px-3 py-2"
              >
                <div className="col-span-7">
                  <div className="text-sm">{translatePageLabel(p.key, t)}</div>
                  <div className="text-xs text-muted-foreground">{p.key}</div>
                </div>

                <div className="col-span-5">
                  <Select
                    value={current}
                    onValueChange={(v) =>
                      setDraftPolicy((prev) => ({
                        ...prev,
                        [p.key]: v as AccessLevel,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={copy.selectAccess} />
                    </SelectTrigger>
                    <SelectContent>
                      {levelOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  /* ———————————————————————————————— */
  /* RENDER                                           */
  /* ———————————————————————————————— */

  if (!useCard) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <Card className="mt-6">
      {useTitle ? (
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
        </CardHeader>
      ) : null}

      <CardContent className="space-y-4">{content}</CardContent>
    </Card>
  );
}
