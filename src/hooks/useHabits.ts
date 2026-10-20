import { useCallback, useMemo } from "react";
import { useNoteRepositoryContext } from "../contexts/noteRepositoryContext";
import { usePinnedHabits } from "./usePinnedHabits";
import {
  computeStreak,
  habitDaysCount,
  habitDoneOn,
  habitMarksOn,
  sortByDaysCount,
  withTodaySections,
  type HabitMark,
} from "../utils/habits";
import { extractSectionTypes, sectionHueSlot } from "../utils/sectionTypes";
import { getTodayString } from "../utils/date";

/** A pinned habit as the composer and header show it. */
export interface HabitStatus {
  type: string;
  slot: number;
  done: boolean;
  streak: number;
}

/** A section type as the settings list shows it. */
export interface SectionTypeSummary {
  type: string;
  slot: number;
  days: number;
  pinned: boolean;
}

interface UseHabitsOptions {
  /** Today's live note content, so chips and streaks reflect the entry just
   *  saved before the database subscription catches up. */
  todayContent?: string;
}

export function useHabits(options: UseHabitsOptions = {}) {
  const { noteSections } = useNoteRepositoryContext();
  const { pinned, togglePinned } = usePinnedHabits();
  const { todayContent } = options;

  const sections = useMemo(() => {
    if (todayContent === undefined) return noteSections;
    return withTodaySections(
      noteSections,
      getTodayString(),
      [...new Set([...(noteSections.get(getTodayString()) ?? []), ...extractSectionTypes(todayContent)])],
    );
  }, [noteSections, todayContent]);

  const habits = useMemo<HabitStatus[]>(() => {
    const now = new Date();
    const today = getTodayString();
    return pinned.map((type) => ({
      type,
      slot: sectionHueSlot(type),
      done: habitDoneOn(sections, type, today),
      streak: computeStreak(sections, type, now),
    }));
  }, [pinned, sections]);

  const sectionTypes = useMemo<SectionTypeSummary[]>(() => {
    const counts = habitDaysCount(noteSections);
    const seen = new Set(counts.keys());
    for (const type of pinned) {
      if (!seen.has(type)) counts.set(type, 0);
    }
    return sortByDaysCount(counts).map(({ type, days }) => ({
      type,
      days,
      slot: sectionHueSlot(type),
      pinned: pinned.includes(type),
    }));
  }, [noteSections, pinned]);

  const habitsFor = useCallback(
    (date: string): HabitMark[] => habitMarksOn(noteSections, pinned, date),
    [noteSections, pinned],
  );

  return { pinned, togglePinned, habits, sectionTypes, habitsFor };
}
