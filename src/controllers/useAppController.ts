import { useUrlState } from '../hooks/useUrlState';
import { useAuth } from '../hooks/useAuth';
import { useAppMode } from '../hooks/useAppMode';
import { useActiveVault } from '../hooks/useActiveVault';
import { useNoteRepository } from '../hooks/useNoteRepository';

export function useAppController() {
  const urlState = useUrlState();
  const { date, year } = urlState;
  const auth = useAuth();
  const appMode = useAppMode({ authState: auth.authState });
  const activeVault = useActiveVault({
    auth,
    mode: appMode.mode,
    setMode: appMode.setMode
  });
  const notes = useNoteRepository({
    mode: appMode.mode,
    authUser: auth.user,
    vaultKey: activeVault.vaultKey,
    keyring: activeVault.keyring,
    activeKeyId: activeVault.activeKeyId,
    date,
    year
  });

  return {
    urlState,
    auth,
    appMode,
    activeVault,
    notes
  };
}
