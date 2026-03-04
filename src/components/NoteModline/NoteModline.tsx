import type { AiMeta } from "@/domain/ai/aiTypes";
import styles from "./NoteModline.module.css";

interface NoteModlineProps {
  aiMeta: AiMeta | undefined;
}

export function NoteModline({ aiMeta }: NoteModlineProps) {
  if (!aiMeta?.tags?.length) return null;

  return (
    <div className={styles.root}>
      <div className={styles.tags}>
        {aiMeta.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
