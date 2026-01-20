import { DayCellState } from "../../types";
import { isPastEditAllowed } from "../../utils/noteRules";
import styles from "./DayCell.module.css";

interface DayCellProps {
  day: number | null;
  date?: Date;
  state: DayCellState;
  hasNote: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function DayCell({
  day,
  date,
  state,
  hasNote,
  selected = false,
  onClick,
}: DayCellProps) {
  if (day === null) {
    return <div className={`${styles.dayCell} ${styles.empty}`} />;
  }

  const isClickable =
    state === DayCellState.Today ||
    (state === DayCellState.Past && (hasNote || isPastEditAllowed()));

  // Create accessible label with full date
  const ariaLabel = date
    ? `${date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}${hasNote ? ", has note" : ""}`
    : undefined;

  return (
    <div
      className={[
        styles.dayCell,
        styles[state],
        isClickable && styles.clickable,
        selected && styles.selected,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? ariaLabel : undefined}
      aria-selected={selected ? "true" : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {day}
      {hasNote && <span className={styles.indicator} aria-hidden="true" />}
    </div>
  );
}
