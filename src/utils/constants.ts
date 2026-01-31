export const STORAGE_PREFIX = "dailynote_";
export const INTRO_SEEN_KEY = `${STORAGE_PREFIX}intro_seen_v1`;
export const AUTH_HAS_LOGGED_IN_KEY = `${STORAGE_PREFIX}has_logged_in_v1`;
export const WEEK_START_KEY = `${STORAGE_PREFIX}week_start_v1`;
export const THEME_KEY = `${STORAGE_PREFIX}theme_v1`;
export const LOCATION_PROMPT_SHOWN_KEY = `${STORAGE_PREFIX}location_prompt_shown_v1`;
export const VIEW_PREFERENCE_KEY = `${STORAGE_PREFIX}view_preference_v1`;

export const URL_PARAMS = {
  DATE: "date",
  YEAR: "year",
  MONTH: "month",
} as const;
