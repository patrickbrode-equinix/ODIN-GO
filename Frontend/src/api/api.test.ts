/* ------------------------------------------------ */
/* UNIT TESTS – API HELPERS                         */
/* ------------------------------------------------ */
/* Run: npx vitest run src/api/api.test.ts          */

import { describe, it, expect, vi } from "vitest";
import { normalizeApiBaseUrl, detectHtml, asArray, asObject, isAdminSessionError, isJarvisIdentityError } from "./api";

describe("normalizeApiBaseUrl", () => {
    it('returns "/api" when input is empty', () => {
        expect(normalizeApiBaseUrl("")).toBe("/api");
        expect(normalizeApiBaseUrl(undefined)).toBe("/api");
    });
    it('keeps "/api" as-is', () => {
        expect(normalizeApiBaseUrl("/api")).toBe("/api");
    });
    it('appends "/api" to bare host URL', () => {
        expect(normalizeApiBaseUrl("http://localhost:8001")).toBe("http://localhost:8001/api");
    });
    it('keeps URL that already ends with /api', () => {
        expect(normalizeApiBaseUrl("http://localhost:8001/api")).toBe("http://localhost:8001/api");
    });
    it("strips trailing slashes", () => {
        expect(normalizeApiBaseUrl("http://localhost:8001/")).toBe("http://localhost:8001/api");
        expect(normalizeApiBaseUrl("/api/")).toBe("/api");
    });
});

describe("detectHtml", () => {
    it("detects doctype HTML", () => {
        expect(detectHtml("<!doctype html><html><body>Hi</body></html>")).toBe(true);
    });
    it("detects <html> tag", () => {
        expect(detectHtml("<html><head></head></html>")).toBe(true);
    });
    it("returns false for JSON string", () => {
        expect(detectHtml('{"key":"value"}')).toBe(false);
    });
    it("returns false for non-string values", () => {
        expect(detectHtml(42)).toBe(false);
        expect(detectHtml(null)).toBe(false);
        expect(detectHtml(undefined)).toBe(false);
        expect(detectHtml([1, 2])).toBe(false);
    });
});

describe("isJarvisIdentityError", () => {
    it("recognizes an expired or missing Jarvis identity response", () => {
        expect(isJarvisIdentityError(401, { code: "JARVIS_IDENTITY_REQUIRED" })).toBe(true);
    });

    it("does not confuse other authorization errors with Jarvis identity", () => {
        expect(isJarvisIdentityError(401, { message: "Invalid local application key" })).toBe(false);
        expect(isJarvisIdentityError(403, { code: "JARVIS_IDENTITY_REQUIRED" })).toBe(false);
    });
});

describe("isAdminSessionError", () => {
    it("recognizes an expired standalone admin session", () => {
        expect(isAdminSessionError(401, { code: "ADMIN_SESSION_EXPIRED" })).toBe(true);
    });

    it("does not clear the admin session for unrelated permission errors", () => {
        expect(isAdminSessionError(403, { code: "INSUFFICIENT_PERMISSION" })).toBe(false);
        expect(isAdminSessionError(401, { code: "JARVIS_IDENTITY_REQUIRED" })).toBe(false);
    });
});

describe("asArray", () => {
    it("returns the array unchanged when given an array", () => {
        const arr = [1, 2, 3];
        expect(asArray(arr, "test")).toEqual([1, 2, 3]);
    });
    it("returns [] for HTML string and logs error", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });
        const result = asArray("<!doctype html><html>…</html>", "testCtx");
        expect(result).toEqual([]);
        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining("[Shiftplanner][API] HTML returned instead of JSON in testCtx")
        );
        spy.mockRestore();
    });
    it("returns [] for undefined / null", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
        expect(asArray(undefined, "test")).toEqual([]);
        expect(asArray(null, "test")).toEqual([]);
        spy.mockRestore();
    });
    it("returns [] for a plain object", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
        expect(asArray({ a: 1 }, "test")).toEqual([]);
        spy.mockRestore();
    });
    it("returns [] for a number", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
        expect(asArray(42, "test")).toEqual([]);
        spy.mockRestore();
    });
});

describe("asObject", () => {
    it("returns the object unchanged when given an object", () => {
        const obj = { key: "value" };
        expect(asObject(obj, "test")).toEqual({ key: "value" });
    });
    it("returns {} for HTML string and logs error", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });
        const result = asObject("<!doctype html><html>…</html>", "testCtx");
        expect(result).toEqual({});
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
    it("returns {} for undefined / null", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
        expect(asObject(undefined, "test")).toEqual({});
        expect(asObject(null, "test")).toEqual({});
        spy.mockRestore();
    });
    it("returns {} for an array", () => {
        const spy = vi.spyOn(console, "warn").mockImplementation(() => { });
        expect(asObject([1, 2], "test")).toEqual({});
        spy.mockRestore();
    });
});
