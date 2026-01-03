import { DayCellState } from '../../types';

interface DayCellProps {
  day: number | null;
  date?: Date;
  state: DayCellState;
  hasNote: boolean;
  onClick?: () => void;
}

export function DayCell({ day, date, state, hasNote, onClick }: DayCellProps) {
  if (day === null) {
    return <div className="day-cell day-cell--empty" />;
  }

  const isClickable =
    state === DayCellState.Today ||
    (state === DayCellState.Past && hasNote);

  // Create accessible label with full date
  const ariaLabel = date ?
    `${date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${hasNote ? ', has note' : ''}` :
    undefined;

  return (
    <div
      className={`day-cell day-cell--${state}${isClickable ? ' day-cell--clickable' : ''}`}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? ariaLabel : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      } : undefined}
    >
      {day}
      {hasNote && <span className="day-cell__indicator" aria-hidden="true" />}
    </div>
  );
}
