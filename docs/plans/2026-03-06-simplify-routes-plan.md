# Simplify Routes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce app to 2 routes (calendar + day view), remove JS mobile detection, CSS-only responsive.

**Architecture:** Custom URL state (`urlState.ts`) drives two views: calendar (`/` or `?year=YYYY`) and day (`?date=DD-MM-YYYY`). Month is derived from date. Same component tree rendered for both desktop/mobile; CSS hides month grid on mobile.

**Tech Stack:** React 18, TypeScript, CSS modules, Vite, Jest

---

### Task 1: Update types — remove ViewType.Note, month, monthDate from UrlState

**Files:**
- Modify: `src/types/index.ts:67-80`

**Step 1: Update ViewType and UrlState**

Change `ViewType` to use `"day"` instead of `"note"`:

```typescript
export const ViewType = {
  Day: "day",
  Calendar: "calendar",
} as const;
```

Remove `month` and `monthDate` from `UrlState`:

```typescript
export interface UrlState {
  view: ViewType;
  date: string | null;
  year: number;
}
```

**Step 2: Run typecheck to see all broken references**

Run: `npm run typecheck 2>&1 | head -80`
Expected: Many type errors across files that reference `ViewType.Note`, `month`, `monthDate`. This is expected — we'll fix them in subsequent tasks.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: simplify UrlState — remove ViewType.Note, month, monthDate"
```

---

### Task 2: Rewrite urlState.ts — new resolve/serialize logic

**Files:**
- Modify: `src/utils/urlState.ts`
- Modify: `src/utils/constants.ts:15-19`

**Step 1: Update constants — remove MONTH param**

In `src/utils/constants.ts`, change `URL_PARAMS` to:

```typescript
export const URL_PARAMS = {
  DATE: "date",
  YEAR: "year",
} as const;
```

**Step 2: Rewrite urlState.ts**

Replace `ViewPreference` type: `"year" | "month"` → `"year" | "day"`.

`getViewPreference`: return `"day"` when stored value is `"month"` or `"day"` (backward compat).

`resolveUrlState`:
- `?share-target` → `ViewType.Day` with today, canonical `?date=<today>`
- `?date=DD-MM-YYYY` (valid, not future) → `ViewType.Day` with that date, year derived
- `?date=<invalid or future>` → `ViewType.Day` with today, `needsRedirect: true`
- `?month=YYYY-MM` (legacy fallback) → `ViewType.Calendar` with year from month param, `needsRedirect: true`, canonical `?year=YYYY`
- `?year=YYYY` → `ViewType.Calendar`
- No params → check localStorage. `"day"` → redirect to `?date=<today>`. Else → calendar with current year.

Remove all `month` and `monthDate` from returned states.

`serializeUrlState`:
- `ViewType.Day` with date → `?date=DD-MM-YYYY`
- `ViewType.Calendar` → `?year=YYYY`
- Fallback → `/`

**Step 3: Run typecheck on just this file**

Run: `npx tsc --noEmit 2>&1 | grep urlState`
Expected: Errors in other files referencing removed fields, but `urlState.ts` itself should be clean.

**Step 4: Commit**

```bash
git add src/utils/urlState.ts src/utils/constants.ts
git commit -m "refactor: rewrite urlState for 2-route scheme (calendar + day)"
```

---

### Task 3: Update urlState tests

**Files:**
- Modify: `src/__tests__/urlState.test.ts`

**Step 1: Rewrite tests**

Replace the entire test file to match the new routing logic:

- `getViewPreference` / `setViewPreference`: Test `"year"` default, `"day"` stored, backward compat for `"month"` → `"day"`.
- `resolveUrlState`:
  - `?date=01-01-2020` → `ViewType.Day`, date `01-01-2020`, year 2020
  - `?date=01-01-2099` (future) → redirect to today
  - `?date=not-a-date` → redirect to today
  - `?year=2023` → `ViewType.Calendar`, year 2023, date null
  - `?year=abc` → fallback to current year
  - `?month=2024-06` (legacy) → redirect to `ViewType.Calendar` with year 2024
  - No params, pref `"year"` → `ViewType.Calendar`, current year, no redirect
  - No params, pref `"day"` → `ViewType.Day`, today, redirect
- `serializeUrlState`:
  - Day view with date → `?date=DD-MM-YYYY`
  - Calendar view → `?year=YYYY`
  - Day view no date → `/`
- Round-trips for `?date=...` and `?year=...`
- Remove all tests referencing `month`, `monthDate`, `ViewType.Note`

**Step 2: Run tests**

Run: `npx jest urlState.test --no-coverage`
Expected: All pass.

**Step 3: Commit**

```bash
git add src/__tests__/urlState.test.ts
git commit -m "test: update urlState tests for 2-route scheme"
```

---

### Task 4: Rewrite useUrlState hook

**Files:**
- Modify: `src/hooks/useUrlState.ts`

**Step 1: Simplify the hook**

Key changes:
- Remove `month`, `monthDate` from all state objects
- Replace `ViewType.Note` → `ViewType.Day`
- Remove `lastCalendarRef` (no month context to remember)
- `navigateToDate`: set `ViewType.Day` (was `ViewType.Note`), derive year from date. Call `setViewPreference("day")`.
- `navigateToCalendar`: set `ViewType.Calendar`. Call `setViewPreference("year")`.
- `navigateToYear`: set `ViewType.Calendar` with specific year. Call `setViewPreference("year")`.
- Remove `navigateToMonth` entirely
- Remove `navigateToMonthDate` entirely
- `navigateBackToCalendar`: navigate to calendar with `stateRef.current.year`
- `startWriting`: dismiss intro, navigateToDate(today)
- Auth gating: if gated and `view === ViewType.Day`, force calendar

Return object should NOT include `navigateToMonth` or `navigateToMonthDate`.

**Step 2: Run typecheck**

Run: `npx tsc --noEmit 2>&1 | head -60`
Expected: Errors in App.tsx, useAppController, useAppModalsController, etc. referencing removed fields/functions.

**Step 3: Commit**

```bash
git add src/hooks/useUrlState.ts
git commit -m "refactor: simplify useUrlState — remove month navigation"
```

---

### Task 5: Update useAppController

**Files:**
- Modify: `src/controllers/useAppController.ts`

**Step 1: Simplify activeNoteDate**

Remove the `date ?? monthDate` logic. The active note date is just `date`:

```typescript
const { date, year } = urlState;
const activeNoteDate = date;
```

Remove `monthDate` destructuring.

**Step 2: Commit**

```bash
git add src/controllers/useAppController.ts
git commit -m "refactor: simplify useAppController — remove monthDate"
```

---

### Task 6: Update useAppModalsController

**Files:**
- Modify: `src/controllers/useAppModalsController.ts`

**Step 1: Replace ViewType.Note with ViewType.Day**

Line 102: `view === ViewType.Note` → `view === ViewType.Day`

That's the only change needed in this file.

**Step 2: Commit**

```bash
git add src/controllers/useAppModalsController.ts
git commit -m "refactor: use ViewType.Day in useAppModalsController"
```

---

### Task 7: Simplify useMonthViewState

**Files:**
- Modify: `src/hooks/useMonthViewState.ts`

**Step 1: Remove auto-select, derive month from date**

The hook should now:
- Accept `date: string` (always present when this hook is used) instead of `year`, `month`, `monthDate`
- Derive year/month from the date
- Remove the auto-select `useEffect` (date is always present)
- Keep: `notesInMonth`, `selectPreviousNote`, `selectNextNote`, `canSelectPrevious`, `canSelectNext`
- Change `navigateToMonthDate` param → `navigateToDate`
- Remove `enabled` param (always active in day view)

New interface:

```typescript
interface UseMonthViewStateProps {
  date: string;
  noteDates: Set<string>;
  navigateToDate: (date: string) => void;
}
```

The `getNotesInMonth` helper stays. Derive year/month from `parseDate(date)`.

Navigation functions (`selectPreviousNote`, `selectNextNote`) call `navigateToDate` instead of `navigateToMonthDate`.

**Step 2: Commit**

```bash
git add src/hooks/useMonthViewState.ts
git commit -m "refactor: simplify useMonthViewState — derive month from date"
```

---

### Task 8: Update MonthView component

**Files:**
- Modify: `src/components/Calendar/MonthView.tsx`

**Step 1: Update props and internal logic**

- Replace `monthDate: string | null` → use `date` from URL (received as a prop, always present)
- Derive `month` from `date` using `parseDate`
- `onDayClick` calls `navigateToDate` (not `navigateToMonthDate`)
- Remove `month` from props (derive from `date`)
- `onMonthChange` needs rethinking: when user clicks prev/next month in header, we need to pick the latest note in that month, or the 1st of the month if no notes. The caller (App.tsx) will handle this — see Task 9.

New MonthView props:
```typescript
interface MonthViewProps {
  date: string;
  noteDates: Set<string>;
  hasNote: (date: string) => boolean;
  onDayClick: (date: string) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (year: number, month: number) => void;
  onReturnToYear: () => void;
  // Editor props (same as before)
  content: string;
  onChange: (content: string) => void;
  hasEdits: boolean;
  isSaving: boolean;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
  noteError?: Error | null;
  // Sync props (same as before)
  syncStatus?: SyncStatus;
  syncError?: string | null;
  pendingOps?: PendingOpsSummary;
  onMenuClick?: () => void;
  onSignIn?: () => void;
  onSyncClick?: () => void;
  now?: Date;
  weekStartVersion?: number;
}
```

Derive `year` and `month` from `parseDate(date)` inside the component.

Pass derived `month` to `CalendarHeader` and `MonthViewLayout`.

**Step 2: Commit**

```bash
git add src/components/Calendar/MonthView.tsx
git commit -m "refactor: MonthView derives month from date prop"
```

---

### Task 9: Rewrite App.tsx — remove isMobile, simplify render

**Files:**
- Modify: `src/App.tsx`

**Step 1: Remove isMobile state and matchMedia effect**

Delete the `useState`/`useEffect` for `isMobile` (lines 29-38).

**Step 2: Simplify render logic**

New decision tree:
```typescript
const isDayView = urlState.date !== null;
```

If `isDayView`:
- Render `<MonthView>` (always — CSS handles mobile hiding of grid)
- Pass `date={urlState.date}` (guaranteed non-null)
- Pass `onDayClick={navigateToDate}`

Else:
- Render `<Calendar>` (year view)
- `onDayClick={navigateToDate}` (always navigates to day view)
- `onMonthClick`: find latest note in clicked month, if found `navigateToDate(latestNote)`, else no-op

**Step 3: Update useMonthViewState call**

Remove the old call. In the day view branch, `useMonthViewState` is now called inside `MonthView` or here with simplified props:

```typescript
useMonthViewState({
  date: urlState.date!, // non-null in day view
  noteDates: notes.noteDates,
  navigateToDate,
});
```

Call it unconditionally (but only use results in day view). Or call it inside MonthView. The simplest is to move it into MonthView.

**Step 4: Handle month name click in calendar**

Add a handler for `onMonthClick` on `<Calendar>`:

```typescript
const handleMonthClick = useCallback(
  (year: number, month: number) => {
    // Find latest note in this month
    const notesInMonth: string[] = [];
    for (const dateStr of notes.noteDates) {
      const parsed = parseDate(dateStr);
      if (parsed && parsed.getFullYear() === year && parsed.getMonth() === month) {
        notesInMonth.push(dateStr);
      }
    }
    if (notesInMonth.length === 0) return; // no-op
    notesInMonth.sort((a, b) => {
      const da = parseDate(a)!.getTime();
      const db = parseDate(b)!.getTime();
      return da - db;
    });
    navigateToDate(notesInMonth[notesInMonth.length - 1]);
  },
  [notes.noteDates, navigateToDate],
);
```

Pass to Calendar: `onMonthClick={activeVault.isVaultUnlocked ? handleMonthClick : undefined}`

**Step 5: Handle month change in day view**

When user clicks prev/next month in the day view header, we need to navigate to the latest note in that month (or today if current month). Add a `handleMonthChange` callback:

```typescript
const handleMonthChange = useCallback(
  (year: number, month: number) => {
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    if (isCurrentMonth) {
      navigateToDate(getTodayString());
      return;
    }
    // Find latest note in target month
    const notesInMonth: string[] = [];
    for (const dateStr of notes.noteDates) {
      const parsed = parseDate(dateStr);
      if (parsed && parsed.getFullYear() === year && parsed.getMonth() === month) {
        notesInMonth.push(dateStr);
      }
    }
    if (notesInMonth.length === 0) return; // no-op, stay on current date
    notesInMonth.sort((a, b) => parseDate(a)!.getTime() - parseDate(b)!.getTime());
    navigateToDate(notesInMonth[notesInMonth.length - 1]);
  },
  [notes.noteDates, navigateToDate],
);
```

**Step 6: Remove handleMonthChange (old), handleReturnToYear simplification**

- Remove old `handleMonthChange` that called `navigateToMonth`
- `handleReturnToYear` now just calls `navigateToCalendar(year)` where `year` is derived from current state

**Step 7: Remove unused imports**

Remove imports for `navigateToMonth`, `navigateToMonthDate`, `month`, `monthDate` from urlState destructuring.

**Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: App.tsx — remove isMobile, simplify to 2-route render"
```

