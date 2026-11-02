/* ================================================ */
/* SearchableSelect                                 */
/* A select with a search field: type to filter the */
/* list instead of scrolling through all employees. */
/* Used wherever an employee (or colleague) is      */
/* chosen from a list.                              */
/* ================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  /** Label of the "nothing selected" entry (value ""); omit to hide the entry. */
  emptyLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsLabel?: string;
  disabled?: boolean;
  className?: string;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("de");
}

/** Case- and accent-insensitive "contains" match over all words of the query. */
export function matchesSearch(label: string, query: string) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const target = normalize(label).replace(/,/g, " ");
  return words.every((word) => target.includes(word));
}

export function SearchableSelect({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder,
  searchPlaceholder = "Suchen…",
  noResultsLabel = "Keine Treffer",
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => options.filter((option) => matchesSearch(option.label, query)), [options, query]);
  const selected = options.find((option) => option.value === value);
  const buttonLabel = selected?.label || (value === "" ? (emptyLabel || placeholder || "") : (placeholder || value));

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-left text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>{buttonLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-xl border border-white/10 bg-slate-900 p-2 shadow-xl">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (filtered[0]) choose(filtered[0].value);
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full rounded-lg border border-white/10 bg-slate-950/80 py-1.5 pl-7 pr-2 text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <ul role="listbox" className="max-h-60 overflow-y-auto">
            {emptyLabel !== undefined && query.trim() === "" ? (
              <li>
                <button type="button" role="option" aria-selected={value === ""} onClick={() => choose("")} className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-400 hover:bg-white/10">
                  {emptyLabel}
                </button>
              </li>
            ) : null}
            {filtered.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => choose(option.value)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/10 ${option.value === value ? "bg-cyan-500/15 text-cyan-100" : "text-slate-100"}`}
                >
                  {option.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? <li className="px-2 py-2 text-sm text-slate-500">{noResultsLabel}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default SearchableSelect;
