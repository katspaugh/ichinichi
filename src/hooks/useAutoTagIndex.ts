import { useEffect, useMemo, useReducer } from "react";
import type { AppDatabase } from "../storage/rxdb/database";
import type { AutoTagEntry, AutoTagStatus } from "../types/autoTags";
import type { NoteSections } from "../utils/habits";
import { activityCandidates } from "../utils/autoTags";
import { extractSectionTypes } from "../utils/sectionTypes";
import { AutoTagClassifier } from "../services/autoTagClassifier";
import { reportError } from "../utils/errorReporter";
import { useAutoTagsEnabled } from "./useAutoTagsEnabled";

export interface AutoTagState extends AutoTagStatus {
  scope: object | null;
  year: number;
  entries: AutoTagEntry[];
  tags: NoteSections;
  revision: number;
}
export const initialAutoTagState: AutoTagState = {
  phase: "disabled",
  message: "",
  scope: null,
  year: 0,
  entries: [],
  tags: new Map(),
  revision: 0,
};
type Action =
  | { type: "INPUTS"; scope: object; year: number; entries: AutoTagEntry[] }
  | { type: "DISABLE" }
  | { type: "PROGRESS"; revision: number; message: string }
  | { type: "DONE"; revision: number; tags: NoteSections }
  | { type: "FAILED"; revision: number; message: string }
  | { type: "RETRY" };

export function autoTagReducer(
  state: AutoTagState,
  action: Action,
): AutoTagState {
  switch (action.type) {
    case "INPUTS":
      return {
        ...state,
        scope: action.scope,
        year: action.year,
        entries: action.entries,
        phase: "classifying",
        message: "Preparing on-device model…",
        tags: new Map(),
        revision: state.revision + 1,
      };
    case "DISABLE":
      return { ...initialAutoTagState, revision: state.revision + 1 };
    case "RETRY":
      return state.phase === "error"
        ? {
            ...state,
            phase: "classifying",
            message: "Retrying…",
            revision: state.revision + 1,
          }
        : state;
    case "PROGRESS":
      return state.phase === "classifying" && action.revision === state.revision
        ? { ...state, message: action.message }
        : state;
    case "DONE":
      return state.phase === "classifying" && action.revision === state.revision
        ? {
            ...state,
            phase: "ready",
            message: "Up to date · estimated activity days",
            tags: action.tags,
          }
        : state;
    case "FAILED":
      return state.phase === "classifying" && action.revision === state.revision
        ? { ...state, phase: "error", message: action.message }
        : state;
  }
}

export function useAutoTagIndex(
  db: AppDatabase | null,
  year: number,
  explicit: NoteSections,
) {
  const { enabled } = useAutoTagsEnabled();
  const [state, dispatch] = useReducer(autoTagReducer, initialAutoTagState);
  const classifier = useMemo(() => new AutoTagClassifier(), []);

  useEffect(() => {
    if (!enabled || !db) {
      dispatch({ type: "DISABLE" });
      return;
    }
    const subscription = db.notes
      .find({ selector: { isDeleted: { $eq: false } } })
      .$.subscribe((docs) => {
        dispatch({
          type: "INPUTS",
          scope: db,
          year,
          entries: docs
            .filter((doc) => doc.date.endsWith(`-${year}`))
            .map((doc) => ({ date: doc.date, content: doc.content })),
        });
      });
    return () => subscription.unsubscribe();
  }, [enabled, db, year]);

  useEffect(() => {
    if (state.phase !== "classifying") return;
    const controller = new AbortController();
    const revision = state.revision;
    const custom = state.entries.flatMap(({ content }) =>
      extractSectionTypes(content),
    );
    const run = async () => {
      try {
        const tags = await classifier.classify(
          state.entries,
          activityCandidates(custom),
          controller.signal,
          (message) => dispatch({ type: "PROGRESS", revision, message }),
        );
        if (!controller.signal.aborted)
          dispatch({ type: "DONE", revision, tags });
      } catch (error) {
        if (controller.signal.aborted) return;
        reportError("autoTags.classify", error);
        dispatch({
          type: "FAILED",
          revision,
          message:
            "Unable to analyze entries. Check your connection and retry.",
        });
      }
    };
    void run();
    return () => controller.abort();
  }, [state.phase, state.revision, state.entries, classifier]);

  useEffect(() => {
    if (!enabled) classifier.dispose();
    return () => classifier.dispose();
  }, [classifier, enabled, db]);

  // Mask old scope/results immediately, even before the subscription effect runs.
  const active =
    enabled && db !== null && state.scope === db && state.year === year;
  const sections = useMemo(() => {
    if (!active || state.tags.size === 0) return explicit;
    const merged = new Map(explicit);
    for (const [date, tags] of state.tags)
      merged.set(date, [...new Set([...(explicit.get(date) ?? []), ...tags])]);
    return merged;
  }, [active, state.tags, explicit]);
  return {
    sections,
    status: {
      phase: active ? state.phase : "disabled",
      message: active ? state.message : "",
    } satisfies AutoTagStatus,
    retry: () => dispatch({ type: "RETRY" }),
  };
}
