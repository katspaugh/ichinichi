import type { DayCellState } from '../../types';

interface DayCellProps {
  day: number | null;
  state: DayCellState;
  hasNote: boolean;
  onClick?: () => void;
}

export function DayCell({ day, state, hasNote, onClick }: DayCellProps) {
  if (day === null) {
    return <div className="day-cell day-cell--empty" />;
  }

  const isClickable = state === 'past' || state === 'today';

  return (
    <div
      className={`day-cell day-cell--${state}`}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
    >
      {day}
      {hasNote && <span className="day-cell__indicator" />}
    </div>
  );
}
