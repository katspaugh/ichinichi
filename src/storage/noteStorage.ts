import type { Note } from '../types';
import { STORAGE_PREFIX } from '../utils/constants';

function getKey(date: string): string {
  return `${STORAGE_PREFIX}${date}`;
}

export const noteStorage = {
  get(date: string): Note | null {
    try {
      const data = localStorage.getItem(getKey(date));
      if (!data) return null;
      return JSON.parse(data) as Note;
    } catch {
      return null;
    }
  },

  save(date: string, content: string): void {
    const note: Note = {
      date,
      content,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(getKey(date), JSON.stringify(note));
  },

  delete(date: string): void {
    localStorage.removeItem(getKey(date));
  },

  exists(date: string): boolean {
    const note = this.get(date);
    return note !== null && note.content.trim().length > 0;
  },

  getAllDates(): string[] {
    const dates: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) {
        const date = key.slice(STORAGE_PREFIX.length);
        const note = this.get(date);
        if (note && note.content.trim().length > 0) {
          dates.push(date);
        }
      }
    }
    return dates;
  }
};
