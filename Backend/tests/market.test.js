import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEqixHistory } from "../routes/market.js";

describe("EQIX 12 month history", () => {
  it("maps aligned weekly closing prices and calculates the period metrics", () => {
    const result = parseEqixHistory({
      chart: {
        result: [{
          meta: { currency: "USD" },
          timestamp: [1724198400, 1724803200, 1725408000],
          indicators: { quote: [{ close: [800, null, 920] }] },
        }],
      },
    });
    assert.equal(result.points.length, 2);
    assert.equal(result.firstPrice, 800);
    assert.equal(result.lastPrice, 920);
    assert.equal(result.minPrice, 800);
    assert.equal(result.maxPrice, 920);
    assert.equal(result.change, 120);
    assert.equal(result.changePercent, 15);
  });

  it("rejects unusable history payloads", () => {
    assert.throws(() => parseEqixHistory({ chart: { result: [] } }), /history unavailable/);
  });
});
