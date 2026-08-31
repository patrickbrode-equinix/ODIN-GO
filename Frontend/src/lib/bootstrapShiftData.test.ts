/**
 * frontend/src/lib/bootstrapShiftData.test.ts
 *
 * Regression: verifies that bootstrapShiftData() populates useShiftStore
 * with schedule data and that it is idempotent (no double API calls).
 *
 * Run: npx vitest run src/lib/bootstrapShiftData.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/* ---- Mocks (must be before import of the module under test) ---- */

const mockSetSchedule   = vi.fn();
const mockSetSelectedMonth = vi.fn();
const mockSetDaysInMonth   = vi.fn();
const mockStoreState: { schedulesByMonth: Record<string, any>; selectedMonth: string | null } = {
  schedulesByMonth: {},
  selectedMonth: null,
};

vi.mock("../store/shiftStore", () => ({
  useShiftStore: {
    getState: () => ({
      schedulesByMonth: mockStoreState.schedulesByMonth,
      selectedMonth:    mockStoreState.selectedMonth,
      setSchedule:      mockSetSchedule,
      setSelectedMonth: mockSetSelectedMonth,
      setDaysInMonth:   mockSetDaysInMonth,
    }),
  },
}));

const mockFetchSchedule = vi.fn();
vi.mock("../components/shiftplan/shiftplan.api", () => ({
  fetchSchedule: (...args: any[]) => mockFetchSchedule(...args),
}));

vi.mock("../utils/dateFormat", () => ({
  formatMonthLabel: (_y: number, _m: number, _l: string) => "März 2026",
}));

/* ---- Import after mocks ---- */
// We import dynamically so each test gets a fresh module (inFlight reset)
// Instead we call bootstrapShiftData and reset the inFlight flag via re-import.

describe("bootstrapShiftData", () => {
  beforeEach(async () => {
    mockSetSchedule.mockClear();
    mockSetSelectedMonth.mockClear();
    mockSetDaysInMonth.mockClear();
    mockFetchSchedule.mockClear();
    mockStoreState.schedulesByMonth = {};
    mockStoreState.selectedMonth = null;

    // Reset module to clear inFlight state between tests
    vi.resetModules();
  });

  it("fetches schedule and populates store when cache is empty", async () => {
    mockFetchSchedule.mockResolvedValueOnce({
      schedule: { "Mustermann, Max": { 5: "E1" } },
      meta: { year: 2026, month: 3 },
    });

    // fresh import after resetModules
    const { bootstrapShiftData } = await import("./bootstrapShiftData");
    await bootstrapShiftData();

    expect(mockFetchSchedule).toHaveBeenCalledWith("März 2026");
    expect(mockSetSchedule).toHaveBeenCalledWith(
      "März 2026",
      { "Mustermann, Max": { 5: "E1" } }
    );
    expect(mockSetSelectedMonth).toHaveBeenCalledWith("März 2026");
    expect(mockSetDaysInMonth).toHaveBeenCalledWith(31); // March has 31 days
  });

  it("skips API call when current month already cached (idempotency guard)", async () => {
    // Pre-populate cache
    mockStoreState.schedulesByMonth = {
      "März 2026": { "Müller, Hans": { 5: "L1" } },
    };

    const { bootstrapShiftData } = await import("./bootstrapShiftData");
    await bootstrapShiftData(); // should return early

    expect(mockFetchSchedule).not.toHaveBeenCalled();
    expect(mockSetSchedule).not.toHaveBeenCalled();
  });

  it("force=true bypasses guard and re-fetches", async () => {
    mockStoreState.schedulesByMonth = {
      "März 2026": { "Müller, Hans": { 5: "L1" } },
    };
    mockFetchSchedule.mockResolvedValueOnce({
      schedule: { "Müller, Hans": { 5: "E2" } },
      meta: null,
    });

    const { bootstrapShiftData } = await import("./bootstrapShiftData");
    await bootstrapShiftData(true);

    expect(mockFetchSchedule).toHaveBeenCalledWith("März 2026");
    expect(mockSetSchedule).toHaveBeenCalledWith(
      "März 2026",
      { "Müller, Hans": { 5: "E2" } }
    );
  });

  it("does not throw when API returns an error (app remains stable)", async () => {
    mockFetchSchedule.mockRejectedValueOnce(new Error("Network error"));

    const { bootstrapShiftData } = await import("./bootstrapShiftData");
    await expect(bootstrapShiftData()).resolves.toBeUndefined();

    expect(mockSetSchedule).not.toHaveBeenCalled();
  });

  it("re-throws 401 errors for auth handling", async () => {
    const err = { response: { status: 401 } };
    mockFetchSchedule.mockRejectedValueOnce(err);

    const { bootstrapShiftData } = await import("./bootstrapShiftData");
    await expect(bootstrapShiftData()).rejects.toEqual(err);
  });

  it("sets selectedMonth if missing but cache is populated", async () => {
    mockStoreState.schedulesByMonth = {
      "März 2026": { "Maier, Lisa": { 5: "N" } },
    };
    // selectedMonth is null → bootstrap should set it without fetching
    mockStoreState.selectedMonth = null;

    const { bootstrapShiftData } = await import("./bootstrapShiftData");
    await bootstrapShiftData();

    expect(mockFetchSchedule).not.toHaveBeenCalled();
    expect(mockSetSelectedMonth).toHaveBeenCalledWith("März 2026");
  });
});
