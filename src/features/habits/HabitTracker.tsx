import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import type { HabitDefinition, HabitValues } from "../../types";
import { HabitField } from "./HabitField";
import styles from "./HabitTracker.module.css";

interface HabitTrackerProps {
  definitions: HabitDefinition[];
  values: HabitValues | undefined;
  onChange: (values: HabitValues) => void;
  isEditable: boolean;
  onAddHabit: (name: string) => void;
  onRenameHabit: (id: string, name: string) => void;
}

export function HabitTracker({
  definitions,
  values,
  onChange,
  isEditable,
  onAddHabit,
  onRenameHabit,
}: HabitTrackerProps) {
  const [newHabitName, setNewHabitName] = useState("");

  const handleFieldChange = useCallback(
    (defId: string, newValue: string) => {
      if (!values?.[defId]) return;
      const entry = values[defId];
      onChange({
        ...values,
        [defId]: { ...entry, value: newValue },
      });
    },
    [values, onChange],
  );

  const handleAddHabit = useCallback(() => {
    const trimmed = newHabitName.trim();
    if (!trimmed) return;
    onAddHabit(trimmed);
    setNewHabitName("");
  }, [newHabitName, onAddHabit]);

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddHabit();
      }
    },
    [handleAddHabit],
  );

  if (definitions.length === 0 && !isEditable) {
    return null;
  }

  return (
    <div className={styles.tracker}>
      <div className={styles.fields}>
        {definitions.map((def) => (
          <HabitField
            key={def.id}
            definition={def}
            value={values?.[def.id]?.value ?? ""}
            onChange={(v) => handleFieldChange(def.id, v)}
            onRename={(name) => onRenameHabit(def.id, name)}
            isEditable={isEditable}
          />
        ))}
        {isEditable && (
          <div className={styles.addRow}>
            <input
              type="text"
              value={newHabitName}
              onChange={(e) => setNewHabitName(e.target.value)}
              onKeyDown={handleAddKeyDown}
              onBlur={handleAddHabit}
              placeholder="+ Add habit"
              className={styles.addInput}
            />
          </div>
        )}
      </div>
    </div>
  );
}
