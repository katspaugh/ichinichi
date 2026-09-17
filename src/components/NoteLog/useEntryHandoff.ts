import { useCallback, useEffect, useReducer } from "react";

/** How long the finalized entry keeps the composer's place before the editor returns. */
const HOLD_MS = 900;
/** How long the released entry keeps its arrival highlight. */
const REVEAL_MS = 700;

export interface CommittedEntry {
  /** Timestamp of the entry, matching the parsed segment's `id`. */
  id: string;
  /** Day the entry was written on, so a day switch drops it. */
  date: string;
  label: string | null;
  html: string;
}

export type EntryHandoffState =
  | { phase: "idle"; entry: null; releasedId: null }
  | { phase: "holding"; entry: CommittedEntry; releasedId: null }
  | { phase: "revealing"; entry: null; releasedId: string };

export type EntryHandoffAction =
  | { type: "commit"; entry: CommittedEntry }
  | { type: "reveal" }
  | { type: "settle" };

const IDLE: EntryHandoffState = {
  phase: "idle",
  entry: null,
  releasedId: null,
};

/**
 * Submitting an entry used to swap the composer back to an empty editor in the
 * same frame, so the moment the user had just written vanished mid-keystroke.
 * Instead the entry is held, finalized, where it was typed; only after the hold
 * does it join the timeline and a fresh editor fade back in.
 */
export function entryHandoffReducer(
  state: EntryHandoffState,
  action: EntryHandoffAction,
): EntryHandoffState {
  switch (action.type) {
    case "commit":
      return { phase: "holding", entry: action.entry, releasedId: null };
    case "reveal":
      if (state.phase !== "holding") return state;
      return { phase: "revealing", entry: null, releasedId: state.entry.id };
    case "settle":
      if (state.phase !== "revealing") return state;
      return IDLE;
  }
}

export function useEntryHandoff(date: string) {
  const [state, dispatch] = useReducer(entryHandoffReducer, IDLE);

  useEffect(() => {
    if (state.phase !== "holding") return;
    const timer = setTimeout(() => dispatch({ type: "reveal" }), HOLD_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.entry]);

  useEffect(() => {
    if (state.phase !== "revealing") return;
    const timer = setTimeout(() => dispatch({ type: "settle" }), REVEAL_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.releasedId]);

  const commit = useCallback((entry: CommittedEntry) => {
    dispatch({ type: "commit", entry });
  }, []);

  // Typing again cuts the hold short: the caret must never sit in an editor
  // that is still hidden behind the entry it just produced.
  const reveal = useCallback(() => {
    dispatch({ type: "reveal" });
  }, []);

  return {
    /** The finalized entry standing in for the composer, if any. */
    held: state.entry?.date === date ? state.entry : null,
    /** The entry that just joined the timeline, highlighted as it lands. */
    releasedId: state.releasedId,
    /** True while the editor is fading back in over the released entry. */
    isRevealing: state.phase === "revealing",
    commit,
    reveal,
  };
}
