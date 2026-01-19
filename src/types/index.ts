export interface Note {
  date: string; // "DD-MM-YYYY"
  content: string;
  updatedAt: string; // ISO timestamp
}

// Encrypted envelope for storage/sync layers (ciphertext only, no plaintext)
export interface NoteEnvelope {
  date: string; // "DD-MM-YYYY"
  ciphertext: string;
  nonce: string;
  keyId: string;
  updatedAt: string; // ISO timestamp
  revision: number;
  serverUpdatedAt?: string | null;
  deleted?: boolean;
}

export interface SyncedNote extends Note {
  id?: string;
  revision: number;
  serverUpdatedAt?: string;
  deleted?: boolean;
}

export interface NoteImage {
  id: string; // UUID for the image
  noteDate: string; // DD-MM-YYYY format
  type: "background" | "inline"; // Where the image is used
  filename: string; // Original filename
  mimeType: string; // image/jpeg, image/png, etc.
  width: number; // Original dimensions for layout
  height: number;
  size: number; // File size in bytes
  createdAt: string; // ISO timestamp
}

// Encrypted envelope for image storage/sync (ciphertext + metadata)
export interface ImageEnvelope {
  id: string; // UUID for the image
  noteDate: string; // DD-MM-YYYY format
  type: "background" | "inline";
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  size: number; // File size in bytes
  createdAt: string; // ISO timestamp
  sha256: string;
  ciphertext: string;
  nonce: string;
  keyId: string;
  serverUpdatedAt?: string | null;
  deleted?: boolean;
  remotePath?: string | null;
}

export const AuthState = {
  Loading: "loading",
  SignedOut: "signed_out",
  SignedIn: "signed_in",
} as const;

export type AuthState = (typeof AuthState)[keyof typeof AuthState];

export const ViewType = {
  Note: "note",
  Calendar: "calendar",
} as const;

export type ViewType = (typeof ViewType)[keyof typeof ViewType];

export interface UrlState {
  view: ViewType;
  date: string | null;
  year: number;
  month: number | null; // null = year view, 0-11 = month view
  monthDate: string | null; // Selected date within month view (desktop split layout)
}

export const DayCellState = {
  Empty: "empty",
  Past: "past",
  Today: "today",
  Future: "future",
} as const;

export type DayCellState = (typeof DayCellState)[keyof typeof DayCellState];

export const SyncStatus = {
  Idle: "idle",
  Syncing: "syncing",
  Synced: "synced",
  Offline: "offline",
  Error: "error",
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];
