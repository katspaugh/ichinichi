import { useEffect, useRef } from 'react';
import { MonthGrid } from './MonthGrid';
import { Button } from '../Button';

interface CalendarProps {
  year: number;
  hasNote: (date: string) => boolean;
  onDayClick: (date: string) => void;
  onYearChange: (year: number) => void;
}

export function Calendar({ year, hasNote, onDayClick, onYearChange }: CalendarProps) {
  const months = Array.from({ length: 12 }, (_, i) => i);
  const hasAutoScrolledRef = useRef(false);

  useEffect(() => {
    if (hasAutoScrolledRef.current) {
      return;
    }

    const now = new Date();
    if (year !== now.getFullYear()) {
      return;
    }

    if (!window.matchMedia('(max-width: 768px)').matches) {
      return;
    }

    const currentMonthEl = document.querySelector('[data-current-month="true"]');
    if (currentMonthEl instanceof HTMLElement) {
      currentMonthEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
      hasAutoScrolledRef.current = true;
    }
  }, [year]);

  return (
    <div className="calendar">
      <div className="calendar__header">
        <Button
          icon
          onClick={() => onYearChange(year - 1)}
          aria-label="Previous year"
        >
          ←
        </Button>
        <span className="calendar__year">{year}</span>
        <Button
          icon
          onClick={() => onYearChange(year + 1)}
          aria-label="Next year"
        >
          →
        </Button>
      </div>
      <div className="calendar__grid">
        {months.map(month => (
          <MonthGrid
            key={month}
            year={year}
            month={month}
            hasNote={hasNote}
            onDayClick={onDayClick}
          />
        ))}
      </div>
    </div>
  );
}
