import type { Configuration } from "./env";

type AccountAccess = Pick<Configuration, "ADMIN_EMAIL" | "ALLOWED_EMAILS">;
const normalize = (email: string) => email.trim().toLowerCase();

export function isAdministrator(env: AccountAccess, email: string) {
  return normalize(email) === normalize(env.ADMIN_EMAIL);
}

/** Removing an address disables its existing sessions and agents on their next request. */
export function isAccountAllowed(env: AccountAccess, email: string) {
  return (
    isAdministrator(env, email) ||
    (env.ALLOWED_EMAILS ?? "").split(",").some((allowed) => normalize(allowed) === normalize(email))
  );
}