---

### Task 10: Update Calendar component — remove month prop

**Files:**
- Modify: `src/components/Calendar/Calendar.tsx`
- Modify: `src/components/Calendar/CalendarGrid.tsx`
- Modify: `src/components/Calendar/CalendarHeader.tsx`

**Step 1: Calendar.tsx**

Remove `month` prop (Calendar is now always year view). Remove `onMonthChange` and `onReturnToYear` props. Add `onMonthClick` prop for month name navigation.

Pass `month={null}` to `CalendarHeader` (or remove month-related logic from header since Calendar is always year view).

The auto-scroll effect in Calendar has `window.matchMedia("(max-width: 768px)").matches` — this is a **read-only check** (not state), so it's fine to keep. It only runs once per year change to decide whether to auto-scroll.

**Step 2: CalendarGrid.tsx**

Remove `month` prop. Always render all 12 months. Remove `data-month-view` attribute.

**Step 3: CalendarHeader.tsx**

When rendered from Calendar (year view), `month` is always null, so the month navigation branch in the header is never hit from Calendar. But MonthView still uses CalendarHeader with a month. Keep the header as-is — it handles both cases based on `month` prop.

**Step 4: Commit**

```bash
git add src/components/Calendar/Calendar.tsx src/components/Calendar/CalendarGrid.tsx src/components/Calendar/CalendarHeader.tsx
git commit -m "refactor: Calendar component — always year view, add onMonthClick"
```

