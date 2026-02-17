import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { NoteRepository } from "../storage/noteRepository";
import type { HabitValues } from "../types";
import { findLatestHabitDefinitions } from "../features/habits/findLatestHabitDefinitions";
import { isNoteEmpty } from "../utils/sanitize";
import { isContentEmpty } from "../utils/sanitize";

interface SaveSnapshot {
  date: string;
  content: string;
  isEmpty: boolean;
}

const SAVE_IDLE_DELAY_MS = 2000;

export interface UseLocalNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  habits: HabitValues | undefined;
  setHabits: (habits: HabitValues) => void;
  isLoading: boolean;
  hasEdits: boolean;
  /** True when the note is being saved (dirty or saving state) */
  isSaving: boolean;
  isReady: boolean;
  error: Error | null;
  /** Allows external code to update content (e.g., from remote sync) */
  applyRemoteUpdate: (content: string, habits?: HabitValues) => void;
}

export type LocalNoteEvent =
  | {
      type: "INPUTS_CHANGED";
      date: string | null;
      repository: NoteRepository | null;
    }
  | { type: "LOAD_SUCCESS"; date: string; content: string; habits?: HabitValues }
  | { type: "LOAD_ERROR"; date: string; error: Error }
  | { type: "EDIT"; content: string }
  | { type: "EDIT_HABITS"; habits: HabitValues }
  | { type: "REMOTE_UPDATE"; content: string; habits?: HabitValues }
  | { type: "SAVE_SUCCESS"; snapshot: SaveSnapshot }
  | { type: "SAVE_FAILED" }
  | { type: "FLUSH" }
  | { type: "UPDATE_AFTER_SAVE"; callback?: (snapshot: SaveSnapshot) => void };

interface LocalNoteContext {
  date: string | null;
  repository: NoteRepository | null;
  content: string;
  habits: HabitValues | undefined;
  hasEdits: boolean;
  error: Error | null;
  afterSave?: (snapshot: SaveSnapshot) => void;
  /** True when the note was loaded from storage with non-empty content.
   *  Used to prevent accidental deletion if content becomes empty due to a bug. */
  loadedWithContent: boolean;
}

const loadNoteActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: LocalNoteEvent) => void;
    input: { date: string; repository: NoteRepository };
  }) => {
    let cancelled = false;

    const load = async () => {
      const result = await input.repository.get(input.date);
      if (cancelled) return;

      if (result.ok) {
        let habits = result.value?.habits;

        // Inherit habit definitions from most recent previous note
        // when the loaded note has no habits of its own
        if (!habits || Object.keys(habits).length === 0) {
          const inherited = await findLatestHabitDefinitions(
            input.repository,
            input.date,
          );
          if (cancelled) return;
          habits = inherited;
        }

        sendBack({
          type: "LOAD_SUCCESS",
          date: input.date,
          content: result.value?.content ?? "",
          habits,
        });
      } else {
        sendBack({
          type: "LOAD_ERROR",
          date: input.date,
          error: new Error(result.error.message),
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  },
);

const saveNoteActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: LocalNoteEvent) => void;
    input: {
      date: string;
      content: string;
      habits: HabitValues | undefined;
      repository: NoteRepository;
      loadedWithContent: boolean;
    };
  }) => {
    let cancelled = false;

    const save = async () => {
      const isEmpty = isNoteEmpty(input.content, input.habits);

      // Guard: never delete a note that was loaded with content.
      // If content is unexpectedly empty (DOM reset, race condition), skipping
      // the operation preserves the original note in storage.
      if (isEmpty && input.loadedWithContent) {
        if (!cancelled) {
          sendBack({ type: "SAVE_FAILED" });
        }
        return;
      }

      const result = isEmpty
        ? await input.repository.delete(input.date)
        : await input.repository.save(input.date, input.content, input.habits);

      if (!cancelled) {
        if (result.ok) {
          sendBack({
            type: "SAVE_SUCCESS",
            snapshot: {
              date: input.date,
              content: input.content,
              isEmpty,
            },
          });
        } else {
          console.error("Failed to save note:", result.error);
          sendBack({ type: "SAVE_FAILED" });
        }
      }
    };

    void save();

    return () => {
      cancelled = true;
    };
  },
);

