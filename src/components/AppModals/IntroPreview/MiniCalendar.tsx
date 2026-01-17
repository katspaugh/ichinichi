import { useMemo } from "react";
import styles from "./IntroPreview.module.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MiniCalendar() {
  const today = useMemo(() => new Date(), []);

  const { monthName, year, days } = useMemo(() => {
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const todayDate = today.getDate();

    // Get first day of month and total days
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const totalDays = lastDay.getDate();

    // Monday-based weekday (0=Mon, 6=Sun)
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    // Generate seeded random activity pattern for past days (~60%)
    const seed = currentYear * 12 + currentMonth;
    const hasActivity = (day: number) => {
      // Simple seeded pseudo-random
      const x = Math.sin(seed * 9999 + day * 7) * 10000;
      return (x - Math.floor(x)) < 0.6;
    };

    const daysList: Array<{
      day: number | null;
      isToday: boolean;
      isPast: boolean;
      isFuture: boolean;
      hasNote: boolean;
    }> = [];

    // Empty cells before first day
    for (let i = 0; i < startWeekday; i++) {
      daysList.push({ day: null, isToday: false, isPast: false, isFuture: false, hasNote: false });
    }

    // Days of month
    for (let d = 1; d <= totalDays; d++) {
      const isToday = d === todayDate;
      const isPast = d < todayDate;
      const isFuture = d > todayDate;
      const hasNote = isPast && hasActivity(d);

      daysList.push({ day: d, isToday, isPast, isFuture, hasNote });
    }

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return {
      monthName: monthNames[currentMonth],
      year: currentYear,
      days: daysList,
    };
  }, [today]);

  return (
    <div className={styles.miniCalendar}>
      <div className={styles.calendarHeader}>
        {monthName} {year}
      </div>
      <div className={styles.weekdayRow}>
        {WEEKDAYS.map((wd) => (
          <div key={wd} className={styles.weekday}>
            {wd.charAt(0)}
          </div>
        ))}
      </div>
      <div className={styles.daysGrid}>
        {days.map((item, idx) => (
          <div
            key={idx}
            className={`${styles.dayCell} ${
              item.day === null
                ? styles.emptyDay
                : item.isToday
                ? styles.todayDay
                : item.isFuture
                ? styles.futureDay
                : styles.pastDay
            }`}
          >
            {item.day}
            {item.hasNote && <span className={styles.indicator} />}
          </div>
        ))}
      </div>
    </div>
  );
}
