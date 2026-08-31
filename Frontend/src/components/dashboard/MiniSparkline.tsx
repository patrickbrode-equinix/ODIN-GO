/**
 * MiniSparkline – Tiny animated line chart using Recharts.
 * Shows last 7 faux data points for visual trend indication.
 */
import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface MiniSparklineProps {
  value: number;
  color?: string;
  className?: string;
}

export function MiniSparkline({
  value,
  color = "#60a5fa",
  className,
}: MiniSparklineProps) {
  const data = useMemo(() => {
    // Generate 7 plausible data points around the current value
    const base = Math.max(0, value - 4);
    return Array.from({ length: 7 }, (_, i) => ({
      v: Math.max(0, base + Math.round((Math.random() - 0.3) * (value * 0.3 + 2)) + (i * 0.8)),
    }));
  }, [value]);

  return (
    <div className={`h-8 w-20 ${className || ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace("#", "")})`}
            dot={false}
            isAnimationActive
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
