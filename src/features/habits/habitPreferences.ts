import type { HabitType } from "../../types";

export function inferHabitType(value: string): HabitType {
  if (value === "") return "text";
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "yes" || lower === "no") return "checkbox";
  if (trimmed !== "" && !isNaN(Number(trimmed))) return "number";
  return "text";
}
