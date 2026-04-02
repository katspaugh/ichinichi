# Ichinichi

A minimalist daily notes application designed to help you build and maintain a consistent writing habit. With end-to-end encryption and a focus on great UX, it's the perfect tool for personal reflection and daily journaling.

<img width="1406" height="1061" alt="Image" src="https://github.com/user-attachments/assets/2be66a84-b428-4a0f-b4f0-436893a0a33d" />
<img width="1491" height="1061" alt="Image" src="https://github.com/user-attachments/assets/5a884db8-5ebc-4ce6-b335-9dae7904fb35" />

## Why Ichinichi?

いちにち (_ichi nichi_) means _one day_ in Japanese.

### 📝 **Minimalist Design for Consistency**

- **One Note Per Day**: No complexity, no distractions—just write
- **Read-Only Past**: Protect your streak by preventing edits to previous days
- **Future Dates Disabled**: Focus on today, not tomorrow
- **Empty Note Auto-Delete**: If you write nothing, nothing is saved—keeping your calendar clean

### 🔐 **True End-to-End Encryption**

- **Client-Side Encryption**: Your notes are encrypted before they leave your device
- **Zero-Knowledge Architecture**: We can't read your notes, even if we wanted to
- **AES-GCM Encryption**: Industry-standard cryptographic protection
- **Password-Derived Keys**: Your login password protects your encryption key

### 🎯 **Exceptional User Experience**

- **Year-at-a-Glance**: Visual calendar shows your writing streak at a glance
- **Offline Reading**: Cached notes available offline after sign-in
- **Responsive Design**: Beautiful on desktop, tablet, and mobile
- **Keyboard Navigation**: Escape to close, arrows to navigate

## Features

- **Visual Indicators**: Days with notes show a small dot indicator
- **URL-Based Navigation**: Shareable URLs with year and date parameters
- **Auto-Save**: Your work is saved automatically as you type

## Demo

Visit the live demo: [Demo](https://ichinichi.app)

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **CSS Custom Properties** - Theming system
- **IndexedDB** - Offline cache
- **Supabase** - Backend (auth, storage, sync)

## Getting Started

### Prerequisites

- Node.js 18+ or higher
- Yarn (recommended) or npm

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/ichinichi.git
cd ichinichi
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

3. Your site will be live at `https://ichinichi.pages.dev`

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

### Privacy First

- **Your Thoughts, Your Business**: E2EE means your reflections stay private
- **Zero Knowledge**: Server stores only encrypted data it cannot read

## User Flow

1. Sign up or sign in to start writing.
2. Your encryption key is derived from your login password — no separate vault password.
3. Notes are encrypted client-side, synced to the cloud, and cached locally for offline reading.
4. Signing out clears all cached data from the device.

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
│   ├── cache.ts                # IndexedDB offline cache
│   ├── remoteNotes.ts          # Supabase gateway
│   ├── noteRepository.ts       # Unified note repository
│   └── imageRepository.ts      # Image encryption + storage
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

- **PBKDF2 Key Derivation**: Login password → KEK (600k iterations)
- **Wrapped DEK**: Single data encryption key, wrapped with KEK, stored in Supabase
- **Password Change**: Re-wraps the same DEK with new password — no re-encryption of notes

### Data Storage

- Notes are encrypted client-side with AES-GCM and stored in Supabase
- An IndexedDB cache (`ichinichi-cache`) keeps encrypted notes for offline reading
- Signing out clears the cache entirely
- Clearing browser data only loses the cache; notes remain safe in the cloud

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
