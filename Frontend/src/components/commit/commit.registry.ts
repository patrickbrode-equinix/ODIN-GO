/* ———————————————————————————————— */
/* COMMIT – FILTER REGISTRY (FOUNDATION) */
/* Single source of truth for known values */
/* ———————————————————————————————— */

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

export type RegistryField =
  | "ibx"
  | "group"
  | "activityType"
  | "activitySubType"
  | "product"
  | "status"; // == activityStatus

export type RegistryEntry = {
  value: string;
  isNew: boolean;
  firstSeenAt: string; // ISO
};

export type CommitFilterRegistry = Record<RegistryField, RegistryEntry[]>;

/* ------------------------------------------------ */
/* INITIAL STATE                                    */
/* ------------------------------------------------ */

export function createEmptyRegistry(): CommitFilterRegistry {
  return {
    ibx: [],
    group: [],
    activityType: [],
    activitySubType: [],
    product: [],
    status: [],
  };
}

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function addValue(
  list: RegistryEntry[],
  rawValue?: string | null
): RegistryEntry[] {
  if (!rawValue) return list;

  const value = rawValue.trim();
  if (!value) return list;

  const exists = list.some((e) => e.value === value);
  if (exists) return list;

  return [
    ...list,
    {
      value,
      isNew: true,
      firstSeenAt: new Date().toISOString(),
    },
  ];
}

/* ------------------------------------------------ */
/* UPDATE FROM TICKETS                              */
/* ------------------------------------------------ */

export function updateRegistryFromTickets(
  registry: CommitFilterRegistry,
  tickets: any[]
): CommitFilterRegistry {
  const next = structuredClone(registry);

  for (const t of tickets) {
    next.ibx = addValue(next.ibx, t.ibx);
    next.group = addValue(next.group, t.group);
    next.activityType = addValue(next.activityType, t.activityType);
    next.activitySubType = addValue(
      next.activitySubType,
      t.activitySubType
    );
    next.product = addValue(next.product, t.product);

    // 🔒 OPTION A: Status = activityStatus
    next.status = addValue(next.status, t.activityStatus);
  }

  return next;
}
