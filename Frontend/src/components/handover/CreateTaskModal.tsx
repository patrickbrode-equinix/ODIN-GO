import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Calendar, User, Clock, Repeat } from "lucide-react";
import { Button } from "../ui/button";
import { createHandover } from "./handover.api";
import { useAuth } from "../../context/AuthContext";
import { HandoverItem } from "./handover.types";
import { api } from "../../api/api";
import { useShiftStore } from "../../store/shiftStore";
import { useLanguage } from "../../context/LanguageContext";
import { dedupeEmployeeNames, extractEmployeeNameFromUser } from "../../utils/employeeNames";

interface CreateTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    employees?: string[];
}

export function CreateTaskModal({ isOpen, onClose, employees: propEmployees }: CreateTaskModalProps) {
    const { user } = useAuth();
    const { t } = useLanguage();
    const schedulesByMonth = useShiftStore(s => s.schedulesByMonth);
    const [employees, setEmployees] = useState<string[]>(propEmployees || []);
    const [assignee, setAssignee] = useState("");

    // Fetch all employees from DB + include shiftplan employees
    useEffect(() => {
        if (!isOpen) return;
        if (propEmployees && propEmployees.length > 0) return;

        // Get all unique employee names from every loaded month in the shiftplan
        const shiftplanNames = new Set<string>();
        for (const schedule of Object.values(schedulesByMonth)) {
            for (const name of Object.keys(schedule)) {
                if (name) shiftplanNames.add(name);
            }
        }

        api.get("/admin/users").then(res => {
            const empList = Array.isArray(res.data) ? res.data : [];
            const userNames: string[] = empList
                .map((u: any) => extractEmployeeNameFromUser(u))
                .filter((name: string | null): name is string => Boolean(name));
            const merged = dedupeEmployeeNames([...userNames, ...Array.from(shiftplanNames)]);
            setEmployees(merged);
        }).catch(() => {
            // Fallback to shiftplan names only
            const names = dedupeEmployeeNames(Array.from(shiftplanNames));
            setEmployees(names.length > 0 ? names : []);
        });
    }, [isOpen, schedulesByMonth]);
    const [dueDatetime, setDueDatetime] = useState("");
    const [description, setDescription] = useState("");
    const [recurrence, setRecurrence] = useState("none");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        if (!assignee || !dueDatetime || !description) {
            alert("Bitte alle Pflichtfelder ausfüllen.");
            setIsSubmitting(false);
            return;
        }

        if (!window.confirm("Aufgabe wirklich erstellen?")) {
            setIsSubmitting(false);
            return;
        }

        try {
            const payload: any = {
                // Task specific
                type: "Task",
                assigneeName: assignee,
                dueDatetime: new Date(dueDatetime).toISOString(),
                recurrence: recurrence !== "none" ? recurrence : "",
                description: description,

                // Meta
                status: "Offen",
                createdBy: user?.displayName || "Unknown",
                createdAt: new Date().toISOString(),
                takenBy: null,
                priority: "Medium",

                // Empty Ticket Data
                ticketNumber: "",
                ticketType: "",
                activity: "",
                systemName: "",
                customerName: "",
                area: "",
                commitAt: null,
                remainingTime: "",
            };

            await createHandover(payload as HandoverItem);
            onClose();
        } catch (err) {
            console.error("Failed to create task", err);
            alert("Failed to create task.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-card border border-border rounded-xl shadow-xl z-50 p-6 focus:outline-none">
                    <div className="flex justify-between items-center mb-6">
                        <Dialog.Title className="text-lg font-bold flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-primary" />
                            {t("handover.createTask")}
                        </Dialog.Title>
                        <Dialog.Close asChild>
                            <button className="text-muted-foreground hover:text-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </Dialog.Close>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <User className="w-4 h-4" /> {t("handover.assignee")} <span className="text-red-500">*</span>
                                </label>
                                <select
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    value={assignee}
                                    onChange={(e) => setAssignee(e.target.value)}
                                >
                                    <option value="" disabled>
                                        {employees.length === 0 ? t("handover.loadingEllipsis") : t("handover.pleaseSelect")}
                                    </option>
                                    {/* Special Azubi option */}
                                    <option value="AZUBI">— Azubi —</option>
                                    {employees.map(e => <option key={e} value={e}>{e}</option>)}

                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <Clock className="w-4 h-4" /> {t("handover.dueBy")} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    value={dueDatetime}
                                    onChange={(e) => setDueDatetime(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium flex items-center gap-2">
                                <Repeat className="w-4 h-4" /> {t("handover.recurrence")}
                            </label>
                            <select
                                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                value={recurrence}
                                onChange={(e) => setRecurrence(e.target.value)}
                            >
                                <option value="none">{t("handover.recurrenceNone")}</option>
                                <option value="daily">{t("handover.recurrenceDaily")}</option>
                                <option value="weekly">{t("handover.recurrenceWeekly")}</option>
                                <option value="monthly">{t("handover.recurrenceMonthly")}</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t("handover.description")} <span className="text-red-500">*</span></label>
                            <textarea
                                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus:ring-1 focus:ring-primary"
                                placeholder={t("handover.whatToDo")}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <Button type="button" variant="ghost" onClick={onClose}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? t("common.saving") : t("handover.create")}
                            </Button>
                        </div>

                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
