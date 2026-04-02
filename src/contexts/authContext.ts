import { createContext, useContext } from "react";
import type { UseAuthReturn } from "../hooks/useAuth";

export const AuthContext = createContext<UseAuthReturn | null>(null);

export function useAuthContext(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
}
