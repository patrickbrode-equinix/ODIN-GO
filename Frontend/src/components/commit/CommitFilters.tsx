/* ------------------------------------------------ */
/* COMMIT – FILTER UI                               */
/* ------------------------------------------------ */

import { CommitFilters } from "./commit.filterState";

interface Props {
  filters: CommitFilters;
  onChange: (filters: CommitFilters) => void;
  availableIBXs: string[];
}

export function CommitFiltersUI({
  filters,
  onChange,
  availableIBXs,
}: Props) {
  function toggle(key: keyof CommitFilters) {
    onChange({ ...filters, [key]: !filters[key] });
  }

  function toggleIBX(ibx: string) {
    const exists = filters.ibx.includes(ibx);
    onChange({
      ...filters,
      ibx: exists
        ? filters.ibx.filter((i) => i !== ibx)
        : [...filters.ibx, ibx],
    });
  }

  return (
    <div className="space-y-4">
      {/* QUICK FILTERS */}
      <div className="flex gap-2 flex-wrap">
        {[
          ["compliance", "Compliance"],
          ["missed", "Missed"],
          ["migration", "Migration"],
          ["deinstall", "De-Install"],
          ["scheduled", "Scheduled"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => toggle(key as keyof CommitFilters)}
            className={`px-3 py-1 rounded-xl text-sm transition ${
              filters[key as keyof CommitFilters]
                ? "bg-primary text-primary-foreground"
                : "bg-accent text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* IBX FILTER */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">IBX</p>
        <div className="flex gap-2 flex-wrap">
          {availableIBXs.map((ibx) => (
            <button
              key={ibx}
              onClick={() => toggleIBX(ibx)}
              className={`px-3 py-1 rounded-xl text-sm ${
                filters.ibx.includes(ibx)
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-foreground"
              }`}
            >
              {ibx}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
