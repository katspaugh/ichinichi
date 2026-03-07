// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "../App";
import { ServiceProvider } from "../contexts/ServiceProvider";
import { supabase } from "../lib/supabase";

// Mock Supabase client
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: null },
        error: null,
      })),
      getUser: vi.fn(async () => ({
        data: { user: null },
        error: null,
      })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
          order: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [], error: null })),
          })),
        })),
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
      insert: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn(async () => ({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async () => ({ data: null, error: null })),
        download: vi.fn(async () => ({ data: null, error: null })),
        remove: vi.fn(async () => ({ data: null, error: null })),
        list: vi.fn(async () => ({ data: [], error: null })),
      })),
    },
  },
}));

// Mock connectivity
vi.mock("../hooks/useConnectivity", () => ({
  useConnectivity: vi.fn(() => true),
}));

// Mock connectivity service
vi.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: vi.fn(() => true),
    subscribe: vi.fn(() => () => {}),
  },
}));

// Mock PWA hook
vi.mock("../hooks/usePWA", () => ({
  usePWA: () => ({
    needRefresh: false,
    updateServiceWorker: vi.fn(),
    dismissUpdate: vi.fn(),
  }),
}));

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Set __COMMIT_HASH__ global
(globalThis as unknown as { __COMMIT_HASH__: string }).__COMMIT_HASH__ =
  "test-hash";

describe("App initial render", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders without crashing", async () => {
    const { container } = render(
      <ServiceProvider supabaseClient={supabase}>
        <App />
      </ServiceProvider>,
    );

    await waitFor(() => expect(supabase.auth.getSession).toHaveBeenCalled());

    // App should render something
    expect(container.firstChild).not.toBeNull();
  });

  it("renders the current year", async () => {
    render(
      <ServiceProvider supabaseClient={supabase}>
        <App />
      </ServiceProvider>,
    );

    const currentYear = new Date().getFullYear().toString();

    await waitFor(
      () => {
        expect(screen.getByText(currentYear)).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it("renders month names in the calendar", async () => {
    render(
      <ServiceProvider supabaseClient={supabase}>
        <App />
      </ServiceProvider>,
    );

    await waitFor(
      () => {
        // At least one month should be visible
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
        const foundMonth = months.some((month) => {
          try {
            return screen.getByText(month) !== null;
          } catch {
            return false;
          }
        });
        expect(foundMonth).toBe(true);
      },
      { timeout: 3000 },
    );
  });

  it("clicking on today's cell opens an editable editor", async () => {
    render(
      <ServiceProvider supabaseClient={supabase}>
        <App />
      </ServiceProvider>,
    );

    // First, dismiss the intro modal by clicking "Maybe later"
    await waitFor(
      () => {
        expect(screen.getByText("Maybe later")).toBeTruthy();
      },
      { timeout: 3000 },
    );
    fireEvent.click(screen.getByText("Maybe later"));

    // Wait for vault to be unlocked (needed to click on day cells)
    await waitFor(
      () => {
        const root = document.documentElement;
        expect(root.dataset.vaultUnlocked).toBe("true");
      },
      { timeout: 5000 },
    );

    // Get today's date
    const today = new Date();
    const todayDay = today.getDate();

    // Wait for the calendar to render and find today's cell
    // Today's cell has role="button" and contains the day number
    await waitFor(
      () => {
        // Find all buttons in the calendar (clickable day cells)
        const buttons = screen.getAllByRole("button");
        // Find the one that contains today's day number
        const todayButton = buttons.find((btn) => {
          const text = btn.textContent;
          return text === String(todayDay);
        });
        expect(todayButton).toBeTruthy();
      },
      { timeout: 3000 },
    );

    // Find and click today's cell
    const buttons = screen.getAllByRole("button");
    const todayButton = buttons.find(
      (btn) => btn.textContent === String(todayDay),
    );
    expect(todayButton).toBeTruthy();

    fireEvent.click(todayButton!);

    // Wait for the editor to appear and become editable
    await waitFor(
      () => {
        const textboxes = screen.getAllByRole("textbox");
        const editor = textboxes.find(
          (el) => el.getAttribute("contenteditable") === "true",
        );
        expect(editor).toBeTruthy();
      },
      { timeout: 5000 },
    );

    // Verify the editor is editable
    const textboxes = screen.getAllByRole("textbox");
    const editor = textboxes.find(
      (el) => el.getAttribute("contenteditable") === "true",
    )!;
    expect(editor.getAttribute("contenteditable")).toBe("true");
    expect(editor.getAttribute("aria-readonly")).toBe("false");
  });
});
