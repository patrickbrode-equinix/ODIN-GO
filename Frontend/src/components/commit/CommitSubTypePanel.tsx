/* ------------------------------------------------ */
/* COMMIT – SUB TYPE PANEL (INLINE SETTINGS)        */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../api/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type CommitSubTypeStatus = "relevant" | "ignore" | "unknown";

type CommitSubType = {
  id: number;
  key: string;
  status: CommitSubTypeStatus;
  is_new: boolean;
};

/* ------------------------------------------------ */
/* STATUS UI MAP                                    */
/* ------------------------------------------------ */

const STATUS_STYLES: Record<
  CommitSubTypeStatus,
  { label: string; className: string }
> = {
  relevant: {
    label: "Relevant",
    className: "bg-green-500/20 text-green-400 border border-green-700/50",
  },
  ignore: {
    label: "Ignore",
    className: "bg-muted/30 text-muted-foreground border border-muted/40",
  },
  unknown: {
    label: "Unknown",
    className: "bg-orange-500/20 text-orange-400 border border-orange-700/50",
  },
};

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export function CommitSubTypePanel() {
  const [items, setItems] = useState<CommitSubType[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState("");

  /* ------------------------------------------------ */
  /* LOAD SUB TYPES                                   */
  /* ------------------------------------------------ */

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/commit/subtypes");
      setItems(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  /* ------------------------------------------------ */
  /* UPDATE STATUS                                    */
  /* ------------------------------------------------ */

  async function updateStatus(id: number, status: CommitSubTypeStatus) {
    const { data } = await api.patch(`/commit/subtypes/${id}`, { status });

    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status: data.status,
              is_new: data.is_new,
            }
          : i
      )
    );
  }

  /* ------------------------------------------------ */
  /* CREATE SUB TYPE                                  */
  /* ------------------------------------------------ */

  async function create() {
    if (!newKey.trim()) return;

    await api.post("/commit/subtypes", {
      key: newKey.trim(),
    });

    setNewKey("");
    await load();
  }

  /* ------------------------------------------------ */
  /* DELETE SUB TYPE                                  */
  /* ------------------------------------------------ */

  async function remove(id: number) {
    if (!confirm("Sub-Type wirklich löschen?")) return;
    await api.delete(`/commit/subtypes/${id}`);
    await load();
  }

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        Activity Sub-Types verwalten
      </h2>

      {/* CREATE */}
      <div className="flex gap-2">
        <Input
          placeholder="Neuen Sub-Type anlegen…"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
        />
        <Button onClick={create}>
          <Plus className="w-4 h-4 mr-1" />
          Hinzufügen
        </Button>
      </div>

      {/* TABLE */}
      <div className="border rounded-xl overflow-y-auto max-h-[55vh]">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">Sub-Type</th>
              <th className="text-left px-3 py-2 w-64">Status</th>
              <th className="w-12"></th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={3}
                  className="p-4 text-center text-muted-foreground"
                >
                  Lade…
                </td>
              </tr>
            )}

            {!loading && items.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="p-4 text-center text-muted-foreground"
                >
                  Keine Sub-Types gefunden.
                </td>
              </tr>
            )}

            {items.map((item) => (
              <tr
                key={item.id}
                className={`border-t ${
                  item.is_new ? "bg-orange-500/5" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium flex items-center gap-2">
                  {item.key}
                  {item.is_new && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400 border border-orange-600/40">
                      NEW
                    </span>
                  )}
                </td>

                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    {(Object.keys(
                      STATUS_STYLES
                    ) as CommitSubTypeStatus[]).map((status) => {
                      const active = item.status === status;
                      return (
                        <button
                          key={status}
                          onClick={() =>
                            !active &&
                            updateStatus(item.id, status)
                          }
                          className={`px-3 py-1 rounded-lg text-xs transition ${
                            active
                              ? STATUS_STYLES[status].className
                              : "border border-muted text-muted-foreground hover:bg-muted/30"
                          }`}
                        >
                          {STATUS_STYLES[status].label}
                        </button>
                      );
                    })}
                  </div>
                </td>

                <td className="text-center">
                  <button
                    onClick={() => remove(item.id)}
                    className="text-muted-foreground hover:text-red-500 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
