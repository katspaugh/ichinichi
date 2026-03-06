import { MonthGrid } from "./MonthGrid";
import styles from "./Calendar.module.css";

interface CalendarGridProps {
  year: number;
  hasNote: (date: string) => boolean;
  onDayClick?: (date: string) => void;
  onMonthClick?: (year: number, month: number) => void;
  selectedDate?: string | null;
  onWeekStartChange?: () => void;
  now?: Date;
  gridRef?: React.RefObject<HTMLDivElement | null>;
}

export function CalendarGrid({
  year,
  hasNote,
  onDayClick,
  onMonthClick,
  selectedDate,
  onWeekStartChange,
  now,
  gridRef,
}: CalendarGridProps) {
  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div ref={gridRef} className={styles.grid}>
      {months.map((monthIndex) => (
        <MonthGrid
          key={monthIndex}
          year={year}
          month={monthIndex}
          hasNote={hasNote}
          onDayClick={onDayClick}
          onMonthClick={onMonthClick}
          selectedDate={selectedDate}
          onWeekStartChange={onWeekStartChange}
          now={now}
        />
      ))}
    </div>
  );
}
