// Queue API Client — uses the shared axios instance (JWT auto-injected via interceptor)
import { api, asArray, asObject } from "./api";

export interface QueueGroup {
    name: string;
    count: number;
}

export interface Ticket {
    id: number;
    external_id: string;
    queue_type: string;
    group_key: string;
    status: string;
    subtype: string;
    owner: string;
    sched_start: string;
    commit_date: string;
    active: boolean;
    [key: string]: any;
}

export interface QueueStats {
    expired: number;
    critical12h: number;
    critical24h: number;
    total: number;
}

export interface TicketWritebackResult {
    ok: boolean;
    error?: string;
    reason?: string;
    action?: Record<string, any> | null;
    validation?: { valid: boolean; errors: string[] } | null;
    execution?: { attempted: boolean; reason?: string };
    executionStatus?: string;
    message?: string;
    ticketId?: string | number | null;
}

export interface TicketResetAllResult extends TicketWritebackResult {
    resetCount: number;
    actionCount?: number;
    validationFailedCount?: number;
    actions?: Record<string, any>[];
}

export interface WritebackEmployee {
    id: number;
    name: string;
    email?: string | null;
    jarvisDisplayName?: string | null;
    jarvisOwnerCode?: string | null;
    jarvisInitials?: string | null;
    assignmentEligible?: boolean;
    autoAssignable?: boolean;
    blocked?: boolean;
}

export interface GroupSummary {
    group: string;
    count: number;
    overdue: number;
    critical12h: number;
}

const pendingWritebacks = new Map<string, Promise<TicketWritebackResult>>();

export function getWritebackBlockDisplay(result: Partial<TicketWritebackResult> | null | undefined): string | null {
    if (!result || result.error !== "WRITEBACK_BLOCKED") return null;
    const labels: Record<string, string> = {
        shadow_only_mode: "Shadow mode active",
        writeback_disabled: "Assignment writeback disabled",
        manual_confirmation_required: "Manual confirmation required",
        existing_owner_detected: "Existing owner detected",
        stale_crawler_snapshot: "Stale crawler snapshot",
        employee_not_eligible: "Employee not eligible",
        no_pending_assignment_action: "No pending assignment action",
        execution_already_running: "Writeback already running",
    };
    const label = labels[String(result.reason || "")] || "Writeback blocked";
    return result.message ? `${label}: ${result.message}` : label;
}

export function isWritebackButtonDisabled(canWriteback: boolean, busyAction: string | null | undefined): boolean {
    return !canWriteback || busyAction != null;
}

export const QueueApi = {
    getGroups: async (): Promise<Record<string, QueueGroup[]>> => {
        const res = await api.get("/queue/groups");
        return asObject(res.data, "QueueApi.getGroups") as Record<string, QueueGroup[]>;
    },

    getTickets: async (queueType?: string): Promise<Ticket[]> => {
        const res = await api.get("/queue/tickets", {
            params: queueType ? { queueType } : undefined,
        });
        return asArray(res.data, "QueueApi.getTickets");
    },

    getDueToday: async (): Promise<Ticket[]> => {
        const res = await api.get("/queue/tickets");
        return asArray(res.data, "QueueApi.getDueToday");
    },

    getMeta: async () => {
        const res = await api.get("/queue/tickets");
        const tickets = asArray(res.data, "QueueApi.getMeta");
        return { total: tickets.length, lastUpdate: new Date().toISOString() };
    },

    getStats: async (): Promise<QueueStats> => {
        return { expired: 0, critical12h: 0, critical24h: 0, total: 0 };
    },

    getHealth: async () => {
        // /health is at the root of /api, not under /queue
        const res = await api.get("/health");
        return res.data;
    },

    triggerTicketWriteback: async (ticketId: number | string): Promise<TicketWritebackResult> => {
        const key = String(ticketId);
        const existing = pendingWritebacks.get(key);
        if (existing) return existing;

        const request = api.post(`/assignment-actions/tickets/${ticketId}/writeback`)
            .then((res) => res.data)
            .catch((err) => {
                if (err?.response?.status === 409 && err.response?.data?.error === "WRITEBACK_BLOCKED") {
                    return err.response.data;
                }
                throw err;
            })
            .finally(() => {
                pendingWritebacks.delete(key);
            });

        pendingWritebacks.set(key, request);
        return request;
    },

    resetTicketAssignment: async (ticketId: number | string): Promise<TicketWritebackResult> => {
        const res = await api.post(`/assignment-actions/tickets/${ticketId}/reset`);
        return res.data;
    },

    resetAllTicketAssignments: async (): Promise<TicketResetAllResult> => {
        const res = await api.post("/assignment-actions/tickets/reset-all");
        return res.data;
    },

    getWritebackEmployees: async (): Promise<WritebackEmployee[]> => {
        const res = await api.get("/assignment-actions/writeback-employees");
        return asArray(res.data?.employees, "QueueApi.getWritebackEmployees") as WritebackEmployee[];
    },

    setTicketOdinOwner: async (ticketId: number | string, employeeId: number | string): Promise<TicketWritebackResult> => {
        const res = await api.post(`/assignment-actions/tickets/${ticketId}/odin-owner`, { employeeId });
        return res.data;
    },
};

export const queueApi = QueueApi;
