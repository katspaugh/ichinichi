import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarGrid } from "./CalendarGrid";
import styles from "./Calendar.module.css";

interface CalendarProps {
  year: number;
  hasNote: (date: string) => boolean;
  onDayClick?: (date: string) => void;
  onMonthClick?: (year: number, month: number) => void;
  now?: Date;
  weekStartVersion?: number;
}

export function Calendar({
  year,
  hasNote,
  onDayClick,
  onMonthClick,
  now,
  weekStartVersion,
}: CalendarProps) {
  const hasAutoScrolledRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [, setWeekStartVersion] = useState(0);
  const handleWeekStartChange = useCallback(() => {
    setWeekStartVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const container = calendarRef.current;
    if (!container) return;
    if (!window.matchMedia("(max-width: 768px)").matches) return;

    // Defer scroll until after layout, then enable snap
    const rafId = requestAnimationFrame(() => {
      const gridEl = gridRef.current;
      if (gridEl) {
        container.scrollTo(0, 0);

        if (!hasAutoScrolledRef.current) {
          hasAutoScrolledRef.current = true;
          const now = new Date();
          if (year === now.getFullYear() && now.getMonth() > 0) {
            const currentMonthEl = gridEl.querySelector(
              '[data-current-month="true"]',
            );
            if (currentMonthEl instanceof HTMLElement) {
              currentMonthEl.scrollIntoView({
                block: "start",
                behavior: "instant",
              });
            }
          }
        }
      }

      // Enable snap after scroll position is set
      requestAnimationFrame(() => {
        container.dataset.scrollSnap = "";
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (container) {
        delete container.dataset.scrollSnap;
      }
    };
  }, [year]);

  return (
    <div
      ref={calendarRef}
      className={styles.calendar}
      data-week-start-version={weekStartVersion}
    >
      <CalendarGrid
        year={year}
        hasNote={hasNote}
        onDayClick={onDayClick}
        onMonthClick={onMonthClick}
        onWeekStartChange={handleWeekStartChange}
        now={now}
        gridRef={gridRef}
      />
    </div>
  );
}
