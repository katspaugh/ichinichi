import { type ReactNode, useMemo } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ServiceContext } from "./serviceContext";
import { createVaultService } from "../domain/vault";
import { createE2eeService } from "../services/e2eeService";

interface ServiceProviderProps {
  supabaseClient: SupabaseClient;
  children: ReactNode;
}

export function ServiceProvider({
  supabaseClient,
  children,
}: ServiceProviderProps) {
  const value = useMemo(
    () => ({
      supabase: supabaseClient,
      vaultService: createVaultService(supabaseClient),
      e2eeFactory: { create: createE2eeService },
    }),
    [supabaseClient],
  );

  return (
    <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>
  );
}
