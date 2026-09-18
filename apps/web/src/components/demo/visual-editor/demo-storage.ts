/** DEMO ONLY: versioned, per-user browser storage. Replace with an authorized persistence boundary for production. */
import { type DemoState, demoParseState } from "./demo-model";

export type DemoBrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type DemoStorageStatus = "saved" | "unavailable" | "invalid";
export const demoStorageKey = (userId: string) => `river:demo:visual-editor:v1:${userId}`;

export function demoLoadStorage(
  storage: DemoBrowserStorage,
  key: string,
): { status: "saved"; state: DemoState | null } | { status: "unavailable" | "invalid" } {
  let stored: string | null;
  try {
    stored = storage.getItem(key);
  } catch {
    return { status: "unavailable" };
  }
  if (!stored) return { status: "saved", state: null };
  try {
    return { status: "saved", state: demoParseState(JSON.parse(stored)) };
  } catch {
    return { status: "invalid" };
  }
}
export function demoSaveStorage(
  storage: DemoBrowserStorage,
  key: string,
  state: DemoState,
): DemoStorageStatus {
  try {
    storage.setItem(key, JSON.stringify(state));
    return "saved";
  } catch {
    return "unavailable";
  }
}
export function demoResetStorage(storage: DemoBrowserStorage, key: string): DemoStorageStatus {
  try {
    storage.removeItem(key);
    return "saved";
  } catch {
    return "unavailable";
  }
}
