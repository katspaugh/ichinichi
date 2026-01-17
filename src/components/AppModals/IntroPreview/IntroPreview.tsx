import { MiniCalendar } from "./MiniCalendar";
import { MiniEditor } from "./MiniEditor";
import styles from "./IntroPreview.module.css";

export function IntroPreview() {
  return (
    <div className={styles.preview}>
      <MiniCalendar />
      <MiniEditor />
    </div>
  );
}
