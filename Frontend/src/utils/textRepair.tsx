import React from "react";

const REPAIRS: Array<[string, string]> = [
  ["Ãƒâ€ž", "Ä"],
  ["Ãƒâ€“", "Ö"],
  ["ÃƒÅ“", "Ü"],
  ["ÃƒÂ¤", "ä"],
  ["ÃƒÂ¶", "ö"],
  ["ÃƒÂ¼", "ü"],
  ["ÃƒÅ¸", "ß"],
  ["Ã„", "Ä"],
  ["Ã–", "Ö"],
  ["Ãœ", "Ü"],
  ["Ã¤", "ä"],
  ["Ã¶", "ö"],
  ["Ã¼", "ü"],
  ["ÃŸ", "ß"],
  ["Ã©", "é"],
  ["Ã¨", "è"],
  ["Ã¡", "á"],
  ["Ã³", "ó"],
  ["Ã±", "ñ"],
  ["â€“", "–"],
  ["Ã¢â‚¬â€œ", "–"],
  ["Ã¢â‚¬â€", "—"],
  ["â€”", "—"],
  ["â€ž", "„"],
  ["â€", "„"],
  ["â€œ", "“"],
  ["Ã¢â‚¬Å“", "“"],
  ["â€\u009d", "”"],
  ["Ã¢â‚¬Â", "”"],
  ["â€˜", "‘"],
  ["â€™", "’"],
  ["â€¦", "…"],
  ["â€¢", "•"],
  ["âœ“", "✓"],
  ["âœ—", "✗"],
  ["âš ", "⚠"],
  ["Â·", "·"],
  ["Â", ""],
  ["Persoenliche", "Persönliche"],
  ["Pruef", "Prüf"],
  ["pruef", "prüf"],
  ["pruft", "prüft"],
  ["ueber", "über"],
  ["Ueber", "Über"],
  ["zurueck", "zurück"],
  ["Schliessen", "Schließen"],
  ["moeglicherweise", "möglicherweise"],
  ["zunaechst", "zunächst"],
  ["naechste", "nächste"],
  ["Loesung", "Lösung"],
  ["loesen", "lösen"],
  ["waehlen", "wählen"],
  ["Waehlen", "Wählen"],
  ["fuer", "für"],
  ["Fuer", "Für"],
];

const SAFE_TEXT_PROPS = new Set(["children", "title", "placeholder", "aria-label", "alt"]);

export function repairText(value: string): string {
  let next = value;
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const [bad, good] of REPAIRS) {
      if (next.includes(bad)) {
        next = next.split(bad).join(good);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }
  return next;
}

export function repairTextDeep<T>(value: T): T {
  if (typeof value === "string") {
    return repairText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => repairTextDeep(entry)) as T;
  }
  if (React.isValidElement(value)) {
    return repairReactNode(value) as T;
  }
  if (value && typeof value === "object") {
    const plainObject = value as Record<string, unknown>;
    const repairedEntries = Object.entries(plainObject).map(([key, entry]) => [key, repairTextDeep(entry)]);
    return Object.fromEntries(repairedEntries) as T;
  }
  return value;
}

export function repairReactNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string") {
    return repairText(node);
  }
  if (Array.isArray(node)) {
    return node.map((entry, index) => <React.Fragment key={index}>{repairReactNode(entry)}</React.Fragment>);
  }
  if (!React.isValidElement(node)) {
    return node;
  }

  const currentProps = (node.props ?? {}) as Record<string, unknown>;
  let changed = false;
  const nextProps: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(currentProps)) {
    if (key === "children") {
      const repairedChildren = repairReactNode(entry as React.ReactNode);
      nextProps.children = repairedChildren;
      changed = changed || repairedChildren !== entry;
      continue;
    }

    if (typeof entry === "string" && SAFE_TEXT_PROPS.has(key)) {
      const repairedValue = repairText(entry);
      nextProps[key] = repairedValue;
      changed = changed || repairedValue !== entry;
      continue;
    }

    nextProps[key] = entry;
  }

  return changed ? React.cloneElement(node, nextProps) : node;
}

export function TextRepairBoundary({ children }: { children: React.ReactNode }) {
  return <>{repairReactNode(children)}</>;
}