---

### Task 11: Move useMonthViewState into MonthView

**Files:**
- Modify: `src/components/Calendar/MonthView.tsx`

**Step 1: Call useMonthViewState inside MonthView**

Import and call `useMonthViewState` inside `MonthView` component. It's already receiving `date`, `noteDates`, and the navigation function. Wire the prev/next note navigation from the hook into `MonthViewLayout`.

Remove the `useMonthViewState` call from App.tsx if it's still there.

**Step 2: Commit**

```bash
git add src/components/Calendar/MonthView.tsx src/App.tsx
git commit -m "refactor: move useMonthViewState into MonthView"
```

---

### Task 12: Update tests

**Files:**
- Modify: `src/__tests__/appRenders.test.tsx`
- Modify: `src/__tests__/userFlows.test.tsx`

**Step 1: Update appRenders.test.tsx**

The "clicking on today's cell opens an editable editor" test clicks a day cell and expects an editor. With the new routing, clicking a day in year view navigates to day view (`?date=...`), which renders `<MonthView>` with an editor. The test should still pass conceptually. But verify: the test currently finds the editor via `contenteditable`. The MonthView renders the editor in the split layout. The test's `matchMedia` mock returns `false` (desktop), so MonthView will render with the grid visible.

Remove the `matchMedia` mock if no longer needed for rendering decisions (but keep it because `Calendar` still reads it for auto-scroll, and CSS modules may reference it).

**Step 2: Update userFlows.test.tsx**

The `returnToYearView` helper clicks "Return to year view" button. This button is in CalendarHeader when `month !== null`. In the new routing, when in day view, the header shows month navigation with a "Return to year view" button. Should still work.

The `clickTodayCell` flow should still work — it clicks a day cell, which now navigates to `?date=<today>` instead of going to month view.

Run the full test suite to verify.

**Step 3: Run all tests**

Run: `npm test -- --no-coverage`
Expected: All 627+ tests pass (or close — fix any failures).

**Step 4: Commit**

```bash
git add src/__tests__/appRenders.test.tsx src/__tests__/userFlows.test.tsx
git commit -m "test: update integration tests for 2-route scheme"
```

---

### Task 13: Final typecheck and cleanup

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

**Step 2: Run full test suite**

Run: `npm test -- --no-coverage`
Expected: All pass.

**Step 3: Search for dead code**

Run: `rg "ViewType\.Note|navigateToMonth|navigateToMonthDate|monthDate|isMobile" src/ --type ts --type tsx`

Remove any remaining references.

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: remove dead code references from route simplification"
```
