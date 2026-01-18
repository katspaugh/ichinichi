import { MonthGrid } from "./MonthGrid";
import styles from "./Calendar.module.css";

interface CalendarGridProps {
  year: number;
  month: number | null;
  hasNote: (date: string) => boolean;
  onDayClick?: (date: string) => void;
  onMonthClick?: (year: number, month: number) => void;
  selectedDate?: string | null;
  onWeekStartChange?: () => void;
  now?: Date;
}

export function CalendarGrid({
  year,
  month,
  hasNote,
  onDayClick,
  onMonthClick,
  selectedDate,
  onWeekStartChange,
  now,
}: CalendarGridProps) {
  const months =
    month == null ? Array.from({ length: 12 }, (_, i) => i) : [month];

  return (
    <div
      className={styles.grid}
      data-month-view={month != null ? "true" : undefined}
    >
      {months.map((monthIndex) => (
        <MonthGrid
          key={monthIndex}
          year={year}
          month={monthIndex}
          hasNote={hasNote}
          onDayClick={onDayClick}
          onMonthClick={onMonthClick}
          showMonthView={month != null}
          selectedDate={month != null ? selectedDate : undefined}
          onWeekStartChange={onWeekStartChange}
          now={now}
        />
      ))}
    </div>
  );
}
