import { createContext, useContext, createElement, type ReactNode } from "react";
import type { AppDatabase } from "../storage/rxdb/database";

const RxDBContext = createContext<AppDatabase | null>(null);

interface RxDBProviderProps {
  db: AppDatabase;
  children: ReactNode;
}

export function RxDBProvider({ db, children }: RxDBProviderProps) {
  return createElement(RxDBContext.Provider, { value: db }, children);
}

export function useRxDB(): AppDatabase {
  const db = useContext(RxDBContext);
  if (!db) {
    throw new Error("useRxDB must be used within an RxDBProvider");
  }
  return db;
}
