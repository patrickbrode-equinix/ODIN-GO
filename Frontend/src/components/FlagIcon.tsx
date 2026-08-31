import type { LanguageCode } from "../context/LanguageContext";

const DE_FLAG = (
  <svg viewBox="0 0 640 480" preserveAspectRatio="none" className="h-4 w-6 rounded-[2px] bg-white shadow-sm ring-1 ring-slate-300/80">
    <rect width="640" height="160" y="0" fill="#000" />
    <rect width="640" height="160" y="160" fill="#D00" />
    <rect width="640" height="160" y="320" fill="#FFCE00" />
  </svg>
);

const US_FLAG = (
  <svg viewBox="0 0 640 480" preserveAspectRatio="none" className="h-4 w-6 rounded-[2px] bg-white shadow-sm ring-1 ring-slate-300/80">
    {/* Stripes */}
    <rect width="640" height="480" fill="#fff" />
    {[0, 2, 4, 6, 8, 10, 12].map((i) => (
      <rect key={i} width="640" height={Math.round(480 / 13)} y={Math.round(i * 480 / 13)} fill="#B22234" />
    ))}
    {/* Canton */}
    <rect width="256" height={Math.round(480 * 7 / 13)} fill="#3C3B6E" />
    {/* Simplified stars pattern – 5 rows */}
    {[
      [20, 18], [60, 18], [100, 18], [140, 18], [180, 18], [220, 18],
      [40, 50], [80, 50], [120, 50], [160, 50], [200, 50],
      [20, 82], [60, 82], [100, 82], [140, 82], [180, 82], [220, 82],
      [40, 114], [80, 114], [120, 114], [160, 114], [200, 114],
      [20, 146], [60, 146], [100, 146], [140, 146], [180, 146], [220, 146],
      [40, 178], [80, 178], [120, 178], [160, 178], [200, 178],
      [20, 210], [60, 210], [100, 210], [140, 210], [180, 210], [220, 210],
      [40, 242], [80, 242], [120, 242], [160, 242], [200, 242],
      [20, 274], [60, 274], [100, 274], [140, 274], [180, 274], [220, 274],
    ].map(([cx, cy], i) => (
      <circle key={i} cx={cx} cy={cy} r={7} fill="#fff" />
    ))}
  </svg>
);

const FLAGS: Record<LanguageCode, JSX.Element> = {
  de: DE_FLAG,
  en: US_FLAG,
};

export function FlagIcon({ code }: { code: LanguageCode }) {
  return FLAGS[code] ?? null;
}
