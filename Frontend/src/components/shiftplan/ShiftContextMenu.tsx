
import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Card } from "../ui/card";
import { useLanguage } from "../../context/LanguageContext";

type ShiftType = string;

interface Props {
    x: number;
    y: number;
    employeeName?: string; // [NEW]
    selectedCount?: number;
    onClose: () => void;
    onSelect: (value: ShiftType) => void;
}

export function ShiftContextMenu({ x, y, employeeName, selectedCount = 1, onClose, onSelect }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const { t, language } = useLanguage();
    const isGerman = language === "de";
    // Start invisible; reveal only after clamped position is computed.
    const [style, setStyle] = useState<CSSProperties>({ top: y, left: x, opacity: 0 });

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Clamp menu to viewport edges so it never overflows, then reveal.
    useLayoutEffect(() => {
        if (!ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const PADDING = 8;
        const clampedTop = Math.min(y, vh - rect.height - PADDING);
        const clampedLeft = Math.min(x, vw - rect.width - PADDING);
        setStyle({
            top: Math.max(PADDING, clampedTop),
            left: Math.max(PADDING, clampedLeft),
            opacity: 1,
        });
    }, [x, y]);

    return (
        <div
            ref={ref}
            className="fixed z-50 min-w-[140px] animate-in fade-in zoom-in-95 duration-100"
            style={style}
        >
            <Card className="p-1 shadow-xl border border-border bg-popover text-popover-foreground flex flex-col gap-0.5">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border/50 mb-1 flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground">{t("shiftContext.employee")}: {employeeName || "—"}</span>
                    <span>{selectedCount > 1 ? `${selectedCount} ${t("shiftContext.daysSelected")}` : `1 ${t("shiftContext.daySelected")}`}</span>
                </div>
                <MenuItem label={t("shiftContext.early1")} onClick={() => onSelect('E1')} />
                <MenuItem label={t("shiftContext.early2")} onClick={() => onSelect('E2')} />
                <MenuItem label={t("shiftContext.late1")} onClick={() => onSelect('L1')} />
                <MenuItem label={t("shiftContext.late2")} onClick={() => onSelect('L2')} />
                <MenuItem label={t("shiftContext.night")} onClick={() => onSelect('N')} />
                <div className="h-px bg-border my-1" />
                <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground">{t("shiftContext.halfShifts")}</div>
                <MenuItem label={t("shiftContext.halfEarly1")} onClick={() => onSelect('HE1')} />
                <MenuItem label={t("shiftContext.halfEarly2")} onClick={() => onSelect('HE2')} />
                <MenuItem label={t("shiftContext.halfLate1")} onClick={() => onSelect('HL1')} />
                <MenuItem label={t("shiftContext.halfLate2")} onClick={() => onSelect('HL2')} />
                <div className="h-px bg-border my-1" />
                <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground">{t("shiftContext.absence")}</div>
                <MenuItem label={t("shiftContext.vacation")} onClick={() => onSelect('ABSENCE:VACATION')} />
                <MenuItem label={t("shiftContext.sick")} onClick={() => onSelect('ABSENCE:SICK')} />
                <MenuItem label={t("shiftContext.training")} onClick={() => onSelect('ABSENCE:TRAINING')} />
                <MenuItem label={t("shiftContext.offsite")} onClick={() => onSelect('ABSENCE:OFFSITE')} />
                <div className="h-px bg-border my-1" />
                <MenuItem label={isGerman ? "Kommen/Gehen erfassen" : "Track arrival/departure"} onClick={() => onSelect('ATTENDANCE')} />
                <div className="h-px bg-border my-1" />
                <MenuItem label={t("shiftContext.clearDelete")} onClick={() => onSelect('')} danger />
                <div className="h-px bg-border my-1" />
                <MenuItem label={t("shiftContext.competencies")} onClick={() => onSelect('COMPETENCIES')} />
                <MenuItem label={t("shiftContext.changeHistory")} onClick={() => onSelect('HISTORY')} />
                <MenuItem label={t("shiftContext.manageRules")} onClick={() => onSelect('CONSTRAINTS')} />
            </Card>
        </div>
    );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button
            className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground ${danger ? "text-red-500 hover:text-red-600 hover:bg-red-50" : ""
                }`}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            {label}
        </button>
    );
}
