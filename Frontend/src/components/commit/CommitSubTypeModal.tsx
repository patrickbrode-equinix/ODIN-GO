/* ------------------------------------------------ */
/* COMMIT – SUB TYPE ADMIN MODAL                    */
/* ------------------------------------------------ */

import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { api } from "../../api/api";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { useLanguage } from "../../context/LanguageContext";

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

type CommitSubTypeStatus = "relevant" | "ignore" | "unknown";

type CommitSubType = {
  id: number;
  key: string;
  status: CommitSubTypeStatus;
};

/* ------------------------------------------------ */
/* PROPS                                            */
/* ------------------------------------------------ */

interface Props {
  open: boolean;
  onClose: () => void;
}

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

export function CommitSubTypeModal({ open, onClose }: Props) {
  const { language } = useLanguage();
  const [items, setItems] = useState<CommitSubType[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState("");

  const copy = language === "de"
    ? {
        title: "Activity-Subtypen verwalten",
        placeholder: "Neuen Subtyp anlegen...",
        add: "Hinzufuegen",
        subtype: "Subtyp",
        status: "Status",
        loading: "Lade...",
        empty: "Keine Subtypen gefunden.",
        deleteConfirm: "Subtyp wirklich loeschen?",
      }
    : {
        title: "Manage activity sub-types",
        placeholder: "Create new sub-type...",
        add: "Add",
        subtype: "Sub-type",
        status: "Status",
        loading: "Loading...",
        empty: "No sub-types found.",
        deleteConfirm: "Delete this sub-type?",
      };

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
    if (open) load();
  }, [open]);

  /* ------------------------------------------------ */
  /* UPDATE STATUS                                    */
  /* ------------------------------------------------ */

  async function updateStatus(id: number, status: CommitSubTypeStatus) {
    await api.patch(`/commit/subtypes/${id}`, { status });
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i))
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
    if (!confirm(copy.deleteConfirm)) return;
    await api.delete(`/commit/subtypes/${id}`);
    await load();
  }

  /* ------------------------------------------------ */
  /* RENDER                                          */
  /* ------------------------------------------------ */

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between sticky top-0 bg-background z-10 pb-2">
          <DialogTitle>{copy.title}</DialogTitle>
          <button onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </DialogHeader>

        {/* CREATE */}
        <div className="flex gap-2">
          <Input
            placeholder={copy.placeholder}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <Button onClick={create}>
            <Plus className="w-4 h-4 mr-1" />
            {copy.add}
          </Button>
        </div>

        {/* TABLE */}
        <div className="border rounded-xl overflow-y-auto flex-1">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-3 py-2">{copy.subtype}</th>
                <th className="text-left px-3 py-2 w-64">{copy.status}</th>
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
                    {copy.loading}
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="p-4 text-center text-muted-foreground"
                  >
                    {copy.empty}
                  </td>
                </tr>
              )}

              {items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{item.key}</td>

                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      {(Object.keys(STATUS_STYLES) as CommitSubTypeStatus[]).map(
                        (status) => {
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
                        }
                      )}
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
      </DialogContent>
    </Dialog>
  );
}
