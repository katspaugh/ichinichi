import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "../App";
import { ServiceProvider } from "../contexts/ServiceProvider";
import { supabase } from "../lib/supabase";

// Mock Supabase client
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
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
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

// Mock connectivity
jest.mock("../hooks/useConnectivity", () => ({
  useConnectivity: jest.fn(() => true),
}));

// Mock connectivity service
jest.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: jest.fn(() => true),
    subscribe: jest.fn(() => () => {}),
  },
}));

// Mock PWA hook
jest.mock("../hooks/usePWA", () => ({
  usePWA: () => ({
    needRefresh: false,
    updateServiceWorker: jest.fn(),
    dismissUpdate: jest.fn(),
  }),
}));

// Mock window.matchMedia
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

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Set __COMMIT_HASH__ global
(globalThis as unknown as { __COMMIT_HASH__: string }).__COMMIT_HASH__ =
  "test-hash";

describe("App initial render", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
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
