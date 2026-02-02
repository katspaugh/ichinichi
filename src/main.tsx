import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { AppBootstrap } from "./components/AppBootstrap";
import "./index.css";

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
