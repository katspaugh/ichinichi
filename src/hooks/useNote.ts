import { useState, useEffect } from "react";
import { useRxDB } from "./useRxDB";
import type { Note } from "../types";

interface UseNoteResult {
  note: Note | null;
  loading: boolean;
}

export function useNote(date: string): UseNoteResult {
  const db = useRxDB();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscription = db.notes.findOne(date).$.subscribe((doc) => {
      if (!doc || doc.isDeleted) {
        setNote(null);
      } else {
        setNote({
          date: doc.date,
          content: doc.content,
          updatedAt: doc.updatedAt,
          weather: doc.weather ?? undefined,
        });
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, date]);

  return { note, loading };
}
