/* ------------------------------------------------ */
/* COMMIT FILTER PRESETS                            */
/* Zentrale Definition für Team- & Ops-Filter       */
/* ------------------------------------------------ */

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

export type CommitPresetKey =
  | "ops"
  | "electrician"
  | "all";

/* ------------------------------------------------ */
/* PRESET DEFINITIONS                               */
/* ------------------------------------------------ */
/*
  WICHTIG:
  - Strings müssen so geschrieben sein, wie sie im Excel
    im Feld "Activity Sub-Type" stehen (case-insensitive).
  - Enthält ein Sub-Type nur einen Teilstring, reicht das.
*/

export const COMMIT_FILTER_PRESETS: Record<
  CommitPresetKey,
  {
    label: string;
    subTypes: string[];
  }
> = {
  all: {
    label: "Alle Tickets",
    subTypes: [], // leer = kein Filter
  },

  ops: {
    label: "OPS relevant",
    subTypes: [
      "smart hands",
      "equipment install",
      "equipment de-install",
      "de-install",
      "migration",
      "cross connect",
      "remote hands",
    ],
  },

  electrician: {
    label: "Elektriker",
    subTypes: [
      "power install",
      "power work",
      "breaker",
      "electrical",
      "power circuit",
    ],
  },
};

/* ------------------------------------------------ */
/* HELPER FUNCTIONS                                 */
/* ------------------------------------------------ */

/**
 * Prüft, ob ein Ticket zu einem Preset gehört
 */
export function matchesCommitPreset(
  activitySubType: string | undefined | null,
  preset: CommitPresetKey
): boolean {
  if (preset === "all") return true;
  if (!activitySubType) return false;

  const value = activitySubType.toLowerCase();

  return COMMIT_FILTER_PRESETS[preset].subTypes.some((s) =>
    value.includes(s)
  );
}

/**
 * Gibt alle verfügbaren Presets zurück (für UI)
 */
export function getCommitPresets() {
  return Object.entries(COMMIT_FILTER_PRESETS).map(
    ([key, cfg]) => ({
      key: key as CommitPresetKey,
      label: cfg.label,
    })
  );
}
