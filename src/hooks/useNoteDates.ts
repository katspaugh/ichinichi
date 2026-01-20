import { useCallback, useEffect } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
import type { NoteRepository } from "../storage/noteRepository";
import { useConnectivity } from "./useConnectivity";

interface UseNoteDatesReturn {
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: (options?: { immediate?: boolean }) => void;
  applyNoteChange: (date: string, isEmpty: boolean) => void;
}

import type { RepositoryError } from "../domain/errors";
import type { Result } from "../domain/result";

interface YearDateRepository {
  getAllDatesForYear: (year: number) => Promise<Result<string[], RepositoryError>>;
}

interface LocalDateRepository {
  getAllLocalDates: () => Promise<Result<string[], RepositoryError>>;
  getAllLocalDatesForYear: (year: number) => Promise<Result<string[], RepositoryError>>;
}

interface RefreshableDateRepository {
  refreshDates: (year: number) => Promise<void>;
}

function supportsYearDates(
  repository: NoteRepository | null,
): repository is NoteRepository & YearDateRepository {
  return !!repository && "getAllDatesForYear" in repository;
}

function supportsLocalDates(
  repository: NoteRepository | null,
): repository is NoteRepository & LocalDateRepository {
  return !!repository && "getAllLocalDates" in repository;
}

function supportsDateRefresh(
  repository: NoteRepository | null,
): repository is NoteRepository & RefreshableDateRepository {
  return !!repository && "refreshDates" in repository;
}

interface NoteDatesContext {
  repository: NoteRepository | null;
  year: number;
  online: boolean;
  noteDates: Set<string>;
  pendingRefresh: boolean;
}

type NoteDatesEvent =
  | {
      type: "INPUTS_CHANGED";
      repository: NoteRepository | null;
      year: number;
      online: boolean;
    }
  | { type: "REFRESH_REQUEST"; immediate?: boolean }
  | { type: "REFRESH_DONE" }
  | { type: "DATES_UPDATED"; dates: string[] }
  | { type: "DATES_CLEARED" }
  | { type: "MARK_PENDING_REFRESH" }
  | { type: "CLEAR_PENDING_REFRESH" }
  | { type: "APPLY_NOTE_CHANGE"; date: string; isEmpty: boolean };

const refreshActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: NoteDatesEvent) => void;
    input: { repository: NoteRepository | null; year: number; online: boolean };
  }) => {
    let cancelled = false;

    const refresh = async () => {
      if (!input.repository) {
        sendBack({ type: "DATES_CLEARED" });
        sendBack({ type: "REFRESH_DONE" });
        return;
      }

      let hasLocalSnapshot = false;
      if (supportsLocalDates(input.repository)) {
        const localResult = supportsYearDates(input.repository)
          ? await input.repository.getAllLocalDatesForYear(input.year)
          : await input.repository.getAllLocalDates();
        if (localResult.ok) {
          hasLocalSnapshot = true;
          if (!cancelled) {
            sendBack({ type: "DATES_UPDATED", dates: localResult.value });
          }
        } else if (!cancelled) {
          sendBack({ type: "DATES_CLEARED" });
        }
      }

      if (input.online && supportsDateRefresh(input.repository)) {
        await input.repository.refreshDates(input.year);
      }

      const datesResult = supportsYearDates(input.repository)
        ? await input.repository.getAllDatesForYear(input.year)
        : await input.repository.getAllDates();

      if (!cancelled) {
        if (datesResult.ok) {
          sendBack({ type: "DATES_UPDATED", dates: datesResult.value });
        } else if (!hasLocalSnapshot) {
          sendBack({ type: "DATES_CLEARED" });
        }
      }

      if (!cancelled) {
        sendBack({ type: "REFRESH_DONE" });
      }
    };

    void refresh();

    return () => {
      cancelled = true;
    };
  },
);

