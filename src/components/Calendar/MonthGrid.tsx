import { useMemo, useCallback } from "react";
import { DayCell } from "./DayCell";
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthName,
  getWeekdayOptions,
  setWeekStartPreference,
  formatDate,
  getDayCellState,
} from "../../utils/date";
import { DayCellState } from "../../types";
import styles from "./MonthGrid.module.css";

interface MonthGridProps {
  year: number;
  month: number;
  hasNote: (date: string) => boolean;
  onDayClick?: (date: string) => void;
  onMonthClick?: (year: number, month: number) => void;
  showMonthView?: boolean;
  selectedDate?: string | null;
  onWeekStartChange?: () => void;
  now?: Date;
}

export function MonthGrid({
  year,
  month,
  hasNote,
  onDayClick,
  onMonthClick,
  showMonthView = false,
  selectedDate = null,
  onWeekStartChange,
  now,
}: MonthGridProps) {
  const weekdays = getWeekdayOptions();
  const currentWeekStart = weekdays[0]?.dayIndex ?? 0;
  const monthName = getMonthName(month);
  const resolvedNow = now ?? new Date();
  const isCurrentMonth =
    year === resolvedNow.getFullYear() && month === resolvedNow.getMonth();

  const handleMonthClick = useCallback(() => {
    if (!showMonthView && onMonthClick) {
      onMonthClick(year, month);
    }
  }, [showMonthView, onMonthClick, year, month]);

  const weeks = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const cells: Array<{ day: number | null; date: Date | null }> = [];

    // Empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: null, date: null });
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ day, date: new Date(year, month, day) });
    }

    // Group into weeks (arrays of 7 days each)
    const weekGroups: Array<typeof cells> = [];
    for (let i = 0; i < cells.length; i += 7) {
      weekGroups.push(cells.slice(i, i + 7));
    }

    return weekGroups;
  }, [year, month, currentWeekStart]);

  return (
    <div
      className={styles.monthGrid}
      data-current-month={isCurrentMonth ? "true" : undefined}
      data-month-view={showMonthView ? "true" : undefined}
    >
      {!showMonthView && (
        <div className={styles.headerWrap}>
          <button
            className={styles.headerButton}
            onClick={handleMonthClick}
            aria-label={`View ${monthName}`}
          >
            {monthName}
          </button>
        </div>
      )}
      <div className={styles.weekdays}>
        {weekdays.map((day) => {
          const isSunday = day.dayIndex === 0;
          if (!isSunday) {
            return (
              <div key={day.dayIndex} className={styles.weekdayLabel}>
                {day.label}
              </div>
            );
          }
          return (
            <button
              key={day.dayIndex}
              className={styles.weekdayButton}
              type="button"
              onClick={() => {
                const nextStart = currentWeekStart === 0 ? 1 : 0;
                setWeekStartPreference(nextStart);
                onWeekStartChange?.();
              }}
              aria-label={`Set week start to ${currentWeekStart === 0 ? "Monday" : "Sunday"}`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
      <div className={styles.days}>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={styles.week}>
            {week.map((cell, dayIndex) => {
              if (cell.day === null || cell.date === null) {
                return (
                  <DayCell
                    key={dayIndex}
                    day={null}
                    state={DayCellState.Empty}
                    hasNote={false}
                  />
                );
              }

              const dateStr = formatDate(cell.date);
              const state = getDayCellState(cell.date, resolvedNow);

              return (
                <DayCell
                  key={dayIndex}
                  day={cell.day}
                  date={cell.date}
                  state={state}
                  hasNote={hasNote(dateStr)}
                  selected={selectedDate === dateStr}
                  onClick={onDayClick ? () => onDayClick(dateStr) : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
