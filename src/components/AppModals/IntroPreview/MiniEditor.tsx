import { useMemo } from "react";
import styles from "./IntroPreview.module.css";

export function MiniEditor() {
  const formattedDate = useMemo(() => {
    const today = new Date();
    return today.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, []);

  const mod = useMemo(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    return isMac ? "Cmd" : "Ctrl";
  }, []);

  return (
    <div className={styles.miniEditor}>
      <div className={styles.editorHeader}>
        <span className={styles.editorDate}>{formattedDate}</span>
      </div>
      <div className={styles.editorContent}>
        <p>One note per day. Simple and calm.</p>
        <hr data-timestamp="true" data-label="2:30 PM" />
        <p>
          Format with <strong>{mod}+B</strong>, <em>{mod}+I</em>,{" "}
          <u>{mod}+U</u>, <s>{mod}+Shift+X</s>
        </p>
        <p>
          <strong>
            <em>
              <u>Happy journaling!</u>
            </em>
          </strong>
        </p>
      </div>
    </div>
  );
}
