import React from "react";
import { cn } from "../ui/utils";

/* ================================================ */
/* Shared page building blocks                      */
/* Flat, quiet surfaces: one border, no glow, no    */
/* gradients, no ambient animation.                 */
/* ================================================ */

/** Kept for compatibility: the former decorative keyframes are no longer used. */
export const ENT_GLOBAL_STYLES = "";

export const ENT_CARD_BASE: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--surface-border)",
    borderRadius: "8px",
    padding: "20px",
    boxShadow: "var(--surface-shadow)",
};

export const ENT_CARD_HOVER_GLOW = {
    ...ENT_CARD_BASE,
    borderColor: "var(--surface-border-strong)",
};

interface EnterprisePageShellProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export function EnterprisePageShell({ children, style, className, ...props }: EnterprisePageShellProps) {
    return (
        <div
            className={cn("relative flex min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto px-4 py-4 lg:px-6 lg:py-5", className)}
            style={{ background: "transparent", ...style }}
            {...props}
        >
            <div className="relative z-10 flex min-h-0 flex-col gap-4" style={{ flex: "1 1 0%" }}>
                {children}
            </div>
        </div>
    );
}

interface EnterpriseHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    icon?: React.ReactNode;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    rightContent?: React.ReactNode;
}

export function EnterpriseHeader({ icon, title, subtitle, rightContent, style, className, ...props }: EnterpriseHeaderProps) {
    return (
        <div
            className={cn("relative flex flex-wrap items-center justify-between gap-3", className)}
            style={{ ...ENT_CARD_BASE, padding: "14px 18px", ...style }}
            {...props}
        >
            <div className="flex items-center gap-3">
                {icon && (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-secondary text-primary">
                        {icon}
                    </div>
                )}
                <div className="flex flex-col">
                    <h1 className="text-base font-semibold text-foreground">{title}</h1>
                    {subtitle && <span className="mt-0.5 max-w-3xl text-[13px] leading-5 text-muted-foreground">{subtitle}</span>}
                </div>
            </div>
            {rightContent ? <div className="flex max-w-full flex-wrap items-center justify-end gap-2">{rightContent}</div> : null}
        </div>
    );
}

interface EnterpriseCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    delayMs?: number;
    noPadding?: boolean;
}

type EnterpriseFeatureHeroTone = "cyan" | "indigo" | "emerald" | "amber" | "rose" | "slate";

type EnterpriseFeatureHeroMetric = {
    label: React.ReactNode;
    value: React.ReactNode;
    helper?: React.ReactNode;
};

interface EnterpriseFeatureHeroProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
    eyebrow: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    metrics?: EnterpriseFeatureHeroMetric[];
    /** Kept for compatibility. The introduction card has one neutral look in every area. */
    tone?: EnterpriseFeatureHeroTone;
    rightContent?: React.ReactNode;
}

export function EnterpriseFeatureHero({ eyebrow, title, description, metrics = [], rightContent, className, style, ...props }: EnterpriseFeatureHeroProps) {
    return (
        <div
            className={cn("relative", className)}
            style={{ ...ENT_CARD_BASE, padding: "18px 20px", ...style }}
            {...props}
        >
            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr] lg:items-end">
                <div>
                    <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div>
                    <h2 className="mt-1 text-2xl font-semibold leading-tight text-foreground">{title}</h2>
                    <div className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</div>
                </div>
                {(metrics.length > 0 || rightContent) ? (
                    <div className="grid gap-3 sm:grid-cols-3 lg:justify-self-end">
                        {metrics.map((metric, index) => (
                            <div key={index} className="rounded-md border border-border bg-secondary/60 px-4 py-3">
                                <div className="text-xs font-medium text-muted-foreground">{metric.label}</div>
                                <div className="mt-1 text-sm font-semibold text-foreground">{metric.value}</div>
                                {metric.helper ? <div className="mt-1 text-xs text-muted-foreground">{metric.helper}</div> : null}
                            </div>
                        ))}
                        {rightContent ? <div className="sm:col-span-3">{rightContent}</div> : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function EnterpriseCard({ children, delayMs: _delayMs = 0, style, noPadding, className, ...props }: EnterpriseCardProps) {
    return (
        <div
            className={cn("relative overflow-hidden", className)}
            style={{
                ...ENT_CARD_BASE,
                padding: noPadding ? 0 : ENT_CARD_BASE.padding,
                display: "flex",
                flexDirection: "column",
                ...style,
            }}
            {...props}
        >
            {children}
        </div>
    );
}

interface EnterpriseKpiCardProps {
    label: string;
    value: number | string;
    sub?: React.ReactNode;
    color: string;
    accent: string;
    icon: React.ElementType;
    trend?: "up" | "down" | "neutral";
    index?: number;
    expanded?: boolean;
    onToggle?: () => void;
    children?: React.ReactNode;
    className?: string;     // For optional fixed height/width classes
    contentProps?: React.HTMLAttributes<HTMLDivElement>;
}

const TREND_LABEL: Record<"up" | "down" | "neutral", { symbol: string; color: string }> = {
    up: { symbol: "▲", color: "#2E7D55" },
    down: { symbol: "▼", color: "#C62828" },
    neutral: { symbol: "–", color: "var(--muted-foreground)" },
};

export function EnterpriseKpiCard({
    label, value, sub, accent, icon: Icon, trend,
    expanded, onToggle, children, className, contentProps
}: EnterpriseKpiCardProps) {
    return (
        <div
            className={className}
            style={{
                flex: expanded || children ? "1 1 100%" : "1 1 130px",
                minWidth: 120,
                background: "var(--card)",
                border: `1px solid ${expanded ? "var(--surface-border-strong)" : "var(--surface-border)"}`,
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--surface-shadow)",
                cursor: onToggle ? "pointer" : "default",
                position: "relative",
                overflow: "hidden",
            }}
        >
            <div
                onClick={onToggle}
                style={{ padding: "14px 16px", display: "flex", flexDirection: "column", flex: (expanded && children) ? "none" : 1 }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--muted-foreground)" }}>{label}</div>
                    <Icon style={{ width: 16, height: 16, color: accent, opacity: 0.9 }} />
                </div>
                {value !== undefined && value !== null && (
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                        <span style={{ fontSize: "26px", fontWeight: 600, lineHeight: 1.1, color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
                            {value}
                        </span>
                        {trend ? <span style={{ fontSize: 11, color: TREND_LABEL[trend].color }} aria-hidden="true">{TREND_LABEL[trend].symbol}</span> : null}
                    </div>
                )}
                {sub && <div style={{ fontSize: "12px", color: "var(--muted-foreground)", marginTop: "4px" }}>{sub}</div>}
                {onToggle ? <div style={{ position: "absolute", right: 12, bottom: 8, fontSize: 10, color: "var(--muted-foreground)" }} aria-hidden="true">{expanded ? "▲" : "▼"}</div> : null}
            </div>

            {expanded && children && (
                <div
                    {...contentProps}
                    style={{
                        borderTop: "1px solid var(--surface-border)",
                        padding: "12px 16px",
                        flex: 1,
                        overflowY: "auto",
                        minHeight: 0,
                        ...(contentProps?.style || {})
                    }}
                >
                    {children}
                </div>
            )}
        </div>
    );
}

export const ENT_SECTION_TITLE: React.CSSProperties = {
    fontSize: "12px", fontWeight: 600,
    color: "var(--muted-foreground)", marginBottom: "12px"
};
