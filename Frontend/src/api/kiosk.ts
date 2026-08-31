import { api } from "./api";

export interface KioskMessage {
    id: number;
    title: string;
    body: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    created_at: string;
    created_by: string;
}

export async function fetchActiveKioskMessages(shiftCode: string): Promise<KioskMessage[]> {
    try {
        const res = await api.get("/kiosk/messages/active", {
            params: { shift: shiftCode }
        });
        return res.data?.data || [];
    } catch (e) {
        console.error("Failed to fetch kiosk messages", e);
        return [];
    }
}

export async function acknowledgeMessage(id: number, shiftCode: string) {
    await api.post(`/kiosk/messages/${id}/ack`, { shift: shiftCode });
}
