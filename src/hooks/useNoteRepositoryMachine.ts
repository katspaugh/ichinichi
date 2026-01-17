import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";

export type NoteRepositoryEvent =
  | {
      type: "UPDATE_INPUTS";
      hasNote: (date: string) => boolean;
      refreshNoteDates: (options?: { immediate?: boolean }) => void;
      queueIdleSync: () => void;
    }
  | { type: "AFTER_SAVE"; date: string; isEmpty: boolean }
  | { type: "CLEAR_TIMER" };

interface NoteRepositoryContext {
  hasNote: (date: string) => boolean;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  queueIdleSync: () => void;
  timerId: number | null;
}

const afterSaveActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: NoteRepositoryEvent) => void;
    input: {
      snapshot: { date: string; isEmpty: boolean };
      hasNote: (date: string) => boolean;
      refreshNoteDates: (options?: { immediate?: boolean }) => void;
    };
  }) => {
    const { snapshot, hasNote, refreshNoteDates } = input;
    const shouldRefresh = snapshot.isEmpty || !hasNote(snapshot.date);
    if (!shouldRefresh) {
      sendBack({ type: "CLEAR_TIMER" });
      return () => {};
    }
    const timer = window.setTimeout(() => {
      refreshNoteDates();
      sendBack({ type: "CLEAR_TIMER" });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  },
);

const noteRepositoryMachine = setup({
  types: {
    context: {} as NoteRepositoryContext,
    events: {} as NoteRepositoryEvent,
  },
  actors: {
    afterSaveActor,
  },
  actions: {
    updateInputs: assign((args: { event: NoteRepositoryEvent }) => {
      const { event } = args;
      if (event.type !== "UPDATE_INPUTS") {
        return {};
      }
      return {
        hasNote: event.hasNote,
        refreshNoteDates: event.refreshNoteDates,
        queueIdleSync: event.queueIdleSync,
      };
    }),
    clearTimer: assign({ timerId: null }),
  },
}).createMachine({
  id: "noteRepository",
  initial: "idle",
  context: {
    hasNote: () => false,
    refreshNoteDates: () => {},
    queueIdleSync: () => {},
    timerId: null,
  },
  on: {
    UPDATE_INPUTS: {
      actions: "updateInputs",
    },
    CLEAR_TIMER: {
      actions: "clearTimer",
    },
  },
  states: {
    idle: {
      on: {
        AFTER_SAVE: {
          target: "refreshing",
        },
      },
    },
    refreshing: {
      invoke: {
        id: "afterSave",
        src: "afterSaveActor",
        input: ({
          context,
          event,
        }: {
          context: NoteRepositoryContext;
          event: NoteRepositoryEvent;
        }) => {
          if (event.type !== "AFTER_SAVE") {
            return {
              snapshot: { date: "", isEmpty: false },
              hasNote: context.hasNote,
              refreshNoteDates: context.refreshNoteDates,
            };
          }
          return {
            snapshot: { date: event.date, isEmpty: event.isEmpty },
            hasNote: context.hasNote,
            refreshNoteDates: context.refreshNoteDates,
          };
        },
      },
      on: {
        CLEAR_TIMER: {
          target: "idle",
        },
      },
    },
  },
});

export function useNoteRepositoryMachine() {
  return useMachine(noteRepositoryMachine);
}
