import { api, asArray } from "./api";

export type ActivityLogInput = {
    action: string;
    module: string;
    details?: Record<string, unknown>;
    entityType?: string;
    entityId?: string;
    correlationId?: string;
};

export interface ActivityLogEntry {
    id: number;
    ts: string;
    actor: string;
    action_type: string;
    module: string;
    entity_type?: string;
    entity_id?: string;
    correlation_id?: string;
    payload?: any;
}

export async function getActivityLog(params: {
    limit?: number;
    offset?: number;
    module?: string;
    action?: string;
    actor?: string;
    start?: string;
    end?: string;
}) {
    const res = await api.get<ActivityLogEntry[]>("/activity", { params });
    return asArray(res.data, "getActivityLog");
}

export async function getActivityStats() {
    const res = await api.get<{ module: string, count: string }[]>("/activity/stats");
    return asArray(res.data, "getActivityStats");
}

export async function logActivityEvent(input: ActivityLogInput) {
    return api.post("/activity/log", {
        action: input.action,
        module: input.module,
        details: input.details,
        entityType: input.entityType,
        entityId: input.entityId,
        correlationId: input.correlationId,
    });
}

export function logActivityEventSafe(input: ActivityLogInput) {
    void logActivityEvent(input).catch(() => {});
}
