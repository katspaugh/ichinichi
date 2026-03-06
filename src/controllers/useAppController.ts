import { useUrlState } from "../hooks/useUrlState";
import { useAuth } from "../hooks/useAuth";
import { useAppMode } from "../hooks/useAppMode";
import { useActiveVault } from "../hooks/useActiveVault";
import { useNoteRepository } from "../hooks/useNoteRepository";

export function useAppController() {
  const auth = useAuth();
  const appMode = useAppMode({ authState: auth.authState });
  const routing = useUrlState({
    authState: auth.authState,
    mode: appMode.mode,
  });
  const { date, year } = routing;
  const activeNoteDate = date;

  const activeVault = useActiveVault({
    auth,
    mode: appMode.mode,
    setMode: appMode.setMode,
  });
  const notes = useNoteRepository({
    mode: appMode.mode,
    authUser: auth.user,
    vaultKey: activeVault.vaultKey,
    keyring: activeVault.keyring,
    activeKeyId: activeVault.activeKeyId,
    date: activeNoteDate,
    year,
  });

  return {
    routing,
    auth,
    appMode,
    activeVault,
    notes,
  };
}
