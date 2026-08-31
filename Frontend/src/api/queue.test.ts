import { describe, it, expect, vi, beforeEach } from "vitest";

const postMock = vi.fn();
const getMock = vi.fn();

vi.mock("./api", () => ({
    api: {
        get: getMock,
        post: postMock,
    },
    asArray: (data: any) => Array.isArray(data) ? data : [],
    asObject: (data: any) => data && typeof data === "object" && !Array.isArray(data) ? data : {},
}));

describe("QueueApi writeback handling", () => {
    beforeEach(() => {
        getMock.mockReset();
        postMock.mockReset();
        vi.resetModules();
    });

    it("does not retry 409 writeback blocks and returns the backend reason", async () => {
        postMock.mockRejectedValueOnce({
            response: {
                status: 409,
                data: {
                    error: "WRITEBACK_BLOCKED",
                    reason: "shadow_only_mode",
                    message: "Shadow mode is active. Jarvis will not be changed.",
                    ticketId: "3644528",
                    executionStatus: "shadow_validated",
                },
            },
        });

        const { QueueApi, getWritebackBlockDisplay } = await import("./queue");
        const result = await QueueApi.triggerTicketWriteback("3644528");

        expect(postMock).toHaveBeenCalledTimes(1);
        expect(result.reason).toBe("shadow_only_mode");
        expect(getWritebackBlockDisplay(result)).toContain("Shadow mode active");
    });

    it("dedupes concurrent writeback requests per ticket id", async () => {
        let resolveRequest: (value: any) => void = () => {};
        postMock.mockReturnValueOnce(new Promise((resolve) => {
            resolveRequest = resolve;
        }));

        const { QueueApi } = await import("./queue");
        const first = QueueApi.triggerTicketWriteback("42");
        const second = QueueApi.triggerTicketWriteback("42");

        expect(postMock).toHaveBeenCalledTimes(1);
        resolveRequest({ data: { ok: true } });

        await expect(first).resolves.toEqual({ ok: true });
        await expect(second).resolves.toEqual({ ok: true });
    });

    it("disables the writeback button while a request is pending", async () => {
        const { isWritebackButtonDisabled } = await import("./queue");

        expect(isWritebackButtonDisabled(true, "queue-42-writeback")).toBe(true);
        expect(isWritebackButtonDisabled(false, null)).toBe(true);
        expect(isWritebackButtonDisabled(true, null)).toBe(false);
    });

    it("loads selectable writeback employees", async () => {
        getMock.mockResolvedValueOnce({
            data: {
                employees: [{ id: 10, name: "Test Employee", jarvisOwnerCode: "TE" }],
            },
        });

        const { QueueApi } = await import("./queue");
        await expect(QueueApi.getWritebackEmployees()).resolves.toEqual([
            { id: 10, name: "Test Employee", jarvisOwnerCode: "TE" },
        ]);
        expect(getMock).toHaveBeenCalledWith("/assignment-actions/writeback-employees");
    });

    it("sets a local ODIN owner before triggering crawler writeback", async () => {
        postMock.mockResolvedValueOnce({
            data: {
                ok: true,
                message: "ODIN test owner set.",
            },
        });

        const { QueueApi } = await import("./queue");
        const result = await QueueApi.setTicketOdinOwner(42, 10);

        expect(postMock).toHaveBeenCalledWith("/assignment-actions/tickets/42/odin-owner", { employeeId: 10 });
        expect(result.ok).toBe(true);
    });
});
