import { useState, useEffect } from "react";
import { useRxDB } from "./useRxDB";
import type { NoteImage } from "../types";

export function useNoteImagesRx(noteDate: string): NoteImage[] {
  const db = useRxDB();
  const [images, setImages] = useState<NoteImage[]>([]);

  useEffect(() => {
    const subscription = db.images
      .find({ selector: { noteDate: { $eq: noteDate }, isDeleted: { $eq: false } } })
      .$.subscribe((docs) => {
        setImages(
          docs.map((doc) => ({
            id: doc.id,
            noteDate: doc.noteDate,
            type: doc.type,
            filename: doc.filename,
            mimeType: doc.mimeType,
            width: doc.width,
            height: doc.height,
            size: doc.size,
            createdAt: doc.createdAt,
          })),
        );
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [db, noteDate]);

  return images;
}
