import { useCallback, useState } from "react";
import type { KeyboardEvent } from "react";
import type { HabitDefinition, HabitValues } from "../../types";
import { inferHabitType } from "./habitPreferences";
import { HabitField } from "./HabitField";
import styles from "./HabitTracker.module.css";

interface HabitTrackerProps {
  definitions: HabitDefinition[];
  values: HabitValues | undefined;
  onChange: (values: HabitValues) => void;
  isEditable: boolean;
  onAddHabit: (name: string) => void;
  onRenameHabit: (id: string, name: string) => void;
  onUpdateType: (id: string, type: HabitDefinition["type"]) => void;
}

export function HabitTracker({
  definitions,
  values,
  onChange,
  isEditable,
  onAddHabit,
  onRenameHabit,
  onUpdateType,
}: HabitTrackerProps) {
  const [newHabitName, setNewHabitName] = useState("");

  const handleFieldChange = useCallback(
    (defId: string, def: HabitDefinition, newValue: string | number | boolean) => {
      if (!values?.[defId]) return;
      const entry = values[defId];
      const updated = {
        ...values,
        [defId]: { ...entry, value: newValue },
      };

      // Infer type on first non-empty value if definition is still "text"
      if (def.type === "text" && typeof newValue === "string" && newValue !== "") {
        const inferred = inferHabitType(newValue);
        if (inferred !== "text") {
          onUpdateType(def.id, inferred);
          return; // onUpdateType will update habits with new type
        }
      }

      onChange(updated);
    },
    [values, onChange, onUpdateType],
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
            onChange={(v) => handleFieldChange(def.id, def, v)}
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
