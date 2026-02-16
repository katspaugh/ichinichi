import { useState } from "react";
import type { HabitDefinition } from "../../types";
import styles from "./HabitTracker.module.css";

interface HabitFieldProps {
  definition: HabitDefinition;
  value: string | number | boolean;
  onChange: (value: string | number | boolean) => void;
  onRename: (name: string) => void;
  isEditable: boolean;
}

function hasValue(value: string | number | boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value !== "";
}

export function HabitField({
  definition,
  value,
  onChange,
  onRename,
  isEditable,
}: HabitFieldProps) {
  const { type, name } = definition;
  const completed = hasValue(value);
  const [editingName, setEditingName] = useState(name);

  const handleCheckboxToggle = () => {
    if (!isEditable) return;
    if (completed) {
      // Clear the value
      if (type === "checkbox") onChange(false);
      else if (type === "number") onChange(0);
      else onChange("");
    } else {
      // Mark as done
      if (type === "checkbox") onChange(true);
      else if (type === "number") onChange(1);
      else onChange(true);
    }
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
        {type === "checkbox" ? null : isEditable ? (
          <input
            type={type === "number" ? "number" : "text"}
            value={
              type === "number"
                ? typeof value === "number" && value !== 0
                  ? value
                  : ""
                : typeof value === "string"
                  ? value
                  : ""
            }
            onChange={(e) => {
              if (type === "number") {
                const raw = e.target.value;
                onChange(raw === "" ? 0 : Number(raw));
              } else {
                onChange(e.target.value);
              }
            }}
            disabled={!isEditable}
            className={styles.input}
            placeholder="..."
          />
        ) : (
          typeof value === "string" &&
          value !== "" && <span className={styles.valueText}>{value}</span>
        )}
      </div>
    </div>
  );
}
