import { useCallback, useMemo } from "react";
import type { HabitDefinition, HabitEntry, HabitValues } from "../../types";

export interface UseHabitDefinitionsReturn {
  definitions: HabitDefinition[];
  addHabit: (name: string) => void;
  removeHabit: (id: string) => void;
  renameHabit: (id: string, name: string) => void;
}

export function useHabitDefinitions(
  habits: HabitValues | undefined,
  onChange: ((habits: HabitValues) => void) | undefined,
): UseHabitDefinitionsReturn {
  const definitions = useMemo<HabitDefinition[]>(() => {
    if (!habits) return [];
    return Object.entries(habits)
      .map(([id, entry]) => ({
        id,
        name: entry.name,
        type: entry.type,
        order: entry.order,
      }))
      .sort((a, b) => a.order - b.order);
  }, [habits]);

  const addHabit = useCallback(
    (name: string) => {
      if (!onChange) return;
      const id = crypto.randomUUID();
      const maxOrder = definitions.reduce((max, d) => Math.max(max, d.order), -1);
      const entry: HabitEntry = {
        name: name.trim(),
        type: "text",
        order: maxOrder + 1,
        value: "",
      };
      onChange({ ...habits, [id]: entry });
    },
    [habits, definitions, onChange],
  );

  const removeHabit = useCallback(
    (id: string) => {
      if (!onChange || !habits) return;
      const updated = { ...habits };
      delete updated[id];
      onChange(updated);
    },
    [habits, onChange],
  );

  const renameHabit = useCallback(
    (id: string, name: string) => {
      if (!onChange || !habits?.[id]) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      onChange({
        ...habits,
        [id]: { ...habits[id], name: trimmed },
      });
    },
    [habits, onChange],
  );

  return { definitions, addHabit, removeHabit, renameHabit };
}
