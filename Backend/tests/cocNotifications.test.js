import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.APP_MODE = "shiftplanner";
process.env.JWT_SECRET = "coc-notification-test-secret-with-sufficient-length";
process.env.COC_PUBLIC_URL = "https://shiftplanner.example.test";
process.env.COC_REVIEW_TOKEN_TTL = "14d";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_FROM = "coc@example.test";

const { createCocReviewLink, getCocMailStatus } = await import("../services/cocNotifications.js");

describe("CoC external review notifications", () => {
  it("reports a complete mail configuration without exposing credentials", () => {
    const status = getCocMailStatus();
    assert.equal(status.enabled, true);
    assert.equal(status.publicUrl, "https://shiftplanner.example.test");
    assert.deepEqual(status.missing, []);
    assert.equal("smtpPassword" in status, false);
  });

  it("creates a case link without embedding an authentication token", () => {
    const link = createCocReviewLink({ caseId: 42, userId: 17, displayName: "Test Manager" });
    const parsed = new URL(link);
    assert.equal(parsed.origin, "https://shiftplanner.example.test");
    assert.equal(parsed.pathname, "/coc");
    assert.equal(parsed.searchParams.get("caseId"), "42");
    assert.equal(parsed.searchParams.has("reviewToken"), false);
  });
});
