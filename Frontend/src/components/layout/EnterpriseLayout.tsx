import React from "react";
import { cn } from "../ui/utils";
import { useTheme } from "../ThemeProvider";

export const ENT_GLOBAL_STYLES = `
@keyframes fadeSlideUp {
  from { opacity:0; transform:translateY(22px) scale(0.97); }
  to   { opacity:1; transform:translateY(0)    scale(1);    }
}
@keyframes fadeSlideRight {
  from { opacity:0; transform:translateX(-14px); }
  to   { opacity:1; transform:translateX(0);     }
}
@keyframes glowPulse {
  0%,100% { box-shadow:0 0 0 0 rgba(59,130,246,0); }
    50%     { box-shadow:0 0 44px 12px rgba(56,189,248,0.22); }
}
@keyframes dotPulse {
  0%,100% { opacity:1; transform:scale(1);   }
  50%     { opacity:0.5; transform:scale(0.7); }
}
@keyframes shimmer {
  from { background-position:-200% center; }
  to   { background-position: 200% center; }
}
@keyframes arcDraw {
  from { stroke-dashoffset: var(--arc-len); }
  to   { stroke-dashoffset: 0; }
}
@keyframes ambientFloat1 {
  0%,100% { transform: translate(0,0) scale(1); }
  33% { transform: translate(30px,-16px) scale(1.08); }
  66% { transform: translate(-15px,10px) scale(0.96); }
}
@keyframes ambientFloat2 {
  0%,100% { transform: translate(0,0) scale(1); }
  40% { transform: translate(-22px,18px) scale(1.06); }
  70% { transform: translate(18px,-12px) scale(0.94); }
}
@keyframes ambientFloat3 {
    0%,100% { transform: translate(0,0) scale(1); }
    50% { transform: translate(14px,-22px) scale(1.06); }
}
@keyframes shellSweep {
    0% { transform: translateX(-120%); opacity: 0; }
    18% { opacity: 0.82; }
    100% { transform: translateX(240%); opacity: 0; }
}
@keyframes kpiRingPulse {
    0%,100% { box-shadow: 0 0 0 0 var(--kpi-accent-glow, rgba(56,189,248,0.0)); }
    50% { box-shadow: 0 0 24px 6px var(--kpi-accent-glow, rgba(56,189,248,0.15)); }
}
@keyframes pageReveal {
    from { opacity: 0; transform: translateY(12px) scale(0.995); filter: blur(4px); }
    to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes borderGlow {
    0%,100% { border-color: rgba(56,189,248,0.12); }
    50% { border-color: rgba(56,189,248,0.32); }
}
@keyframes heroShine {
    0% { transform: translateX(-100%) rotate(-12deg); }
    100% { transform: translateX(300%) rotate(-12deg); }
}
.stat-card {
  animation: fadeSlideUp 0.55s cubic-bezier(.22,.68,0,1.2) both;
    transition: transform 0.28s cubic-bezier(.22,.68,0,1.05), border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
    contain: layout style;
}
.stat-card::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.42), rgba(37, 99, 235, 0.22), transparent);
    opacity: 0.88;
    pointer-events: none;
}
.stat-card:hover {
    transform: translateY(-5px) scale(1.006);
    border-color: rgba(59,130,246,0.52);
    box-shadow: 0 56px 140px rgba(15,23,42,0.24), 0 0 90px rgba(56,189,248,0.18), 0 0 0 1px rgba(56,189,248,0.12);
}
.stat-card:hover::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(56,189,248,0.03) 0%, transparent 50%);
    pointer-events: none;
}
.kpi-card {
  animation: fadeSlideRight 0.5s cubic-bezier(.22,.68,0,1.1) both;
}
.kpi-card:hover {
    transform: translateY(-3px) scale(1.012);
    animation: kpiRingPulse 2.5s ease-in-out infinite;
}
.ent-page-content {
    animation: pageReveal 0.4s cubic-bezier(.22,.68,0,1.05) both;
}
`;

