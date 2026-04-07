import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { AppBootstrap } from "./components/AppBootstrap";
import { THEME_KEY } from "./utils/constants";
import { preloadLocalDatabase } from "./storage/rxdb/database";
import "./index.css";

// Start opening the local RxDB database immediately so it's ready
// by the time the React tree mounts and subscribes to note data.
preloadLocalDatabase();

// Apply theme before first paint to prevent FOUC
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme === "dark" || savedTheme === "light") {
  document.documentElement.setAttribute("data-theme", savedTheme);
}

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Root element not found");
}

const ssgYear = Number(rootEl.dataset.ssgYear) || new Date().getFullYear();
const shouldHydrate = rootEl.dataset.ssgCalendar === "true";
const ssgToday = rootEl.dataset.ssgToday;
const now = (() => {
  if (!ssgToday) {
    return new Date();
  }
  const [year, month, day] = ssgToday.split("-").map(Number);
  if (!year || !month || !day) {
    return new Date();
  }
  return new Date(year, month - 1, day);
})();
const element = (
  <StrictMode>
    <AppBootstrap shouldHydrate={shouldHydrate} year={ssgYear} now={now} />
  </StrictMode>
);

if (shouldHydrate) {
  hydrateRoot(rootEl, element);
} else {
  createRoot(rootEl).render(element);
}
