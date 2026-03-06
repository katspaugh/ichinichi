import { type ReactNode } from "react";
import { RoutingContext } from "./routingContext";
import type { RoutingState } from "../hooks/useUrlState";

interface RoutingProviderProps {
  value: RoutingState;
  children: ReactNode;
}

export function RoutingProvider({ value, children }: RoutingProviderProps) {
  return (
    <RoutingContext.Provider value={value}>
      {children}
    </RoutingContext.Provider>
  );
}