const noteDatesMachine = setup({
  types: {
    context: {} as NoteDatesContext,
    events: {} as NoteDatesEvent,
  },
  actors: {
    refreshActor,
  },
  actions: {
    applyInputs: assign((args: { event: NoteDatesEvent }) => {
      const { event } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return {};
      }
      return {
        repository: event.repository,
        year: event.year,
        online: event.online,
      };
    }),
    setNoteDates: assign((args: { event: NoteDatesEvent }) => {
      const { event } = args;
      if (event.type !== "DATES_UPDATED") {
        return {};
      }
      return { noteDates: new Set(event.dates) };
    }),
    clearNoteDates: assign({ noteDates: new Set() }),
    applyNoteChange: assign((args: { event: NoteDatesEvent; context: NoteDatesContext }) => {
      const { event, context } = args;
      if (event.type !== "APPLY_NOTE_CHANGE") {
        return {};
      }
      const nextDates = new Set(context.noteDates);
      if (event.isEmpty) {
        nextDates.delete(event.date);
      } else {
        nextDates.add(event.date);
      }
      return { noteDates: nextDates };
    }),
    markPendingRefresh: assign({ pendingRefresh: true }),
    clearPendingRefresh: assign({ pendingRefresh: false }),
    maybeRefreshOnOnline: (args: {
      event: NoteDatesEvent;
      context: NoteDatesContext;
      self: { send: (event: NoteDatesEvent) => void };
    }) => {
      const { event, context, self } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return;
      }
      if (event.online && !context.online) {
        self.send({ type: "REFRESH_REQUEST", immediate: true });
      }
    },
  },
  guards: {
    inputsChanged: ({
      event,
      context,
    }: {
      event: NoteDatesEvent;
      context: NoteDatesContext;
    }) =>
      event.type === "INPUTS_CHANGED" &&
      (event.repository !== context.repository || event.year !== context.year),
    isImmediateRefresh: ({ event }: { event: NoteDatesEvent }) =>
      event.type === "REFRESH_REQUEST" && Boolean(event.immediate),
    hasPendingRefresh: ({ context }: { context: NoteDatesContext }) =>
      context.pendingRefresh,
  },
}).createMachine({
  id: "noteDates",
  initial: "idle",
  context: {
    repository: null,
    year: new Date().getFullYear(),
    online: false,
    noteDates: new Set(),
    pendingRefresh: false,
  },
  on: {
    INPUTS_CHANGED: [
      {
        guard: "inputsChanged",
        target: ".refreshing",
        actions: ["applyInputs", "clearPendingRefresh"],
      },
      {
        actions: ["applyInputs", "maybeRefreshOnOnline"],
      },
    ],
    APPLY_NOTE_CHANGE: {
      actions: "applyNoteChange",
    },
  },
  states: {
    idle: {
      on: {
        REFRESH_REQUEST: [
          {
            guard: "isImmediateRefresh",
            target: "refreshing",
            actions: "clearPendingRefresh",
          },
          {
            target: "debouncing",
          },
        ],
      },
    },
    debouncing: {
      after: {
        400: {
          target: "refreshing",
          actions: "clearPendingRefresh",
        },
      },
      on: {
        REFRESH_REQUEST: [
          {
            guard: "isImmediateRefresh",
            target: "refreshing",
            actions: "clearPendingRefresh",
          },
          {
            target: "debouncing",
            reenter: true,
          },
        ],
        INPUTS_CHANGED: {
          target: "refreshing",
          actions: ["applyInputs", "clearPendingRefresh"],
        },
      },
    },
    refreshing: {
      entry: "clearPendingRefresh",
      invoke: {
        id: "refreshActor",
        src: "refreshActor",
        input: ({ context }: { context: NoteDatesContext }) => ({
          repository: context.repository,
          year: context.year,
          online: context.online,
        }),
      },
      on: {
        DATES_UPDATED: {
          actions: "setNoteDates",
        },
        DATES_CLEARED: {
          actions: "clearNoteDates",
        },
        REFRESH_DONE: [
          {
            guard: "hasPendingRefresh",
            target: "refreshing",
            actions: "clearPendingRefresh",
          },
          {
            target: "idle",
          },
        ],
        REFRESH_REQUEST: {
          actions: "markPendingRefresh",
        },
        INPUTS_CHANGED: {
          actions: ["applyInputs", "markPendingRefresh"],
        },
      },
    },
  },
});

export function useNoteDates(
  repository: NoteRepository | null,
  year: number,
): UseNoteDatesReturn {
  const online = useConnectivity();
  const [state, send] = useMachine(noteDatesMachine);

  useEffect(() => {
    send({ type: "INPUTS_CHANGED", repository, year, online });
  }, [send, repository, year, online]);

  useEffect(() => {
    send({ type: "REFRESH_REQUEST", immediate: true });
  }, [send]);

  const refreshNoteDates = useCallback(
    (options?: { immediate?: boolean }) => {
      send({ type: "REFRESH_REQUEST", immediate: options?.immediate });
    },
    [send],
  );

  const applyNoteChange = useCallback(
    (date: string, isEmpty: boolean) => {
      send({ type: "APPLY_NOTE_CHANGE", date, isEmpty });
    },
    [send],
  );

  const hasNote = useCallback(
    (checkDate: string): boolean => state.context.noteDates.has(checkDate),
    [state.context.noteDates],
  );

  return {
    hasNote,
    noteDates: state.context.noteDates,
    refreshNoteDates,
    applyNoteChange,
  };
}
