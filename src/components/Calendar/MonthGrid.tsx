import { useMemo } from 'react';
import { DayCell } from './DayCell';
import {
  getDaysInMonth,
  getFirstDayOfMonth,
  getMonthName,
  getWeekdays,
  formatDate,
  getDayCellState
} from '../../utils/date';

interface MonthGridProps {
  year: number;
  month: number;
  hasNote: (date: string) => boolean;
  onDayClick: (date: string) => void;
}

export function MonthGrid({ year, month, hasNote, onDayClick }: MonthGridProps) {
  const weekdays = getWeekdays();
  const monthName = getMonthName(month);
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const days = useMemo(() => {
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

    return cells;
  }, [year, month]);

  return (
    <div className="month-grid" data-current-month={isCurrentMonth ? 'true' : undefined}>
      <div className="month-grid__header">{monthName}</div>
      <div className="month-grid__weekdays">
        {weekdays.map(day => (
          <div key={day} className="month-grid__weekday">{day}</div>
        ))}
      </div>
      <div className="month-grid__days">
        {days.map((cell, index) => {
          if (cell.day === null || cell.date === null) {
            return <DayCell key={index} day={null} state="empty" hasNote={false} />;
          }

          const dateStr = formatDate(cell.date);
          const state = getDayCellState(cell.date);

          return (
            <DayCell
              key={index}
              day={cell.day}
              state={state}
              hasNote={hasNote(dateStr)}
              onClick={() => onDayClick(dateStr)}
            />
          );
        })}
      </div>
    </div>
  );
}
