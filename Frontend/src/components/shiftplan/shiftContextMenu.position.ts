export type MenuRect = { top: number; left: number; right: number; bottom: number };

export type MenuPlacement = "right" | "left" | "below" | "above";

/**
 * Computes a viewport-fixed position for a popup anchored to a target element.
 * Preferred: right of the anchor, top-aligned. Flips to the left, then below/above
 * when there is no room, and finally clamps inside the viewport.
 */
export function computeMenuPosition(args: {
    anchor: MenuRect;
    menu: { width: number; height: number };
    viewport: { width: number; height: number };
    gap?: number;
    padding?: number;
}): { top: number; left: number; placement: MenuPlacement } {
    const { anchor, menu, viewport } = args;
    const gap = args.gap ?? 6;
    const pad = args.padding ?? 8;

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, Math.max(min, max)));
    const clampTop = (value: number) => clamp(value, pad, viewport.height - menu.height - pad);
    const clampLeft = (value: number) => clamp(value, pad, viewport.width - menu.width - pad);

    const rightLeft = anchor.right + gap;
    if (rightLeft + menu.width <= viewport.width - pad) {
        return { top: clampTop(anchor.top), left: rightLeft, placement: "right" };
    }

    const leftLeft = anchor.left - gap - menu.width;
    if (leftLeft >= pad) {
        return { top: clampTop(anchor.top), left: leftLeft, placement: "left" };
    }

    const belowTop = anchor.bottom + gap;
    if (belowTop + menu.height <= viewport.height - pad) {
        return { top: belowTop, left: clampLeft(anchor.left), placement: "below" };
    }

    const aboveTop = anchor.top - gap - menu.height;
    if (aboveTop >= pad) {
        return { top: aboveTop, left: clampLeft(anchor.left), placement: "above" };
    }

    return { top: clampTop(anchor.top), left: clampLeft(anchor.left), placement: "below" };
}
