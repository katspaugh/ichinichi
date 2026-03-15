import { MiniCalendar } from "./MiniCalendar";
import { MiniEditor } from "./MiniEditor";
import styles from "./IntroPreview.module.css";

export function IntroPreview({ className }: { className?: string }) {
  return (
    <div className={`${styles.preview}${className ? ` ${className}` : ""}`}>
      <MiniCalendar />
      <MiniEditor />
    </div>
  );
}
