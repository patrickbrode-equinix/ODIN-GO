/* ------------------------------------------------ */
/* EMPLOYEE CONTACTS – ADMIN-PFLEGE (MINIMAL)       */
/* E-Mail-Adressen für Teams-Bot / Benachrichtigungen */
/* ------------------------------------------------ */

import { useEffect, useState, useCallback } from "react";
import { Mail, RefreshCw, RotateCcw, Save, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { api } from "../../api/api";

interface EmployeeContact {
  id: number;
  employee_name: string;
  email: string | null;
  email_source: "generated" | "manual";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function EmployeeContactsPanel() {
  const [contacts, setContacts] = useState<EmployeeContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadContacts = useCallback(async () => {
    try {
      const res = await api.get("/employee-contacts");
      setContacts(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load contacts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post("/employee-contacts/sync");
      await loadContacts();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async (id: number) => {
    if (!editEmail.trim() || !editEmail.includes("@")) return;
    setSavingId(id);
    try {
      const res = await api.put(`/employee-contacts/${id}`, { email: editEmail.trim() });
      setContacts(prev => prev.map(c => c.id === id ? res.data : c));
      setEditingId(null);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSavingId(null);
    }
  };

  const handleReset = async (id: number) => {
    setSavingId(id);
    try {
      const res = await api.put(`/employee-contacts/${id}/reset`);
      setContacts(prev => prev.map(c => c.id === id ? res.data : c));
      setEditingId(null);
    } catch (err) {
      console.error("Reset failed:", err);
    } finally {
      setSavingId(null);
    }
  };

  const filtered = contacts.filter(c =>
    c.employee_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Lade Kontakte...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-indigo-400" />
          <h3 className="text-lg font-bold">Mitarbeiter E-Mail-Adressen</h3>
          <span className="text-xs text-muted-foreground">({contacts.length} Einträge)</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          Sync aus Schichtplan
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        E-Mails werden automatisch aus dem Mitarbeiternamen generiert. Manuell geänderte E-Mails bleiben bei einem erneuten Import erhalten.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Suche nach Name oder E-Mail..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              <th className="text-left px-4 py-2 font-semibold">Name</th>
              <th className="text-left px-4 py-2 font-semibold">E-Mail</th>
              <th className="text-left px-4 py-2 font-semibold w-24">Quelle</th>
              <th className="text-right px-4 py-2 font-semibold w-28">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-muted-foreground">
                  {search ? "Keine Treffer" : "Keine Kontakte vorhanden. Klicken Sie auf 'Sync aus Schichtplan'."}
                </td>
              </tr>
            ) : (
              filtered.map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-muted/10">
                  <td className="px-4 py-2 font-medium">{c.employee_name}</td>
                  <td className="px-4 py-2">
                    {editingId === c.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          className="h-8 text-sm"
                          onKeyDown={e => { if (e.key === "Enter") handleSave(c.id); if (e.key === "Escape") setEditingId(null); }}
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => handleSave(c.id)} disabled={savingId === c.id}>
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        className="cursor-pointer hover:text-indigo-400 transition"
                        onClick={() => { setEditingId(c.id); setEditEmail(c.email || ""); }}
                        title="Klicken zum Bearbeiten"
                      >
                        {c.email || <span className="text-muted-foreground italic">nicht gesetzt</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      c.email_source === "manual"
                        ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                        : "bg-muted/50 text-muted-foreground border border-border"
                    }`}>
                      {c.email_source === "manual" ? "manuell" : "generiert"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {c.email_source === "manual" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => handleReset(c.id)}
                        disabled={savingId === c.id}
                        title="Auf generierten Wert zurücksetzen"
                      >
                        <RotateCcw className="w-3 h-3 mr-1" />
                        Reset
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
