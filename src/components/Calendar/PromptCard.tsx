import { useCallback, useMemo, useState } from "react";
import { getTodayString } from "../../utils/date";
import { getJournalingPrompt } from "../../utils/placeholderText";
import styles from "./PromptCard.module.css";

export function PromptCard() {
  const [salt, setSalt] = useState(0);
  const dateStr = getTodayString();
  const now = useMemo(() => new Date(), []);
  const prompt = getJournalingPrompt(dateStr, now, salt);

  const handleClick = useCallback(() => {
    setSalt((s) => s + 1);
  }, []);

  return (
    <button
      type="button"
      className={styles.promptCard}
      onClick={handleClick}
      title="Click for another prompt"
    >
      {prompt}
    </button>
  );
}
