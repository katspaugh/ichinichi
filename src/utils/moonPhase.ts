/** Synodic month length in days */
const SYNODIC_MONTH = 29.53059;

/** Known new moon: January 6, 2000 18:14 UTC */
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

const MOON_PHASES = [
  "\uD83C\uDF11", // 🌑 New Moon
  "\uD83C\uDF12", // 🌒 Waxing Crescent
  "\uD83C\uDF13", // 🌓 First Quarter
  "\uD83C\uDF14", // 🌔 Waxing Gibbous
  "\uD83C\uDF15", // 🌕 Full Moon
  "\uD83C\uDF16", // 🌖 Waning Gibbous
  "\uD83C\uDF17", // 🌗 Last Quarter
  "\uD83C\uDF18", // 🌘 Waning Crescent
] as const;

/**
 * Get the moon phase emoji for a given date.
 * Uses a known new-moon reference and the synodic period to compute the phase.
 */
export function getMoonPhaseEmoji(date: Date): string {
  const daysSinceRef =
    (date.getTime() - REFERENCE_NEW_MOON) / (1000 * 60 * 60 * 24);
  const phase = ((daysSinceRef % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
  const index = Math.round((phase / SYNODIC_MONTH) * 8) % 8;
  return MOON_PHASES[index];
}
