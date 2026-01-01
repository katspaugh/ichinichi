# DailyNotes

A minimalist daily notes application built with React and TypeScript. Write one note per day and view your entire year at a glance.

## Features

- **One Note Per Day**: Keep it simple with a single note for each day
- **Year View Calendar**: See your entire year in a beautiful, responsive calendar grid
- **Visual Indicators**: Days with notes show a small dot indicator
- **Read-Only Past**: View past notes but can only edit today's note
- **Local Storage**: All your notes are stored locally in your browser - no server, no tracking
- **Fully Responsive**: Works beautifully on desktop, tablet, and mobile
- **URL-Based Navigation**: Shareable URLs with year and date parameters
- **Keyboard Shortcuts**: Press Escape to close the note editor

## Demo

Visit the live demo: [Add your deployment URL here]

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **CSS Custom Properties** - Theming system
- **LocalStorage API** - Data persistence

## Getting Started

### Prerequisites

- Node.js 18+ or higher
- Yarn (recommended) or npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dailynotes.git
cd dailynotes
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

3. Your site will be live at `https://dailynotes.pages.dev`

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
│   └── noteStorage.ts          # LocalStorage abstraction
├── utils/
│   ├── date.ts                 # Date utilities
│   └── constants.ts            # App constants
└── styles/                     # CSS modules and themes
```

## Data Storage

Notes are stored in your browser's localStorage with the key format:
```
dailynote_{DD-MM-YYYY}
```

Each note contains:
- `date`: The note's date (DD-MM-YYYY)
- `content`: Your note text
- `updatedAt`: Last modification timestamp

**Note**: Clearing browser data will delete all notes. Consider using browser export/import features or the export functionality (if added) to backup your notes.

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

- **Minimalism**: Only essential features, no bloat
- **Local-First**: All data stays in your browser
- **Type Safety**: Full TypeScript coverage
- **Responsive**: Mobile-first design approach
- **Accessibility**: Semantic HTML and keyboard navigation

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project however you'd like.

## Acknowledgments

Built with modern web technologies and a focus on simplicity and user experience.

---

Made with care by Ivan
