import { Data, Schema } from "effect";

export const OperationId = Schema.String.pipe(Schema.brand("OperationId"));
export type OperationId = typeof OperationId.Type;
export const Revision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
export const OperationState = Schema.Literals([
  "Pending",
  "Running",
  "Succeeded",
  "Failed",
  "Cancelled",
]);
export type OperationState = typeof OperationState.Type;

export const agentScopes = [
  "facts:read",
  "facts:write",
  "content:read",
  "content:write",
  "templates:read",
  "templates:write",
  "resumes:read",
  "resumes:write",
  "source:read",
  "source:write",
  "jobs:read",
  "jobs:write",
] as const;
export const AgentScope = Schema.Literals(agentScopes);
export type AgentScope = typeof AgentScope.Type;
// Decode retained credentials without advertising retired permissions for new credentials.
export const legacyAgentScopes = [
  ...agentScopes,
  "evidence:read",
  "evidence:write",
  "evidence:merge",
  "evidence:archive",
  "evidence:verify",
] as const;
export const LegacyAgentScope = Schema.Literals(legacyAgentScopes);
export type LegacyAgentScope = typeof LegacyAgentScope.Type;
export type Principal =
  | {
      readonly kind: "owner";
      readonly id: string;
      readonly ownerId: string;
      readonly isAdmin?: boolean;
    }
  | {
      readonly kind: "agent";
      readonly id: string;
      readonly ownerId: string;
      readonly scopes: readonly LegacyAgentScope[];
    };

export class ApplicationError extends Data.TaggedError("ApplicationError")<{
  readonly code:
    | "Unauthorized"
    | "Forbidden"
    | "InvalidInput"
    | "Conflict"
    | "NotFound"
    | "RateLimited"
    | "Unavailable"
    | "Internal";
  readonly message: string;
  readonly expectedRevision?: number;
  readonly observedRevision?: number;
}> {}

/** Administration covers service maintenance and submitted feedback, never other workspaces. */
export function requireAdministrator(actor: Principal) {
  if (actor.kind !== "owner" || !actor.isAdmin)
    throw new ApplicationError({ code: "Forbidden", message: "Administrator access is required." });
}

/** Generate sortable UUIDv7 identities using a millisecond timestamp and secure randomness. */
export function newId(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = BigInt(now);
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(timestamp & 255n);
    timestamp >>= 8n;
  }
  bytes[6] = ((bytes[6] ?? 0) & 15) | 112;
  bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable serialization keeps retries and render fingerprints independent of object key order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("Value is not JSON serializable");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

export async function fingerprint(value: string | Uint8Array): Promise<string> {
  const input =
    typeof value === "string" ? new TextEncoder().encode(value) : Uint8Array.from(value);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const RecordId = Schema.String.check(Schema.isUUID(7));
export type CommandOutcome = {
  readonly id: string;
  readonly revision: number;
  readonly revisionId: string | null;
};
