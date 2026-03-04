/** Synodic month length in days */
const SYNODIC_MONTH = 29.53059;

/** Known new moon: January 6, 2000 18:14 UTC */
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const MOON_PHASES: ReadonlyArray<[emoji: string, name: string]> = [
  ["\uD83C\uDF11", "New Moon"],
  ["\uD83C\uDF12", "Waxing Crescent"],
  ["\uD83C\uDF13", "First Quarter"],
  ["\uD83C\uDF14", "Waxing Gibbous"],
  ["\uD83C\uDF15", "Full Moon"],
  ["\uD83C\uDF16", "Waning Gibbous"],
  ["\uD83C\uDF17", "Last Quarter"],
  ["\uD83C\uDF18", "Waning Crescent"],
];

function getMoonPhaseIndex(date: Date): number {
  const daysSinceRef =
    (date.getTime() - REFERENCE_NEW_MOON) / (1000 * 60 * 60 * 24);
  const phase = ((daysSinceRef % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  return Math.round((phase / SYNODIC_MONTH) * 8) % 8;
}

/**
 * Get the moon phase emoji for a given date.
 * Uses a known new-moon reference and the synodic period to compute the phase.
 */
export function getMoonPhaseEmoji(date: Date): string {
  return MOON_PHASES[getMoonPhaseIndex(date)][0];
}

/** Get the moon phase name (e.g. "Waxing Crescent") for a given date. */
export function getMoonPhaseName(date: Date): string {
  return MOON_PHASES[getMoonPhaseIndex(date)][1];
}
