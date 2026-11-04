/* ================================================ */
/* Payroll profile encryption (browser only)        */
/* The profile is encrypted with a key derived from */
/* the employee's own payroll password (PBKDF2 +    */
/* AES-256-GCM). The server and the database only   */
/* ever see the ciphertext: admins and database     */
/* operators cannot read the data. A forgotten      */
/* password cannot be recovered (start again).      */
/* ================================================ */

import type { PayrollProfile } from "./payrollEngine";

export interface EncryptedProfile {
  salt: string;
  iv: string;
  ciphertext: string;
  kdf: "PBKDF2-SHA256";
  kdfIterations: number;
  version: 1;
}

export const KDF_ITERATIONS = 600_000;
const SESSION_KEY = "odinPayrollKey";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const value of array) binary += String.fromCharCode(value);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function deriveKey(password: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptProfile(profile: PayrollProfile, key: CryptoKey, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<EncryptedProfile> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, encoder.encode(JSON.stringify(profile)));
  return { salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(data), kdf: "PBKDF2-SHA256", kdfIterations: iterations, version: 1 };
}

/** Throws when the password (key) is wrong or the data was changed. */
export async function decryptProfile(payload: EncryptedProfile, key: CryptoKey): Promise<PayrollProfile> {
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(payload.iv) as BufferSource }, key, fromBase64(payload.ciphertext) as BufferSource);
  return JSON.parse(decoder.decode(data)) as PayrollProfile;
}

/** Remember the key for this browser tab only (cleared when the tab closes or the user locks). */
export async function rememberKeyForTab(key: CryptoKey): Promise<void> {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(await crypto.subtle.exportKey("jwk", key)));
  } catch { /* storage blocked: the password is asked again after a reload */ }
}

export async function restoreKeyForTab(): Promise<CryptoKey | null> {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return null;
    return await crypto.subtle.importKey("jwk", JSON.parse(stored), { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

export function forgetKeyForTab(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
