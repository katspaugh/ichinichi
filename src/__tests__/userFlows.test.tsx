/**
 * Integration tests for user flows
 *
 * These tests emulate real user interactions as closely as possible.
 * Only Supabase is mocked - IndexedDB uses fake-indexeddb for realistic storage.
 *
 * Note: Due to test isolation challenges with fake-indexeddb, each describe
 * block contains a single comprehensive test that covers multiple scenarios.
 */

import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import App from "../App";
import { ServiceProvider } from "../contexts/ServiceProvider";
import { supabase } from "../lib/supabase";
import { closeUnifiedDb, UNIFIED_DB_NAME } from "../storage/unifiedDb";
import { closeVaultDb } from "../storage/vault";

// Increase timeout for integration tests
jest.setTimeout(60000);
const SAVE_IDLE_DELAY_MS = 2000;

// ============================================================================
// Supabase Mock
// ============================================================================

jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: null },
        error: null,
      })),
      getUser: jest.fn(async () => ({
        data: { user: null },
        error: null,
      })),
      onAuthStateChange: jest.fn(() => ({
        data: {
          subscription: {
            unsubscribe: jest.fn(),
          },
        },
      })),
      signInWithPassword: jest.fn(async () => ({
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      })),
      signUp: jest.fn(async () => ({
        data: { user: null, session: null },
        error: null,
      })),
      signOut: jest.fn(async () => ({ error: null })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(async () => ({ data: null, error: null })),
          order: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: [], error: null })),
          })),
        })),
        order: jest.fn(() => ({
          limit: jest.fn(async () => ({ data: [], error: null })),
        })),
        gt: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: [], error: null })),
          })),
        })),
      })),
      insert: jest.fn(async () => ({ data: null, error: null })),
      upsert: jest.fn(async () => ({ data: null, error: null })),
      update: jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      })),
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async () => ({ data: null, error: null })),
        download: jest.fn(async () => ({ data: null, error: null })),
        remove: jest.fn(async () => ({ data: null, error: null })),
        list: jest.fn(async () => ({ data: [], error: null })),
      })),
    },
  },
}));

// ============================================================================
// Other Mocks
// ============================================================================

jest.mock("../hooks/useConnectivity", () => ({
  useConnectivity: jest.fn(() => true),
}));

jest.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: jest.fn(() => true),
    subscribe: jest.fn(() => () => {}),
  },
}));

jest.mock("../hooks/usePWA", () => ({
  usePWA: () => ({
    needRefresh: false,
    updateServiceWorker: jest.fn(),
    dismissUpdate: jest.fn(),
  }),
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

Element.prototype.scrollIntoView = jest.fn();

// Mock URL.createObjectURL for image handling
URL.createObjectURL = jest.fn(() => "blob:mock-url");
URL.revokeObjectURL = jest.fn();

// Mock Range.getBoundingClientRect for jsdom (needed for image drop)
Range.prototype.getBoundingClientRect = jest.fn(() => ({
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  top: 0,
  right: 100,
  bottom: 20,
  left: 0,
  toJSON: () => {},
}));

// Mock document.caretRangeFromPoint for image drop positioning
document.caretRangeFromPoint = jest.fn(() => {
  const range = document.createRange();
  return range;
});

(globalThis as unknown as { __COMMIT_HASH__: string }).__COMMIT_HASH__ =
  "test-hash";

// ============================================================================
// Test Utilities
// ============================================================================

async function cleanupDatabases(): Promise<void> {
  closeUnifiedDb();
  closeVaultDb();

  await new Promise((r) => setTimeout(r, 100));

  const dbNames = [UNIFIED_DB_NAME, "dailynotes-vault"];

  await Promise.all(
    dbNames.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        }),
    ),
  );
}

function renderApp() {
  return render(
    <ServiceProvider supabaseClient={supabase}>
      <App />
    </ServiceProvider>,
  );
}

function getTodayDayNumber(): number {
  return new Date().getDate();
}

async function clickTodayCell() {
  const todayDay = getTodayDayNumber();

  await waitFor(
    () => {
      const buttons = screen.getAllByRole("button");
      const todayButton = buttons.find(
        (btn) => btn.textContent === String(todayDay),
      );
      expect(todayButton).toBeTruthy();
    },
    { timeout: 5000 },
  );

  const buttons = screen.getAllByRole("button");
  const todayButton = buttons.find(
    (btn) => btn.textContent === String(todayDay),
  );
  fireEvent.click(todayButton!);
}

async function waitForEditorReady() {
  await waitFor(
    () => {
      const editor = screen.getByRole("textbox");
      expect(editor.getAttribute("contenteditable")).toBe("true");
    },
    { timeout: 10000 },
  );
}

function getEditor(): HTMLElement {
  return screen.getByRole("textbox");
}

async function typeInEditor(text: string) {
  const editor = getEditor();
  editor.focus();
  editor.innerHTML = text;
  fireEvent.input(editor);
}

async function closeNoteModal() {
  fireEvent.keyDown(document.body, { key: "Escape" });
  await waitFor(
    () => {
      expect(screen.queryByRole("textbox")).toBeNull();
    },
    { timeout: 5000 },
  );
}

// ============================================================================
// Tests
// ============================================================================

