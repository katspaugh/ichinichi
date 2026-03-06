# Simplify Routes: Calendar + Day View

## Overview

Reduce app to 2 routes. Remove `?month` param, `ViewType.Note`, JS mobile detection. CSS-only responsive behavior.

## URL Scheme

| Route | URL | Desktop | Mobile |
|-------|-----|---------|--------|
| Calendar | `/` or `?year=YYYY` | Year-at-a-glance (12 months) | Scrollable months |
| Day | `?date=DD-MM-YYYY` | Month grid (from date) + editor split | Full-screen editor (grid hidden via CSS) |

## URL State Type

```typescript
interface UrlState {
  view: ViewType;        // "calendar" | "day"
  date: string | null;   // DD-MM-YYYY (present in day view)
  year: number;          // always present, derived from date or current year
}
```

Removed: `month`, `monthDate`, `ViewType.Note`.

## Navigation

- **No params:** localStorage last-view. "day" -> `?date=<today>`. "calendar" -> current year.
- **Year calendar -> click day:** `?date=DD-MM-YYYY`.
- **Year calendar -> click month name:** Latest note in that month. None -> inactive/no-op.
- **Day view -> month grid nav:** Prev/next month; date selection updates `?date`.
- **Day view mobile:** Month grid hidden via CSS. Full-screen editor.
- **Fallback:** `?month=YYYY-MM` -> redirect to calendar.

## Responsive: CSS Only

No JS mobile detection. Always render same component tree for day view (month grid + editor). CSS `display: none` at <=768px hides month grid on mobile.

## Removals

- `ViewType.Note` enum value
- `month`, `monthDate` from UrlState
- `?month` param handling (replaced with redirect fallback)
- `navigateToMonth()`, `navigateToMonthDate()` functions
- Auto-select logic in `useMonthViewState` (date always present)
- `window.matchMedia` / `isMobile` JS state in App.tsx

## Unchanged

- `<Calendar>` year grid rendering
- `<MonthView>` split layout CSS
- `<MonthGrid>`, `<DayCell>`, `<NoteEditor>`
- Mobile CSS breakpoints (768px)
- Theme, glassmorphism, responsive grid
