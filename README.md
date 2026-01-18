# DailyNote

A minimalist daily notes application designed to help you build and maintain a consistent writing habit. With end-to-end encryption and a focus on great UX, it's the perfect tool for personal reflection and daily journaling.

<img width="1051" height="881" alt="Image" src="https://github.com/user-attachments/assets/edc0b6d1-dc11-4760-9457-d438140182e6" />

## Why DailyNote?

### 📝 **Minimalist Design for Consistency**

- **One Note Per Day**: No complexity, no distractions—just write
- **Read-Only Past**: Protect your streak by preventing edits to previous days
- **Future Dates Disabled**: Focus on today, not tomorrow
- **Empty Note Auto-Delete**: If you write nothing, nothing is saved—keeping your calendar clean

### 🔐 **True End-to-End Encryption**

- **Client-Side Encryption**: Your notes are encrypted before they leave your device
- **Zero-Knowledge Architecture**: We can't read your notes, even if we wanted to
- **AES-GCM Encryption**: Industry-standard cryptographic protection
- **Device & Cloud Keys**: Multi-key support ensures your data is always secure

### 🎯 **Exceptional User Experience**

- **Instant Start**: Write immediately—no account required
- **Year-at-a-Glance**: Visual calendar shows your writing streak at a glance
- **Seamless Sync**: Works offline, syncs when online
- **Responsive Design**: Beautiful on desktop, tablet, and mobile
- **Keyboard Navigation**: Escape to close, arrows to navigate

## Features

- **Local-First**: Notes live locally by default with optional cloud sync
- **Visual Indicators**: Days with notes show a small dot indicator
- **URL-Based Navigation**: Shareable URLs with year and date parameters
- **Auto-Save**: Your work is saved automatically as you type

## Demo

Visit the live demo: [Demo](dailynote.xyz)

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **CSS Custom Properties** - Theming system
- **IndexedDB** - Local persistence
- **Supabase** - Optional sync backend

## Getting Started

### Prerequisites

- Node.js 18+ or higher
- Yarn (recommended) or npm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/dailynote.git
cd dailynote
```

2. Install dependencies:

```bash
yarn install
# or
npm install
```

3. Start the development server:

```bash
yarn dev
# or
npm run dev
```

4. Open [http://localhost:5173](http://localhost:5173) in your browser

## Building for Production

Build the optimized production bundle:

```bash
yarn build
# or
npm run build
```

Preview the production build locally:

```bash
yarn preview
# or
npm run preview
```

## Deployment

### Cloudflare Workers & Pages (Recommended)

This project includes Wrangler configuration for deployment to Cloudflare's new Workers & Pages platform:

**Method 1: Direct Deployment with Wrangler CLI**

1. Login to Cloudflare:

   ```bash
   yarn wrangler login
   ```

2. Deploy your site:

   ```bash
   yarn deploy
   # or
   yarn cf:deploy
   ```

3. Your site will be live at `https://dailynote.pages.dev`

**Method 2: Git Integration (Legacy Pages Tab)**

1. Push your code to GitHub
2. Go to Cloudflare Dashboard → Workers & Pages
3. Click "Create application" → Select "Pages" tab
4. Connect your GitHub repository
5. Use these build settings:
   - **Build command**: `yarn build`
   - **Build output directory**: `dist`

**Note**: Cloudflare deprecated standalone Pages in April 2025. Workers with Static Assets is now the recommended approach, which this project is configured for via `wrangler.toml`.

### Local Preview with Cloudflare

Test your production build locally with Cloudflare's runtime:

```bash
yarn build
yarn cf:dev
```

### Other Platforms

This is a standard Vite + React app and can be deployed to:

- Vercel
- Netlify
- GitHub Pages
- Any static hosting service

## Usage

### Writing Notes

1. The app opens to the current year's calendar view
2. Click on today's date (highlighted) to open the note editor
3. Write your note - it auto-saves as you type
4. Press Escape or click outside the modal to close

### Viewing Past Notes

1. Days with notes show a small dot indicator
2. Click any past date to view its note (read-only)
3. Future dates are not clickable

### Navigating Years

- Use the left/right arrow buttons to move between years
- Click the year button to jump back to the current year

## How It Helps Your Streak

### Built for Consistency

- **No Overwhelm**: One note per day means no decision fatigue
- **Protected Past**: Can't edit yesterday's note, so you focus on today
- **Visual Progress**: See your writing streak grow throughout the year
- **Frictionless**: Start writing in seconds, no setup required

### Privacy First

- **Your Thoughts, Your Business**: E2EE means your reflections stay private
- **Local by Default**: Your data lives on your device until you choose otherwise
- **Optional Sync**: Use it locally forever, or sync when you're ready

## User Flow

1. Open the app and start writing immediately (local mode by default).
2. After your first note, you can choose to sign in and sync, or keep using it locally.
3. Signing in creates a cloud account and migrates your existing local notes.
4. You can keep working offline; sync catches up when you are back online.

## Project Structure

```
src/
├── components/
│   ├── Button.tsx              # Reusable button component
│   ├── Modal.tsx               # Modal container
│   ├── Calendar/               # Year view calendar components
│   └── NoteEditor/             # Note editing interface
├── hooks/
│   ├── useNotes.ts             # Note CRUD operations
│   └── useUrlState.ts          # URL state management
├── storage/
│   ├── noteStorage.ts          # Local encrypted notes
│   └── vault.ts                # Key management
├── utils/
│   ├── date.ts                 # Date utilities
│   └── constants.ts            # App constants
└── styles/                     # CSS modules and themes
```

## Security & Privacy

### End-to-End Encryption (E2EE)

Your notes are encrypted with **AES-GCM** before they ever leave your device. This means:

- **Zero-Knowledge**: We can't read your notes, even if we wanted to
- **Client-Side Only**: Encryption happens in your browser, not on our servers
- **Industry Standard**: Using the same cryptographic primitives as major messaging apps

### Key Management

- **Local Mode**: Device-bound keys auto-unlock seamlessly
- **Cloud Mode**: Password-derived keys with secure key wrapping
- **Multi-Key Support**: Notes work across devices without re-encryption

### Data Storage

For a deeper explanation of the key hierarchy and unlock flow, see `docs/key-derivation.md`.
For the data flow across local storage and cloud sync, see `docs/data-flow.md`.

#### Local mode (default)

- A device-bound vault key is created on first load without prompting.
- Notes are encrypted with AES-GCM and stored in IndexedDB.
- The vault can auto-unlock using a non-exportable device key stored in IndexedDB.

#### Cloud mode (optional)

- When you sign in, a password-derived key wraps the same vault key.
- Notes are encrypted client-side before syncing to Supabase.
- A local encrypted cache is kept for offline use and conflict resolution.

#### Data durability

- Clearing browser data deletes local notes and local keys.
- Cloud sync acts as a backup once you sign in.

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Any modern browser with ES2020 support

## Development

### Code Style

This project uses:

- ESLint for code linting
- TypeScript strict mode
- Consistent code formatting

Run the linter:

```bash
yarn lint
# or
npm run lint
```

### Architecture Principles

- **Minimalism**: Only essential features, no bloat—designed for daily use
- **Privacy First**: End-to-end encryption by default, not an afterthought
- **Local-First**: All data stays in your browser until you choose otherwise
- **Type Safety**: Full TypeScript coverage for reliability
- **Responsive**: Mobile-first design approach
- **Accessibility**: Semantic HTML and keyboard navigation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project however you'd like.

## Acknowledgments

Built with modern web technologies and a focus on simplicity and user experience.

---

Made with care by katspaugh
