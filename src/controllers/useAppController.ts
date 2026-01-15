import { useUrlState } from "../hooks/useUrlState";
import { useAuth } from "../hooks/useAuth";
import { useAppMode } from "../hooks/useAppMode";
import { useActiveVault } from "../hooks/useActiveVault";
import { useNoteRepository } from "../hooks/useNoteRepository";
import { supabase } from "../lib/supabase";

export function useAppController() {
  const auth = useAuth();
  const appMode = useAppMode({ authState: auth.authState });
  const urlState = useUrlState({
    authState: auth.authState,
    mode: appMode.mode,
  });
  const { date, year } = urlState;
  const activeVault = useActiveVault({
    auth,
    mode: appMode.mode,
    setMode: appMode.setMode,
    supabaseClient: supabase,
  });
  const notes = useNoteRepository({
    mode: appMode.mode,
    authUser: auth.user,
    supabaseClient: supabase,
    vaultKey: activeVault.vaultKey,
    keyring: activeVault.keyring,
    activeKeyId: activeVault.activeKeyId,
    date,
    year,
  });

  return {
    urlState,
    auth,
    appMode,
    activeVault,
    notes,
  };
}
