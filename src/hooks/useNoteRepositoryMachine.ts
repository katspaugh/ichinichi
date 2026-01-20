import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";

export type NoteRepositoryEvent =
  | {
      type: "UPDATE_INPUTS";
      applyNoteChange: (date: string, isEmpty: boolean) => void;
      queueIdleSync: () => void;
    }
  | { type: "AFTER_SAVE"; date: string; isEmpty: boolean }
  | { type: "CLEAR_TIMER" };

interface NoteRepositoryContext {
  applyNoteChange: (date: string, isEmpty: boolean) => void;
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
      applyNoteChange: (date: string, isEmpty: boolean) => void;
    };
  }) => {
    const { snapshot, applyNoteChange } = input;
    applyNoteChange(snapshot.date, snapshot.isEmpty);
    sendBack({ type: "CLEAR_TIMER" });
    return () => {};
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
        applyNoteChange: event.applyNoteChange,
        queueIdleSync: event.queueIdleSync,
      };
    }),
    clearTimer: assign({ timerId: null }),
  },
}).createMachine({
  id: "noteRepository",
  initial: "idle",
  context: {
    applyNoteChange: () => {},
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
              applyNoteChange: context.applyNoteChange,
            };
          }
          return {
            snapshot: { date: event.date, isEmpty: event.isEmpty },
            applyNoteChange: context.applyNoteChange,
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
