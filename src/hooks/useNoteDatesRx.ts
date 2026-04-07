import { useState, useEffect } from "react";
import { useRxDB } from "./useRxDB";

export function useNoteDatesRx(year?: number): Set<string> {
  const db = useRxDB();
  const [dates, setDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    const subscription = db.notes
      .find({ selector: { isDeleted: { $eq: false } } })
      .$.subscribe((docs) => {
        const filtered = docs
          .map((doc) => doc.date)
          .filter((date) => year === undefined || date.endsWith(`-${year}`));
        setDates(new Set(filtered));
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, year]);

  return dates;
}