export const localNoteMachine = setup({
  types: {
    context: {} as LocalNoteContext,
    events: {} as LocalNoteEvent,
  },
  actors: {
    loadNote: loadNoteActor,
    saveNote: saveNoteActor,
  },
  actions: {
    applyInputs: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return {};
      }
      return {
        date: event.date,
        repository: event.repository,
      };
    }),
    resetState: assign({
      date: null,
      repository: null,
      content: "",
      habits: undefined as HabitValues | undefined,
      hasEdits: false,
      error: null,
      loadedWithContent: false,
    }),
    clearError: assign({ error: null }),
    resetEdits: assign({ hasEdits: false }),
    clearContent: assign({ content: "", habits: undefined as HabitValues | undefined }),
    applyLoadedContent: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "LOAD_SUCCESS") {
        return {};
      }
      return {
        content: event.content,
        habits: event.habits,
        hasEdits: false,
        error: null,
        loadedWithContent: !isContentEmpty(event.content),
      };
    }),
    applyLoadError: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "LOAD_ERROR") {
        return {};
      }
      return {
        content: "",
        habits: undefined as HabitValues | undefined,
        hasEdits: false,
        error: event.error,
      };
    }),
    applyEdit: assign(
      (args: { event: LocalNoteEvent; context: LocalNoteContext }) => {
        const { event, context } = args;
        if (event.type !== "EDIT") {
          return {};
        }
        if (event.content === context.content) {
          return {};
        }
        return {
          content: event.content,
          hasEdits: true,
          error: null,
        };
      },
    ),
    applyHabitEdit: assign(
      (args: { event: LocalNoteEvent }) => {
        const { event } = args;
        if (event.type !== "EDIT_HABITS") {
          return {};
        }
        return {
          habits: event.habits,
          hasEdits: true,
          error: null,
        };
      },
    ),
    applyRemoteUpdate: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "REMOTE_UPDATE") {
        return {};
      }
      return {
        content: event.content,
        habits: event.habits,
        hasEdits: false,
        error: null,
      };
    }),
    applySaveSuccess: assign(
      (args: { event: LocalNoteEvent; context: LocalNoteContext }) => {
        const { event, context } = args;
        if (event.type !== "SAVE_SUCCESS") {
          return {};
        }
        if (context.date !== event.snapshot.date) {
          return {};
        }
        if (context.content !== event.snapshot.content) {
          return { hasEdits: true };
        }
        return { hasEdits: false };
      },
    ),
    notifyAfterSave: (args: {
      event: LocalNoteEvent;
      context: LocalNoteContext;
    }) => {
      const { event, context } = args;
      if (event.type !== "SAVE_SUCCESS") {
        return;
      }
      context.afterSave?.(event.snapshot);
    },
    flushPendingSave: (args: { context: LocalNoteContext }) => {
      const { context } = args;
      if (!context.date || !context.repository || !context.hasEdits) {
        return;
      }
      const snapshot: SaveSnapshot = {
        date: context.date,
        content: context.content,
        isEmpty: isNoteEmpty(context.content, context.habits),
      };

      // Guard: never delete a note that was loaded with content.
      // If content is unexpectedly empty, skip the operation to preserve
      // the original note in storage.
      if (snapshot.isEmpty && context.loadedWithContent) {
        return;
      }

      const afterSave = context.afterSave;
      const operation = snapshot.isEmpty
        ? context.repository.delete(snapshot.date)
        : context.repository.save(snapshot.date, snapshot.content, context.habits);

      void operation.then((result) => {
        if (result.ok) {
          afterSave?.(snapshot);
        } else {
          console.error("Failed to save note:", result.error);
        }
      });
    },
    updateAfterSave: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "UPDATE_AFTER_SAVE") {
        return {};
      }
      return { afterSave: event.callback };
    }),
  },
  guards: {
    hasInputs: ({ event }: { event: LocalNoteEvent }) =>
      event.type === "INPUTS_CHANGED" && !!event.date && !!event.repository,
    canApplyRemote: ({ context }: { context: LocalNoteContext }) =>
      !context.hasEdits,
  },
}).createMachine({
  id: "localNote",
  initial: "idle",
  context: {
    date: null,
    repository: null,
    content: "",
    habits: undefined,
    hasEdits: false,
    error: null,
    afterSave: undefined,
    loadedWithContent: false,
  },
  on: {
    UPDATE_AFTER_SAVE: {
      actions: "updateAfterSave",
    },
  },
  states: {
    idle: {
      on: {
        INPUTS_CHANGED: [
          {
            guard: "hasInputs",
            target: "loading",
            actions: "applyInputs",
          },
          {
            actions: "resetState",
          },
        ],
      },
    },
    loading: {
      entry: ["clearError", "resetEdits", "clearContent"],
      invoke: {
        id: "loadNote",
        src: "loadNote",
        input: ({ context }: { context: LocalNoteContext }) => ({
          date: context.date as string,
          repository: context.repository as NoteRepository,
        }),
      },
      on: {
        LOAD_SUCCESS: {
          target: "ready",
          actions: "applyLoadedContent",
        },
        LOAD_ERROR: {
          target: "error",
          actions: "applyLoadError",
        },
        INPUTS_CHANGED: [
          {
            guard: "hasInputs",
            target: "loading",
            reenter: true,
            actions: "applyInputs",
          },
          {
            target: "idle",
            actions: "resetState",
          },
        ],
      },
    },
    ready: {
      on: {
        EDIT: {
          target: "dirty",
          actions: "applyEdit",
        },
        EDIT_HABITS: {
          target: "dirty",
          actions: "applyHabitEdit",
        },
        REMOTE_UPDATE: {
          guard: "canApplyRemote",
          actions: "applyRemoteUpdate",
        },
        INPUTS_CHANGED: [
          {
            guard: "hasInputs",
            target: "loading",
            actions: ["flushPendingSave", "applyInputs"],
          },
          {
            target: "idle",
            actions: ["flushPendingSave", "resetState"],
          },
        ],
      },
    },
    dirty: {
      after: {
        [SAVE_IDLE_DELAY_MS]: { target: "saving" },
      },
      on: {
        EDIT: {
          target: "dirty",
          reenter: true,
          actions: "applyEdit",
        },
        EDIT_HABITS: {
          target: "dirty",
          reenter: true,
          actions: "applyHabitEdit",
        },
        INPUTS_CHANGED: [
          {
            guard: "hasInputs",
            target: "loading",
            actions: ["flushPendingSave", "applyInputs"],
          },
          {
            target: "idle",
            actions: ["flushPendingSave", "resetState"],
          },
        ],
        FLUSH: {
          target: "saving",
        },
      },
    },
    saving: {
      invoke: {
        id: "saveNote",
        src: "saveNote",
        input: ({ context }: { context: LocalNoteContext }) => ({
          date: context.date as string,
          content: context.content,
          habits: context.habits,
          repository: context.repository as NoteRepository,
          loadedWithContent: context.loadedWithContent,
        }),
      },
      on: {
        SAVE_SUCCESS: {
          target: "ready",
          actions: ["applySaveSuccess", "notifyAfterSave"],
        },
        SAVE_FAILED: {
          target: "ready",
        },
        EDIT: {
          target: "dirty",
          actions: "applyEdit",
        },
        EDIT_HABITS: {
          target: "dirty",
          actions: "applyHabitEdit",
        },
        INPUTS_CHANGED: [
          {
            guard: "hasInputs",
            target: "loading",
            actions: ["flushPendingSave", "applyInputs"],
          },
          {
            target: "idle",
            actions: ["flushPendingSave", "resetState"],
          },
        ],
      },
    },
    error: {
      on: {
        EDIT: {
          target: "dirty",
          actions: "applyEdit",
        },
        EDIT_HABITS: {
          target: "dirty",
          actions: "applyHabitEdit",
        },
        REMOTE_UPDATE: {
          guard: "canApplyRemote",
          actions: "applyRemoteUpdate",
        },
        INPUTS_CHANGED: [
          {
            guard: "hasInputs",
            target: "loading",
            actions: ["flushPendingSave", "applyInputs"],
          },
          {
            target: "idle",
            actions: ["flushPendingSave", "resetState"],
          },
        ],
      },
    },
  },
});

