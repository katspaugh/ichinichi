# Daily Notes - Project Documentation

## Overview

A minimalist daily notes application built with React, TypeScript, and Vite. The app allows users to write notes for today and view past notes in a year-view calendar interface.

## Core Concepts

- **One note per day**: Each day can have one text note
- **Today-only editing**: Users can only edit today's note; past notes are read-only
- **Future dates disabled**: Future dates cannot be clicked or edited
- **Local storage**: All notes are stored in browser localStorage
- **URL-based navigation**: App state (year, date, view) is managed through URL parameters

## Tech Stack

- React 18
- TypeScript
- Vite
- CSS Custom Properties (theming)

## Project Structure

```
src/
├── components/
│   ├── Button.tsx              # Reusable button component
│   ├── Modal.tsx               # Modal backdrop and container
│   ├── Calendar/
│   │   ├── Calendar.tsx        # Year view with month grids
│   │   ├── MonthGrid.tsx       # Individual month display
│   │   └── DayCell.tsx         # Individual day cell
│   └── NoteEditor/
│       └── NoteEditor.tsx      # Note editing interface
├── hooks/
│   ├── useNotes.ts             # Note CRUD operations
│   └── useUrlState.ts          # URL state management
├── storage/
│   └── noteStorage.ts          # localStorage abstraction
├── utils/
│   ├── date.ts                 # Date formatting and utilities
│   └── constants.ts            # App constants
├── styles/
│   ├── reset.css               # CSS reset
│   ├── theme.css               # CSS custom properties
│   └── components.css          # Component styles
├── types/
│   └── index.ts                # TypeScript types
├── App.tsx                     # Root component
└── main.tsx                    # App entry point
```

## Key Components

### Calendar (src/components/Calendar/Calendar.tsx)
- Displays the full year view
- Renders 12 month grids in a responsive grid (4 columns → 3 → 2 → 1)
- Handles year navigation
- Responsive height (100vh with min-height 800px)

### Modal (src/components/Modal.tsx)
- Fullscreen on mobile, centered with margins on desktop
- Closes on Escape key or backdrop click
- Prevents body scroll when open

### NoteEditor (src/components/NoteEditor/NoteEditor.tsx)
- Displays note content for selected date
- Auto-focuses textarea for today's note
- Shows "Read only" badge for past dates
- Prevents editing of past and future notes

### DayCell (src/components/Calendar/DayCell.tsx)
- Three states: past, today, future
- Visual indicator for days with notes
- Only past and today are clickable

## Data Flow

1. **URL State**: `useUrlState` hook manages view, year, and date from URL params
2. **Note Loading**: `useNotes` hook loads/saves notes from localStorage
3. **Calendar Display**: Calendar shows indicator dots for days with notes
4. **Note Editing**: Modal opens with NoteEditor when day is clicked

## Storage Format

Notes are stored in localStorage with the key format:
```
dailynote_{DD-MM-YYYY}
```

Each note is a JSON object:
```json
{
  "date": "01-01-2024",
  "content": "Note content...",
  "updatedAt": "2024-01-01T12:00:00.000Z"
}
```

## Date Utilities (src/utils/date.ts)

- `formatDate(date)`: Date → DD-MM-YYYY
- `parseDate(dateStr)`: DD-MM-YYYY → Date
- `getTodayString()`: Current date as DD-MM-YYYY
- `formatDateDisplay(dateStr)`: Display format (e.g., "Monday, January 1, 2024")
- `getDayCellState(date)`: Returns 'past', 'today', or 'future'
- `isToday(dateStr)`: Check if date is today
- `isFuture(dateStr)`: Check if date is in the future

## Responsive Design

### Breakpoints
- Desktop: > 1200px (4 columns)
- Tablet: 900-1200px (3 columns)
- Small tablet: 600-900px (2 columns)
- Mobile: < 600px (1 column)

### Mobile Optimizations
- Calendar grid switches to single column
- Modal becomes fullscreen
- Reduced spacing between elements

### Desktop Optimizations
- 10px vertical margins on modal
- Wider layout with more columns
- Larger spacing between elements

## Styling Architecture

The app uses CSS Custom Properties for theming, defined in `src/styles/theme.css`:

- **Colors**: Primary, text, background, surface colors
- **Spacing**: Consistent spacing scale (xs, sm, md, lg, xl)
- **Typography**: Font sizes and weights
- **Effects**: Shadows, borders, transitions

## User Experience

1. App loads showing current year's calendar
2. Days with notes show a small dot indicator
3. Clicking a past day or today opens the note editor modal
4. Future dates are not clickable (default cursor)
5. Today's note is editable; past notes are read-only
6. Modal closes via Escape key, backdrop click, or close button
7. Notes auto-save to localStorage on every change

## Recent Updates

### UX Improvements (2026-01-01)
- Modal is now fullscreen on mobile (< 768px)
- Added 10px vertical margins to modal on desktop
- Year view now fits 100vh with min-height of 800px
- Responsive spacing between month/day cells based on screen size
- Changed future date cursor from `not-allowed` to `default`
