/* ------------------------------------------------ */
/* USER DISPLAY HELPERS                             */
/* Single source of truth for display names         */
/* ------------------------------------------------ */

type DisplayUser = {
  firstName?: string | null;
  lastName?: string | null;
  loginName?: string | null;
  email?: string | null;
};

export function getUserDisplayName(user?: DisplayUser | null): string {
  if (!user) return "Unbekannt";

  const first = user.firstName?.trim();
  const last  = user.lastName?.trim();

  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;

  return user.loginName ?? user.email ?? "Unbekannt";
}