/**
 * Hook for reading/writing note content from local storage (IDB).
 * This hook has NO network awareness - it only deals with local data.
 *
 * NOTE: Implemented with an XState machine to avoid effect chains.
 */
export function useLocalNoteContent(
  date: string | null,
  repository: NoteRepository | null,
  onAfterSave?: (snapshot: SaveSnapshot) => void,
): UseLocalNoteContentReturn {
  const [state, send] = useMachine(localNoteMachine);

  useEffect(() => {
    send({ type: "UPDATE_AFTER_SAVE", callback: onAfterSave });
  }, [send, onAfterSave]);

  useEffect(() => {
    send({ type: "INPUTS_CHANGED", date, repository });
  }, [send, date, repository]);

  useEffect(() => {
    return () => {
      send({ type: "FLUSH" });
    };
  }, [send]);

  // Flush pending edits when the page becomes hidden (tab switch, browser close).
  // React cleanup effects may not fire reliably on page unload, so this ensures
  // content is saved before the user leaves.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        send({ type: "FLUSH" });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [send]);

  const setContent = useCallback(
    (newContent: string) => {
      send({ type: "EDIT", content: newContent });
    },
    [send],
  );

  const setHabits = useCallback(
    (habits: HabitValues) => {
      send({ type: "EDIT_HABITS", habits });
    },
    [send],
  );

  const applyRemoteUpdate = useCallback(
    (content: string, habits?: HabitValues) => {
      send({ type: "REMOTE_UPDATE", content, habits });
    },
    [send],
  );

  const stateValue = state.value;
  const isReady =
    stateValue === "ready" ||
    stateValue === "dirty" ||
    stateValue === "saving" ||
    stateValue === "error";
  const isSaving = stateValue === "dirty" || stateValue === "saving";

  return {
    content: state.context.content,
    setContent,
    habits: state.context.habits,
    setHabits,
    isLoading: stateValue === "loading",
    hasEdits: state.context.hasEdits,
    isSaving,
    isReady,
    error: state.context.error,
    applyRemoteUpdate,
  };
}
