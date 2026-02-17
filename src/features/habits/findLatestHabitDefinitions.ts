import type { NoteRepository } from "../../storage/noteRepository";
import type { HabitValues } from "../../types";
import { parseDate } from "../../utils/date";

/**
 * Find habit definitions from the most recent note before the given date.
 * Returns habits with values reset to "" (definitions only, no values carried over).
 * Returns undefined if no previous note with habits exists.
 */
export async function findLatestHabitDefinitions(
  repository: NoteRepository,
  beforeDate: string,
): Promise<HabitValues | undefined> {
  const datesResult = await repository.getAllDates();
  if (!datesResult.ok) return undefined;

  const targetParsed = parseDate(beforeDate);
  if (!targetParsed) return undefined;

  const earlier = datesResult.value
    .map((d) => ({ str: d, parsed: parseDate(d) }))
    .filter(
      (d): d is { str: string; parsed: Date } =>
        d.parsed !== null && d.parsed < targetParsed,
    )
    .sort((a, b) => b.parsed.getTime() - a.parsed.getTime());

  for (const { str: dateStr } of earlier) {
    const result = await repository.get(dateStr);
    if (!result.ok) continue;
    const note = result.value;
    if (note?.habits && Object.keys(note.habits).length > 0) {
      const definitions: HabitValues = {};
      for (const [id, entry] of Object.entries(note.habits)) {
        definitions[id] = { ...entry, value: "" };
      }
      return definitions;
    }
  }

  return undefined;
}
