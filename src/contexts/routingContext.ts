import { createContext, useContext } from "react";
import type { RoutingState } from "../hooks/useUrlState";

const RoutingContext = createContext<RoutingState | null>(null);

export function useRoutingContext(): RoutingState {
  const context = useContext(RoutingContext);
  if (!context) {
    throw new Error("useRoutingContext must be used within RoutingProvider");
  }
  return context;
}

export { RoutingContext };