export const ENT_CARD_BASE: React.CSSProperties = {
    background: "var(--surface-hero-strong)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid var(--surface-border)",
    borderRadius: "28px",
    padding: "22px",
    boxShadow: "var(--surface-shadow-strong)",
    transition: "transform 0.28s ease, box-shadow 0.22s ease, border-color 0.22s ease",
};

export const ENT_CARD_HOVER_GLOW = {
    ...ENT_CARD_BASE,
    boxShadow: "var(--surface-shadow-strong)",
    borderColor: "var(--surface-border-strong)",
};

interface EnterprisePageShellProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
}

export function EnterprisePageShell({ children, style, className, ...props }: EnterprisePageShellProps) {
    return (
        <>
            <style>{ENT_GLOBAL_STYLES}</style>
            <div
                className={cn(
                    "odin-stage-frame relative isolate flex min-h-0 flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-[30px] px-3 py-3 sm:gap-4.5 sm:px-4 sm:py-4 lg:px-5 lg:py-5",
                    className,
                )}
                style={{
                    background: "transparent",
                    ...style
                }}
                {...props}
            >
                <div
                    className="pointer-events-none absolute inset-0 dark:hidden"
                    aria-hidden
                    style={{
                        background: "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0) 32%)",
                    }}
                />
                <div
                    className="pointer-events-none absolute inset-0 opacity-40 dark:hidden"
                    aria-hidden
                    style={{
                        backgroundImage: "linear-gradient(rgba(0,0,0,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.028) 1px, transparent 1px)",
                        backgroundSize: "28px 28px",
                        maskImage: "linear-gradient(180deg, rgba(0,0,0,0.60), transparent 80%)",
                    }}
                />
                {/* Noise texture for premium matte depth */}
                <div className="pointer-events-none absolute inset-0 opacity-[0.025] dark:opacity-[0.03] mix-blend-overlay" aria-hidden style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat" }} />
                <div className="pointer-events-none absolute left-3 top-3 h-4 w-4 rounded-tl-[10px] border-l border-t border-[rgba(0,0,0,0.10)] dark:border-cyan-300/24" aria-hidden />
                <div className="pointer-events-none absolute right-3 top-3 h-4 w-4 rounded-tr-[10px] border-r border-t border-[rgba(0,0,0,0.10)] dark:border-cyan-300/24" aria-hidden />
                <div className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 rounded-bl-[10px] border-b border-l border-[rgba(0,0,0,0.07)] dark:border-cyan-300/16" aria-hidden />
                <div className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 rounded-br-[10px] border-b border-r border-[rgba(0,0,0,0.07)] dark:border-cyan-300/16" aria-hidden />
                {/* Ambient glow orbs (dark mode only, hidden in light mode via CSS) */}
                <div className="pointer-events-none absolute inset-0 hidden overflow-hidden dark:block" aria-hidden>
                    {/* blur capped at 80px — blur(160px) was repaint-expensive */}
                    <div
                        className="odin-ambient-orb absolute rounded-full blur-[80px]"
                        style={{ width: 520, height: 320, background: "radial-gradient(ellipse, rgba(34,211,238,0.13), transparent 68%)", top: "3%", left: "8%", animation: "ambientFloat1 18s ease-in-out infinite" }}
                    />
                    <div
                        className="odin-ambient-orb absolute rounded-full blur-[72px]"
                        style={{ width: 420, height: 260, background: "radial-gradient(ellipse, rgba(79,70,229,0.12), transparent 68%)", top: "38%", right: "6%", animation: "ambientFloat2 22s ease-in-out infinite" }}
                    />
                    <div
                        className="odin-ambient-orb absolute rounded-full blur-[72px]"
                        style={{ width: 360, height: 240, background: "radial-gradient(ellipse, rgba(245,158,11,0.09), transparent 68%)", bottom: "6%", left: "32%", animation: "ambientFloat3 20s ease-in-out infinite" }}
                    />
                    <div
                        className="odin-ambient-orb absolute rounded-full blur-[60px]"
                        style={{ width: 280, height: 200, background: "radial-gradient(ellipse, rgba(236,72,153,0.07), transparent 70%)", top: "22%", left: "55%", animation: "ambientFloat1 26s ease-in-out infinite reverse" }}
                    />
                    <div
                        className="odin-ambient-orb absolute rounded-full blur-[56px]"
                        style={{ width: 200, height: 150, background: "radial-gradient(ellipse, rgba(16,185,129,0.06), transparent 70%)", top: "65%", right: "30%", animation: "ambientFloat3 30s ease-in-out infinite reverse" }}
                    />
                </div>
                <div className="pointer-events-none absolute inset-x-0 top-10 h-24 opacity-75" aria-hidden style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.14) 50%, transparent 100%)", filter: "blur(22px)" }} />
                <div className="ent-page-content relative z-10 flex min-h-0 flex-col gap-4 sm:gap-4.5" style={{ flex: "1 1 0%" }}>
                    {children}
                </div>
            </div>
        </>
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
            className={cn("stat-card odin-stage-frame relative overflow-hidden", className)}
            style={{
                ...ENT_CARD_BASE,
                padding: "22px 26px",
                background: "radial-gradient(circle at 88% 18%, rgba(0,113,227,0.06), transparent 26%), linear-gradient(140deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04) 18%, rgba(255,255,255,0) 32%), var(--surface-hero-strong)",
                border: "1px solid var(--surface-border-strong)",
                display: "flex",
                alignItems: "center",
                justifyItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "14px",
                ...style
            }}
            {...props}
        >
            <div className="pointer-events-none absolute inset-y-0 right-0 w-72 dark:opacity-100 opacity-[0.10]" aria-hidden style={{ background: "radial-gradient(circle at center, rgba(56,189,248,0.38), transparent 66%)" }} />
            <div className="pointer-events-none absolute inset-y-0 left-0 w-72 dark:opacity-100 opacity-[0.08]" aria-hidden style={{ background: "radial-gradient(circle at center, rgba(37,99,235,0.28), transparent 72%)" }} />
            <div className="pointer-events-none absolute -bottom-6 right-[12%] h-32 w-32 rounded-full opacity-35 blur-3xl dark:hidden" aria-hidden style={{ background: "rgba(245,158,11,0.18)" }} />
            <div className="pointer-events-none absolute inset-y-0 left-[-12%] w-32 opacity-70" aria-hidden style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.28) 55%, transparent 100%)", filter: "blur(18px)", animation: "shellSweep 7.5s linear infinite" }} />
            {/* Subtle top highlight */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px hidden dark:block" style={{ background: "linear-gradient(90deg, transparent 10%, rgba(59,130,246,0.3) 50%, transparent 90%)" }} />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px dark:hidden" style={{ background: "linear-gradient(90deg, transparent 10%, rgba(0,113,227,0.18) 50%, transparent 90%)" }} />

            {/* TITLE & ICON (LEFT) */}
            <div className="relative z-10 flex items-center gap-4">
                {icon && (
                    <div className="theme-glass-inset flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-400/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_22px_36px_rgba(56,189,248,0.10)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_36px_rgba(14,165,233,0.10)]">
                        {icon}
                    </div>
                )}
                <div className="flex flex-col">
                    <h1 className="font-display-brand flex items-center gap-2 text-[19px] font-black tracking-[0.24em] uppercase bg-linear-to-r from-foreground via-foreground to-foreground/70 dark:from-white dark:via-cyan-100 dark:to-blue-200/80 bg-clip-text text-transparent drop-shadow-[0_0_1px_rgba(0,0,0,0.1)] dark:drop-shadow-[0_0_10px_rgba(0,229,255,0.35)]">
                        {title}
                    </h1>
                    {subtitle && (
                        <span className="mt-1.5 max-w-3xl text-[12px] font-medium leading-relaxed text-muted-foreground sm:text-[13px]">
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>

            {/* RIGHT CONTENT */}
            <div className="relative z-10 flex max-w-full flex-wrap items-center justify-end gap-3 sm:gap-6">
                {rightContent && (
                    <div className="flex max-w-full flex-wrap items-center gap-2">
                        {rightContent}
                    </div>
                )}
            </div>
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

interface EnterpriseFeatureHeroProps extends React.HTMLAttributes<HTMLDivElement> {
    eyebrow: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    metrics?: EnterpriseFeatureHeroMetric[];
    tone?: EnterpriseFeatureHeroTone;
    rightContent?: React.ReactNode;
}

const ENTERPRISE_FEATURE_HERO_TONES: Record<EnterpriseFeatureHeroTone, { glow: string; border: string; text: string; }> = {
    cyan: {
        glow: "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 32%), radial-gradient(circle at 86% 10%, rgba(59,130,246,0.12), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 20%, transparent 38%), var(--surface-hero-strong)",
        border: "rgba(34,211,238,0.16)",
        text: "rgba(165,243,252,0.72)",
    },
    indigo: {
        glow: "radial-gradient(circle at top left, rgba(129,140,248,0.18), transparent 32%), radial-gradient(circle at 86% 10%, rgba(34,211,238,0.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 20%, transparent 38%), var(--surface-hero-strong)",
        border: "rgba(129,140,248,0.18)",
        text: "rgba(199,210,254,0.78)",
    },
    emerald: {
        glow: "radial-gradient(circle at top left, rgba(16,185,129,0.18), transparent 32%), radial-gradient(circle at 86% 10%, rgba(34,211,238,0.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 20%, transparent 38%), var(--surface-hero-strong)",
        border: "rgba(16,185,129,0.18)",
        text: "rgba(167,243,208,0.78)",
    },
    amber: {
        glow: "radial-gradient(circle at top left, rgba(245,158,11,0.18), transparent 32%), radial-gradient(circle at 86% 10%, rgba(56,189,248,0.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 20%, transparent 38%), var(--surface-hero-strong)",
        border: "rgba(245,158,11,0.18)",
        text: "rgba(253,230,138,0.78)",
    },
    rose: {
        glow: "radial-gradient(circle at top left, rgba(244,63,94,0.18), transparent 32%), radial-gradient(circle at 86% 10%, rgba(168,85,247,0.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 20%, transparent 38%), var(--surface-hero-strong)",
        border: "rgba(244,63,94,0.18)",
        text: "rgba(254,205,211,0.78)",
    },
    slate: {
        glow: "radial-gradient(circle at top left, rgba(148,163,184,0.16), transparent 32%), radial-gradient(circle at 86% 10%, rgba(56,189,248,0.08), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.03) 20%, transparent 38%), var(--surface-hero-strong)",
        border: "rgba(148,163,184,0.18)",
        text: "rgba(226,232,240,0.76)",
    },
};

export function EnterpriseFeatureHero({ eyebrow, title, description, metrics = [], tone = "cyan", rightContent, className, style, ...props }: EnterpriseFeatureHeroProps) {
    const palette = ENTERPRISE_FEATURE_HERO_TONES[tone];
    const { theme } = useTheme();
    const isLight = theme === "light";

    // In light mode: eyebrow uses a dark accessible color, background is cleaned up
    const eyebrowColor = isLight ? "#48484A" : palette.text;
    const cardBackground = isLight
        ? "var(--surface-hero-strong)"
        : palette.glow;
    const cardBorder = isLight ? "1px solid rgba(0,0,0,0.08)" : `1px solid ${palette.border}`;

    return (
        <div
            className={cn("stat-card odin-stage-frame relative overflow-hidden", className)}
            style={{
                ...ENT_CARD_BASE,
                padding: "24px",
                background: cardBackground,
                border: cardBorder,
                ...style,
            }}
            {...props}
        >
            <div className="pointer-events-none absolute inset-y-0 left-[-16%] w-28 opacity-60" aria-hidden style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.22) 55%, transparent 100%)", filter: "blur(18px)", animation: "shellSweep 8.5s linear infinite" }} />
            <div className="relative z-10 grid gap-5 lg:grid-cols-[1.3fr_0.9fr] lg:items-end">
                <div>
                    <div className="font-display-brand text-[10px] font-black uppercase tracking-[0.34em]" style={{ color: eyebrowColor }}>
                        {eyebrow}
                    </div>
                    <h2 className="font-display-brand mt-3 text-[34px] font-black leading-none tracking-[-0.04em] text-foreground sm:text-[38px]">
                        {title}
                    </h2>
                    <div className="mt-3 max-w-2xl text-sm leading-7 text-foreground/72 dark:text-slate-300/88">
                        {description}
                    </div>
                </div>
                {(metrics.length > 0 || rightContent) ? (
                    <div className="grid gap-3 sm:grid-cols-3 lg:justify-self-end">
                        {metrics.map((metric, index) => (
                            <div className="rounded-[20px] border border-white/8 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600 dark:text-slate-400">{metric.label}</div>
                                <div className="mt-2 text-sm font-black text-foreground dark:text-white">{metric.value}</div>
                                {metric.helper ? <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{metric.helper}</div> : null}
                            </div>
                        ))}
                        {rightContent ? <div className="sm:col-span-3">{rightContent}</div> : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function EnterpriseCard({ children, delayMs = 0, style, noPadding, className, ...props }: EnterpriseCardProps) {
    return (
        <div
            className={cn("stat-card odin-stage-frame relative overflow-hidden", className)}
            style={{
                ...ENT_CARD_BASE,
                padding: noPadding ? 0 : ENT_CARD_BASE.padding,
                animationDelay: `${delayMs}ms`,
                display: "flex",
                flexDirection: "column",
                ...style
            }}
            {...props}
        >
            <div className="pointer-events-none absolute inset-y-0 right-0 w-48 opacity-[0.12] dark:opacity-100" aria-hidden style={{ background: "radial-gradient(circle at center, rgba(56,189,248,0.16), transparent 68%)" }} />
            <div className="pointer-events-none absolute left-5 top-0 h-28 w-40 opacity-80 dark:opacity-100" aria-hidden style={{ background: "radial-gradient(circle at top, rgba(255,255,255,0.22), transparent 70%)" }} />
            <div className="pointer-events-none absolute inset-y-0 left-[-18%] w-32 opacity-65" aria-hidden style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.26) 55%, transparent 100%)", filter: "blur(16px)", animation: "shellSweep 7.8s linear infinite" }} />
            {/* Subtle top highlight for dark mode */}
            <div className="pointer-events-none absolute inset-x-4 top-0 h-px hidden dark:block" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)" }} />
            {/* Subtle top highlight for light mode — clean neutral white sheen */}
            <div className="pointer-events-none absolute inset-x-5 top-0 h-px dark:hidden" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,1.0) 30%, rgba(255,255,255,0.80) 70%, transparent)" }} />
            {/* Bottom edge subtle accent */}
            <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px dark:block hidden" style={{ background: "linear-gradient(90deg, transparent, rgba(56,189,248,0.14), transparent)", opacity: 0.7 }} />
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

export function EnterpriseKpiCard({
    label, value, sub, color, accent, icon: Icon, trend, index = 0,
    expanded, onToggle, children, className, contentProps
}: EnterpriseKpiCardProps) {
    const [hovered, setHovered] = React.useState(false);
    const { theme } = useTheme();
    const isLight = theme === "light";

    // Using Lucide icons for trend directly is preferred, or passing raw SVGs. We'll render an up/down arrow if needed.
    const TrendIcon = trend === "up" ? (props: any) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg> :
        trend === "down" ? (props: any) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg> :
            trend === "neutral" ? (props: any) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><line x1="5" y1="12" x2="19" y2="12"></line></svg> : null;

    const trendColor = trend === "up" ? "#10b981" : trend === "down" ? "#f43f5e" : "#4b5563";

    return (
        <div
            className={`kpi-card ${className || ""}`}
            style={{
                animationDelay: `${index * 55}ms`,
                flex: expanded || children ? "1 1 100%" : "1 1 130px",
                minWidth: 120,
                background: isLight
                    ? (hovered || expanded
                        ? `radial-gradient(circle at top right, ${accent}12, transparent 44%), linear-gradient(135deg, #FFFFFF 0%, rgba(245,245,247,0.98) 100%)`
                        : "#FFFFFF")
                    : (hovered || expanded
                        ? `radial-gradient(circle at top right, ${accent}24, transparent 44%), radial-gradient(circle at bottom left, ${accent}10, transparent 50%), linear-gradient(135deg, var(--surface-2) 0%, ${accent}14 100%)`
                        : `radial-gradient(circle at top right, ${accent}16, transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 30%), var(--surface-1)`),
                backdropFilter: isLight ? "none" : "blur(26px)",
                border: isLight
                    ? (hovered || expanded ? `1px solid rgba(0,113,227,0.22)` : "1px solid rgba(0,0,0,0.08)")
                    : (hovered || expanded ? `1px solid ${accent}50` : "1px solid var(--surface-border-strong)"),
                borderRadius: "24px",
                display: "flex",
                flexDirection: "column",
                boxShadow: isLight
                    ? (hovered || expanded
                        ? `0 4px 12px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.09), 0 0 0 1px rgba(0,113,227,0.12), inset 0 1px 0 rgba(255,255,255,1.0)`
                        : `0 2px 8px rgba(0,0,0,0.05), 0 8px 24px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,1.0)`)
                    : (hovered || expanded
                        ? `0 0 32px ${accent}24, 0 28px 64px rgba(15, 23, 42, 0.18), 0 0 0 1px ${accent}12, var(--surface-shadow-strong)`
                        : "0 24px 56px rgba(15, 23, 42, 0.12), var(--surface-shadow)"),
                transition: "all 0.28s cubic-bezier(.22,.68,0,1.05)",
                cursor: onToggle ? "pointer" : "default",
                position: "relative",
                overflow: "hidden",
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Top shimmer line */}
            <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: "1px",
                background: isLight
                    ? `linear-gradient(90deg, transparent, rgba(255,255,255,1.0) 30%, rgba(255,255,255,0.80) 70%, transparent)`
                    : `linear-gradient(90deg, transparent, ${accent}70, ${accent}40, transparent)`,
                opacity: hovered || expanded ? 1 : 0.6,
                transition: "opacity 0.3s ease",
            }} />
            {/* Bottom edge accent */}
            <div style={{
                position: "absolute", bottom: 0, left: "20%", right: "20%", height: "1px",
                background: `linear-gradient(90deg, transparent, ${accent}20, transparent)`,
                opacity: hovered || expanded ? 0.8 : 0,
                transition: "opacity 0.3s ease",
            }} />

            <div
                onClick={onToggle}
                style={{ padding: "18px 20px", display: "flex", flexDirection: "column", flex: (expanded && children) ? "none" : 1 }}
            >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    {/* Icon badge */}
                    <div style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 36, height: 36, borderRadius: "10px",
                        background: `${accent}1A`, border: `1px solid ${accent}36`,
                        marginBottom: "12px", flexShrink: 0,
                        boxShadow: hovered ? `0 0 16px ${accent}20` : "none",
                        transition: "box-shadow 0.3s ease",
                    }}>
                        <Icon style={{ width: 16, height: 16, color: accent }} />
                    </div>
                    {onToggle && (
                        <div style={{ opacity: 0.5 }}>
                            {expanded ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>}
                        </div>
                    )}
                </div>

                <div style={{
                    fontSize: "11px", fontWeight: 700, letterSpacing: "0.10em",
                    color: "var(--surface-text-soft)", textTransform: "uppercase", marginBottom: "5px"
                }}>
                    {label}
                </div>
                {value !== undefined && value !== null && (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                        <span style={{
                            fontSize: "30px", fontWeight: "900", lineHeight: 1,
                            color: isLight ? "#1D1D1F" : color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.6px"
                        }}>
                            {value}
                        </span>
                        {TrendIcon && (
                            <TrendIcon style={{ color: trendColor, marginBottom: "3px" }} />
                        )}
                    </div>
                )}
                {sub && (
                    <div style={{ fontSize: "11px", color: "var(--surface-text-muted)", marginTop: "4px" }}>{sub}</div>
                )}
            </div>

            {expanded && children && (
                <div
                    {...contentProps}
                    style={{
                        borderTop: `1px solid ${accent}20`,
                        padding: "12px 18px",
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
    fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em",
    color: "var(--surface-text-soft)", textTransform: "uppercase", marginBottom: "14px"
};

