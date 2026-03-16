import { parseDate } from "../../utils/date";
import { getMoonPhaseEmoji, getMoonPhaseName } from "../../utils/moonPhase";
import { formatDailyWeatherLabel } from "../../features/weather/WeatherDom";
import type { DailyWeatherData } from "../../features/weather/WeatherRepository";
import styles from "./NoteEditor.module.css";

interface NoteEditorHeaderProps {
  date: string;
  formattedDate: string;
  showReadonlyBadge: boolean;
  statusText: string | null;
  isStatusError?: boolean;
  onRestore?: () => void;
  dailyWeather?: DailyWeatherData | null;
}

export function NoteEditorHeader({
  date,
  formattedDate,
  showReadonlyBadge,
  statusText,
  isStatusError = false,
  onRestore,
  dailyWeather,
}: NoteEditorHeaderProps) {
  const parsed = parseDate(date);
  const moonEmoji = parsed ? getMoonPhaseEmoji(parsed) : "";
  const moonTitle = parsed ? getMoonPhaseName(parsed) : "";

  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>
        <span className={styles.date}>
          {moonEmoji && <><span className={styles.moonEmoji} title={moonTitle}>{moonEmoji}</span> </>}
          {formattedDate}
        </span>
        {dailyWeather && (
          <span className={styles.weatherLabel}>
            {formatDailyWeatherLabel(dailyWeather)}
          </span>
        )}
        {showReadonlyBadge && (
          <span className={styles.readonlyBadge}>Read only</span>
        )}
      </div>
      {statusText && (
        <span
          className={[
            styles.status,
            isStatusError ? styles.statusError : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-live="polite"
        >
          {statusText}
          {onRestore && (
            <button
              className={styles.restoreButton}
              onClick={onRestore}
            >
              Restore
            </button>
          )}
        </span>
      )}
    </div>
  );
}
