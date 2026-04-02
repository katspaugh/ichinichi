import { useEffect, useState } from "react";
import { getNoteRecord } from "../storage/unifiedNoteStore";
import { useDebugMode } from "./useDebugMode";

export function useDebugNoteKeyId(
  date: string,
  isContentReady: boolean,
): string | null {
  const [isDebug] = useDebugMode();
  const [keyId, setKeyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isDebug) return;
    let cancelled = false;
    void getNoteRecord(date).then((record) => {
      if (!cancelled) setKeyId(record?.keyId ?? null);
    });
    return () => { cancelled = true; };
  }, [isDebug, date, isContentReady]);

  return isDebug ? keyId : null;
}
