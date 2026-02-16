import { useState } from "react";
import type { HabitDefinition } from "../../types";
import styles from "./HabitTracker.module.css";

interface HabitFieldProps {
  definition: HabitDefinition;
  value: string;
  onChange: (value: string) => void;
  onRename: (name: string) => void;
  isEditable: boolean;
}

export function HabitField({
  definition,
  value,
  onChange,
  onRename,
  isEditable,
}: HabitFieldProps) {
  const { name } = definition;
  const completed = value !== "";
  const [editingName, setEditingName] = useState(name);

  const handleCheckboxToggle = () => {
    if (!isEditable) return;
    onChange(completed ? "" : "done");
  };

  const handleNameBlur = () => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== name) {
      onRename(trimmed);
    } else {
      setEditingName(name);
    }
  };

  return (
    <div className={styles.field}>
      <input
        type="checkbox"
        checked={completed}
        onChange={handleCheckboxToggle}
        disabled={!isEditable}
        className={styles.checkbox}
        aria-label={`${name} completed`}
      />
      <div className={styles.fieldBody}>
        {isEditable ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleNameBlur}
            className={styles.nameInput}
          />
        ) : (
          <span className={styles.fieldName}>{name}</span>
        )}
        {isEditable ? (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={!isEditable}
            className={styles.input}
            placeholder="..."
          />
        ) : (
          value !== "" && <span className={styles.valueText}>{value}</span>
        )}
      </div>
    </div>
  );
}
