import { describe, expect, it } from "vitest";
import { computeMenuPosition } from "./shiftContextMenu.position";

const viewport = { width: 1000, height: 700 };
const menu = { width: 240, height: 300 };

describe("computeMenuPosition", () => {
  it("places the menu right of the anchor, top-aligned", () => {
    const result = computeMenuPosition({ anchor: { top: 100, left: 200, right: 240, bottom: 130 }, menu, viewport });
    expect(result).toEqual({ top: 100, left: 246, placement: "right" });
  });

  it("flips to the left near the right edge", () => {
    const result = computeMenuPosition({ anchor: { top: 100, left: 900, right: 960, bottom: 130 }, menu, viewport });
    expect(result.placement).toBe("left");
    expect(result.left).toBe(900 - 6 - 240);
  });

  it("clamps vertically near the bottom edge", () => {
    const result = computeMenuPosition({ anchor: { top: 650, left: 200, right: 240, bottom: 680 }, menu, viewport });
    expect(result.placement).toBe("right");
    expect(result.top).toBe(700 - 300 - 8);
  });

  it("falls back to below/above in a narrow viewport", () => {
    const narrow = { width: 300, height: 700 };
    const below = computeMenuPosition({ anchor: { top: 100, left: 40, right: 100, bottom: 130 }, menu, viewport: narrow });
    expect(below.placement).toBe("below");
    expect(below.top).toBe(136);
    const tight = computeMenuPosition({ anchor: { top: 450, left: 40, right: 100, bottom: 480 }, menu: { width: 240, height: 300 }, viewport: { width: 300, height: 700 } });
    expect(tight.placement).toBe("above");
    expect(tight.top).toBe(450 - 6 - 300);
  });
});
