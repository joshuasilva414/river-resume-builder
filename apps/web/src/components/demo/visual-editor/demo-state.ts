/** DEMO ONLY: isolated localStorage and session history; never use this as River's production save path. */
import { useCallback, useEffect, useReducer, useState } from "react";
import { demoInitialState } from "./demo-fixtures";
import type { DemoState } from "./demo-model";
import {
  type DemoStorageStatus,
  demoLoadStorage,
  demoResetStorage,
  demoSaveStorage,
  demoStorageKey,
} from "./demo-storage";

type DemoHistory = {
  present: DemoState;
  past: DemoState[];
  future: DemoState[];
  group: string | null;
  time: number;
};
type DemoAction =
  | { type: "commit"; update: (state: DemoState) => DemoState; group?: string; time: number }
  | { type: "load"; state: DemoState }
  | { type: "undo" }
  | { type: "redo" };
export function demoHistory(state: DemoState): DemoHistory {
  return { present: state, past: [], future: [], group: null, time: 0 };
}
export function demoHistoryReducer(history: DemoHistory, action: DemoAction): DemoHistory {
  if (action.type === "load") return demoHistory(action.state);
  if (action.type === "undo") {
    const prior = history.past.at(-1);
    return prior
      ? {
          present: prior,
          past: history.past.slice(0, -1),
          future: [history.present, ...history.future],
          group: null,
          time: 0,
        }
      : history;
  }
  if (action.type === "redo") {
    const next = history.future[0];
    return next
      ? {
          present: next,
          past: [...history.past, history.present],
          future: history.future.slice(1),
          group: null,
          time: 0,
        }
      : history;
  }
  const present = action.update(history.present);
  if (JSON.stringify(present) === JSON.stringify(history.present)) return history;
  const coalesce =
    action.group && action.group === history.group && action.time - history.time < 800;
  return {
    present,
    past: coalesce ? history.past : [...history.past.slice(-99), history.present],
    future: [],
    group: action.group ?? null,
    time: action.time,
  };
}
export function useDemoState(userId: string) {
  const key = demoStorageKey(userId);
  const [history, dispatch] = useReducer(demoHistoryReducer, undefined, () =>
    demoHistory(demoInitialState()),
  );
  const [storage, setStorage] = useState<"loading" | DemoStorageStatus>("loading");
  useEffect(() => {
    try {
      const result = demoLoadStorage(localStorage, key);
      if (result.status === "saved" && result.state)
        dispatch({ type: "load", state: result.state });
      setStorage(result.status);
    } catch {
      setStorage("unavailable");
    }
  }, [key]);
  useEffect(() => {
    if (storage === "loading" || storage === "invalid") return;
    try {
      setStorage(demoSaveStorage(localStorage, key, history.present));
    } catch {
      setStorage("unavailable");
    }
  }, [history.present, key, storage]);
  const commit = useCallback(
    (update: (state: DemoState) => DemoState, group?: string) =>
      dispatch({ type: "commit", update, group, time: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = () => {
    try {
      setStorage(demoResetStorage(localStorage, key));
    } catch {
      setStorage("unavailable");
    }
    dispatch({ type: "load", state: demoInitialState() });
  };
  return {
    state: history.present,
    commit,
    undo,
    redo,
    reset,
    storage,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
