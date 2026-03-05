export interface RemoteDateIndexPort {
  getDatesForYear(year: number): Promise<string[]>;
  setDatesForYear(year: number, dates: string[]): Promise<void>;
  hasDate(date: string): Promise<boolean>;
  deleteDate(date: string): Promise<void>;
}
