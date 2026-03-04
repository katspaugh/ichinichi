# Structured Sections

Inline typed sections within journal entries. User types `+dream`, hits Enter, gets a styled section. Sections are user-defined (any name), visually distinct, and extracted as tags for future search/filtering.

## Syntax & Trigger

- `+typename` at start of a line, matching `/^\+[a-z][a-z-]*$/`
- On Enter: transforms into a styled section header + empty body div
- Type names: lowercase letters and hyphens (e.g., `+dream`, `+book-notes`)

## HTML Representation

Section = exactly two elements: header + one body block.

```html
<div data-section-type="dream">+dream</div>
<div>I was flying over a city...<br>Buildings were made of glass.</div>
<div>Back to regular journaling.</div>
```

- Header: `<div data-section-type="typename">+typename</div>`
- Body: single `<div>` or `<p>` immediately after header. Line breaks via `<br>` (Shift+Enter).
- Enter creates a new block element, naturally ending the section (no longer adjacent to header).

## Visual Styling

Header (`[data-section-type]`):
- Bold/semi-bold text
- Soft colored background (label feel)
- Color derived from type name via string-to-hue hash

Body (`[data-section-type] + div, [data-section-type] + p`):
- Left border in same hue as header
- Left padding

CSS adjacent sibling selectors — no JS DOM walking needed.

## Transform Logic

In `useContentEditableEditor.ts`, on `keydown` (Enter):

1. Check if current block element text matches `/^\+[a-z][a-z-]*$/`
2. Prevent default Enter behavior
3. Replace block with `<div data-section-type="typename">+typename</div>`
4. Insert empty `<div><br></div>` after it, place cursor there

One-time operation, similar to timestamp HR insertion.

Edge cases:
- If user edits header text so it no longer matches `+typename`, revert to plain div (remove `data-section-type`).
- Deleting a header: normal contentEditable behavior, body becomes regular text.

## Metadata Extraction

On save, extract section types from HTML via regex: `data-section-type="([a-z][a-z-]*)"`.

Store unique types as `sectionTypes?: string[]` on the Note.

```typescript
interface Note {
  date: string;
  content: string;
  habits?: HabitValues;
  sectionTypes?: string[];  // extracted from content on save
  updatedAt: string;
}
```

Enables future: "show all days with a dream entry."

## DOMPurify

Add `data-section-type` to allowed attributes so section headers survive sanitization.
