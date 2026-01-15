import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { NoteRepository } from "../storage/noteRepository";
import { isContentEmpty } from "../utils/sanitize";

interface SaveSnapshot {
  date: string;
  content: string;
  isEmpty: boolean;
}

export interface UseLocalNoteContentReturn {
  content: string;
  setContent: (content: string) => void;
  isLoading: boolean;
  hasEdits: boolean;
  isReady: boolean;
  error: Error | null;
  /** Allows external code to update content (e.g., from remote sync) */
  applyRemoteUpdate: (content: string) => void;
}

type LocalNoteEvent =
  | {
      type: "INPUTS_CHANGED";
      date: string | null;
      repository: NoteRepository | null;
    }
  | { type: "LOAD_SUCCESS"; date: string; content: string }
  | { type: "LOAD_ERROR"; date: string; error: Error }
  | { type: "EDIT"; content: string }
  | { type: "REMOTE_UPDATE"; content: string }
  | { type: "SAVE_SUCCESS"; snapshot: SaveSnapshot }
  | { type: "SAVE_FAILED" }
  | { type: "FLUSH" }
  | { type: "UPDATE_AFTER_SAVE"; callback?: (snapshot: SaveSnapshot) => void };

interface LocalNoteContext {
  date: string | null;
  repository: NoteRepository | null;
  content: string;
  hasEdits: boolean;
  error: Error | null;
  afterSave?: (snapshot: SaveSnapshot) => void;
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
      try {
        const note = await input.repository.get(input.date);
        const loadedContent = note?.content ?? "";
        if (!cancelled) {
          sendBack({
            type: "LOAD_SUCCESS",
            date: input.date,
            content: loadedContent,
          });
        }
      } catch (error) {
        if (!cancelled) {
          sendBack({
            type: "LOAD_ERROR",
            date: input.date,
            error:
              error instanceof Error ? error : new Error("Failed to load note"),
          });
        }
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
    input: { date: string; content: string; repository: NoteRepository };
  }) => {
    let cancelled = false;

    const save = async () => {
      try {
        const isEmpty = isContentEmpty(input.content);
        if (!isEmpty) {
          await input.repository.save(input.date, input.content);
        } else {
          await input.repository.delete(input.date);
        }
        if (!cancelled) {
          sendBack({
            type: "SAVE_SUCCESS",
            snapshot: {
              date: input.date,
              content: input.content,
              isEmpty,
            },
          });
        }
      } catch (error) {
        console.error("Failed to save note:", error);
        if (!cancelled) {
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

const localNoteMachine = setup({
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
      hasEdits: false,
      error: null,
    }),
    clearError: assign({ error: null }),
    resetEdits: assign({ hasEdits: false }),
    clearContent: assign({ content: "" }),
    applyLoadedContent: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "LOAD_SUCCESS") {
        return {};
      }
      return {
        content: event.content,
        hasEdits: false,
        error: null,
      };
    }),
    applyLoadError: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "LOAD_ERROR") {
        return {};
      }
      return {
        content: "",
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
    applyRemoteUpdate: assign((args: { event: LocalNoteEvent }) => {
      const { event } = args;
      if (event.type !== "REMOTE_UPDATE") {
        return {};
      }
      return {
        content: event.content,
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
        isEmpty: isContentEmpty(context.content),
      };
      if (!snapshot.isEmpty) {
        void context.repository
          .save(snapshot.date, snapshot.content)
          .then(() => {
            context.afterSave?.(snapshot);
          })
          .catch((error) => {
            console.error("Failed to save note:", error);
          });
      } else {
        void context.repository
          .delete(snapshot.date)
          .then(() => {
            context.afterSave?.(snapshot);
          })
          .catch((error) => {
            console.error("Failed to save note:", error);
          });
      }
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
    hasEdits: false,
    error: null,
    afterSave: undefined,
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
        400: { target: "saving" },
      },
      on: {
        EDIT: {
          target: "dirty",
          reenter: true,
          actions: "applyEdit",
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
          repository: context.repository as NoteRepository,
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

  const setContent = useCallback(
    (newContent: string) => {
      send({ type: "EDIT", content: newContent });
    },
    [send],
  );

  const applyRemoteUpdate = useCallback(
    (content: string) => {
      send({ type: "REMOTE_UPDATE", content });
    },
    [send],
  );

  const stateValue = state.value;
  const isReady =
    stateValue === "ready" ||
    stateValue === "dirty" ||
    stateValue === "saving" ||
    stateValue === "error";

  return {
    content: state.context.content,
    setContent,
    isLoading: stateValue === "loading",
    hasEdits: state.context.hasEdits,
    isReady,
    error: state.context.error,
    applyRemoteUpdate,
  };
}
