const FORBIDDEN_DOMAIN_SUFFIXES = ["de", "com", "net", "org", "io"];

function transliterateGerman(value: string) {
  return String(value || "")
    .trim()
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toLoginSegment(value: string) {
  const tokens = transliterateGerman(value)
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join("");
}

export function buildLoginNameSuggestion(firstName: string, lastName: string) {
  const firstSegment = toLoginSegment(firstName);
  const lastSegment = toLoginSegment(lastName);
  if (!firstSegment || !lastSegment) return "";
  return `${firstSegment}@${lastSegment}`;
}

export function validateLoginName(value: string) {
  const loginName = String(value || "").trim();
  if (!loginName) return { ok: false, code: "LOGIN_NAME_REQUIRED" as const };
  if (/\s/.test(loginName)) return { ok: false, code: "LOGIN_NAME_FORMAT" as const };

  const parts = loginName.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, code: "LOGIN_NAME_FORMAT" as const };
  }

  if (!/^[A-Za-z0-9]+@[A-Za-z0-9]+$/.test(loginName)) {
    return { ok: false, code: "LOGIN_NAME_FORMAT" as const };
  }

  const rightSide = parts[1];
  if (FORBIDDEN_DOMAIN_SUFFIXES.some((suffix) => rightSide.toLowerCase().endsWith(`.${suffix}`))) {
    return { ok: false, code: "LOGIN_NAME_FORMAT" as const };
  }

  return { ok: true, value: loginName } as const;
}