export interface Note {
  date: string; // "DD-MM-YYYY"
  content: string;
  updatedAt: string; // ISO timestamp
}

export type ViewType = 'note' | 'calendar';

export interface UrlState {
  view: ViewType;
  date: string | null;
  year: number;
}

export type DayCellState = 'empty' | 'past' | 'today' | 'future';
