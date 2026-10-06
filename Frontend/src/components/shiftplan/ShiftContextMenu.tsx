import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from "../ui/card";
import { useLanguage } from "../../context/LanguageContext";
import { shiftTypes } from "../../store/shiftStore";
import { getShiftColorStyle } from "./shiftColors";
import { computeMenuPosition } from "./shiftContextMenu.position";

/** The only entries offered by the menu. SEMINAR is the existing seminar code (credited 8h per weekday). */
export const CONTEXT_MENU_SHIFT_CODES = ["E1", "E2", "L1", "L2", "N", "ABW", "SEMINAR"] as const;

interface Props {
    /** Element (grid cell) the menu belongs to. Position is derived from its bounding rect. */
    anchorEl: HTMLElement | null;
    employeeName?: string;
    selectedCount?: number;
    /** Human readable selected date(s), e.g. "17.-19.08.2026" */
    dateLabel?: string;
    /** Current shift code(s) of the selected cells */
    currentLabel?: string;
    onClose: () => void;
    /** Called with the plain shift code (E1, E2, L1, L2, N, ABW, SEMINAR) */
    onSelect: (code: string) => void;
}

export function ShiftContextMenu({ anchorEl, employeeName, selectedCount = 1, dateLabel, currentLabel, onClose, onSelect }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const { t, language } = useLanguage();
    const isGerman = language === "de";
    // Start invisible; reveal only after the anchored position is computed.
    const [style, setStyle] = useState<CSSProperties>({ top: 0, left: 0, opacity: 0 });

    const reposition = useCallback(() => {
        if (!anchorEl || !anchorEl.isConnected || !ref.current) {
            onClose();
            return;
        }
        const anchor = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // Anchor scrolled completely out of view -> close instead of floating at an unrelated place.
        if (anchor.bottom < 0 || anchor.top > vh || anchor.right < 0 || anchor.left > vw) {
            onClose();
            return;
        }
        const menuRect = ref.current.getBoundingClientRect();
        const pos = computeMenuPosition({
            anchor: { top: anchor.top, left: anchor.left, right: anchor.right, bottom: anchor.bottom },
            menu: { width: menuRect.width, height: menuRect.height },
            viewport: { width: vw, height: vh },
        });
        setStyle({ top: pos.top, left: pos.left, opacity: 1 });
    }, [anchorEl, onClose]);

    useLayoutEffect(() => {
        reposition();
    }, [reposition, selectedCount, employeeName]);

    // Keep the menu glued to its cell while any scroll container or the window moves/resizes.
    useEffect(() => {
        let frame = 0;
        const schedule = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(reposition);
        };
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
    }, [reposition]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const itemLabel = (code: string) => {
        if (code === "ABW") return isGerman ? "Abwesend" : "Absent";
        if (code === "SEMINAR") return "Seminar";
        return shiftTypes[code]?.time ?? "";
    };

    const menu = (
        <div
            ref={ref}
            className="fixed z-[100000] w-60 animate-in fade-in zoom-in-95 duration-100"
            style={style}
            onContextMenu={(e) => e.preventDefault()}
        >
            <Card className="p-1 shadow-xl border border-border bg-popover text-popover-foreground flex flex-col gap-0.5">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border/50 mb-1 flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground truncate">{t("shiftContext.employee")}: {employeeName || "—"}</span>
                    <span>
                        {selectedCount > 1 ? `${selectedCount} ${t("shiftContext.daysSelected")}` : `1 ${t("shiftContext.daySelected")}`}
                        {dateLabel ? ` · ${dateLabel}` : ""}
                    </span>
                    {currentLabel ? (
                        <span>{isGerman ? "Aktuell" : "Current"}: <span className="font-semibold text-foreground">{currentLabel}</span></span>
                    ) : null}
                </div>
                <div className="px-2 pb-1 text-[10px] font-bold uppercase text-muted-foreground">
                    {isGerman ? "Neue Schicht wählen" : "Choose new shift"}
                </div>
                {CONTEXT_MENU_SHIFT_CODES.map((code) => (
                    <MenuItem key={code} code={code} label={itemLabel(code)} onClick={() => onSelect(code)} />
                ))}
            </Card>
        </div>
    );

    return createPortal(menu, document.body);
}

function MenuItem({ code, label, onClick }: { code: string; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            className="w-full flex items-center gap-3 text-left px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            <span
                style={getShiftColorStyle(code)}
                className="inline-flex items-center justify-center min-w-[64px] h-[22px] px-2 text-[11px] font-bold rounded-md border"
            >
                {code}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </button>
    );
}