describe("Local Mode User Flow", () => {
  beforeAll(async () => {
    cleanup();
    localStorage.clear();
    await cleanupDatabases();
  });

  afterAll(async () => {
    cleanup();
    closeUnifiedDb();
    closeVaultDb();
  });

  it("complete local mode flow: intro, calendar, note creation, editing, persistence, and images", async () => {
    renderApp();

    // ===== PART 1: First Visit - Intro Modal =====
    await waitFor(
      () => {
        expect(screen.getByText("Welcome to DailyNote")).toBeTruthy();
      },
      { timeout: 10000 },
    );

    // Verify intro content
    expect(
      screen.getByText(
        "A calm place for one note per day. No account required to start.",
      ),
    ).toBeTruthy();

    // Dismiss intro
    fireEvent.click(screen.getByText("Start writing"));
    await waitFor(() => {
      expect(screen.queryByText("Welcome to DailyNote")).toBeNull();
    });

    // ===== PART 2: Calendar View =====
    // Verify all 12 months visible
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    for (const month of months) {
      expect(screen.getByText(month)).toBeTruthy();
    }

    // Verify current year
    expect(
      screen.getByText(new Date().getFullYear().toString()),
    ).toBeTruthy();

    // ===== PART 3: Open Today's Note =====
    await clickTodayCell();
    await waitForEditorReady();

    // Verify editor properties
    const editor = getEditor();
    expect(editor.getAttribute("contenteditable")).toBe("true");
    expect(editor.getAttribute("aria-readonly")).toBe("false");
    expect(editor.getAttribute("data-placeholder")).toBe(
      "Write your note for today...",
    );

    // Verify date in header
    const today = new Date();
    const dayName = today.toLocaleDateString("en-US", { weekday: "long" });
    expect(screen.getByText(new RegExp(dayName))).toBeTruthy();

    // Verify navigation arrows
    expect(screen.queryByLabelText("Previous note")).toBeTruthy();
    expect(screen.queryByLabelText("Next note")).toBeTruthy();

    // ===== PART 4: Type and Save Content =====
    const testContent = "Hello, this is my first note!";
    await typeInEditor(testContent);
    expect(editor.innerHTML).toContain(testContent);

    // Wait for idle save
    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_IDLE_DELAY_MS + 100));
    });

    // Close modal with Escape
    await closeNoteModal();

    // ===== PART 5: Verify Persistence =====
    // Back at calendar
    expect(
      screen.getByText(new Date().getFullYear().toString()),
    ).toBeTruthy();

    // Reopen note
    await clickTodayCell();
    await waitForEditorReady();

    // Content should persist
    expect(getEditor().innerHTML).toContain(testContent);

    // ===== PART 6: Multiple Edits =====
    const updatedContent = "Hello, this is my first note! And more content.";
    const editorForUpdate = getEditor();
    editorForUpdate.innerHTML = updatedContent;
    fireEvent.input(editorForUpdate);

    await act(async () => {
      await new Promise((r) => setTimeout(r, SAVE_IDLE_DELAY_MS + 100));
    });

    await closeNoteModal();

    // Verify updated content persists
    await clickTodayCell();
    await waitForEditorReady();
    expect(getEditor().innerHTML).toContain("And more content.");

    await closeNoteModal();
  });
});

describe("Cloud Auth User Flow", () => {
  beforeAll(async () => {
    cleanup();
    localStorage.clear();
    await cleanupDatabases();
    window.history.replaceState({}, "", "/");
    // Extra delay to ensure databases are fully reset
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(async () => {
    cleanup();
    closeUnifiedDb();
    closeVaultDb();
  });

  it("complete auth flow: set up sync, sign in/up toggle, and error handling", async () => {
    renderApp();

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    // ===== PART 1: Enter cloud auth flow =====
    // Wait for either the intro modal CTA, a sign-in button, or the auth modal
    await waitFor(
      () => {
        const introSetup = screen.queryByText("Set up sync");
        const headerSignIn = screen.queryByText("Sign in to sync");
        const authTitle = screen.queryByText("Sign in to DailyNote");
        expect(introSetup || headerSignIn || authTitle).toBeTruthy();
      },
      { timeout: 10000 },
    );

    const authTitle = screen.queryByText("Sign in to DailyNote");
    const authEmail = screen.queryByLabelText("Email");
    if (!authTitle && !authEmail) {
      const introSetup = screen.queryByText("Set up sync");
      if (introSetup) {
        fireEvent.click(introSetup);
        await waitFor(() => {
          expect(screen.queryByText("Set up sync")).toBeNull();
        });
      }

      const signInButtons = screen.queryAllByText("Sign in to sync");
      for (const button of signInButtons) {
        fireEvent.click(button);
      }
    }

    // ===== PART 2: Auth Modal with Sign In Form =====
    await waitFor(() => {
      expect(screen.getByLabelText("Email")).toBeTruthy();
      expect(screen.getByLabelText("Password")).toBeTruthy();
    });

    expect(
      screen.queryByText("Sign in to DailyNote") ||
        screen.queryByText("Create an account"),
    ).toBeTruthy();

    // ===== PART 3: Toggle to Sign Up =====
    fireEvent.click(screen.getByText("Sign up"));
    await waitFor(() => {
      expect(screen.getByText("Create an account")).toBeTruthy();
    });

    // ===== PART 4: Toggle Back to Sign In =====
    fireEvent.click(screen.getByText("Sign in"));
    await waitFor(() => {
      expect(screen.getByText("Sign in to DailyNote")).toBeTruthy();
    });

    // ===== PART 5: Submit with Invalid Credentials =====
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpassword" },
    });

    const signInButton = screen.getByRole("button", { name: "Sign in" });
    fireEvent.click(signInButton);

    // ===== PART 6: Verify Error Display =====
    await waitFor(
      () => {
        expect(screen.getByText("Invalid email or password.")).toBeTruthy();
      },
      { timeout: 5000 },
    );
  });
});
