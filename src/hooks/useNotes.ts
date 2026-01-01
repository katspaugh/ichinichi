import { useState, useCallback, useEffect } from 'react';
import { noteStorage } from '../storage/noteStorage';

interface UseNotesReturn {
  content: string;
  setContent: (content: string) => void;
  hasNote: (date: string) => boolean;
  noteDates: Set<string>;
  refreshNoteDates: () => void;
}

export function useNotes(date: string | null): UseNotesReturn {
  const [content, setContentState] = useState('');
  const [noteDates, setNoteDates] = useState<Set<string>>(new Set());

  // Load note content when date changes
  useEffect(() => {
    if (date) {
      const note = noteStorage.get(date);
      setContentState(note?.content ?? '');
    } else {
      setContentState('');
    }
  }, [date]);

  // Load all note dates on mount
  useEffect(() => {
    refreshNoteDates();
  }, []);

  const refreshNoteDates = useCallback(() => {
    const dates = noteStorage.getAllDates();
    setNoteDates(new Set(dates));
  }, []);

  const setContent = useCallback((newContent: string) => {
    setContentState(newContent);
    if (date) {
      if (newContent.trim()) {
        noteStorage.save(date, newContent);
        setNoteDates(prev => new Set([...prev, date]));
      } else {
        noteStorage.delete(date);
        setNoteDates(prev => {
          const next = new Set(prev);
          next.delete(date);
          return next;
        });
      }
    }
  }, [date]);

  const hasNote = useCallback((checkDate: string): boolean => {
    return noteDates.has(checkDate);
  }, [noteDates]);

  return {
    content,
    setContent,
    hasNote,
    noteDates,
    refreshNoteDates
  };
}
