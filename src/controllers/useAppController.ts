import { useUrlState } from '../hooks/useUrlState';
import { useAuth } from '../hooks/useAuth';
import { useAppMode } from '../hooks/useAppMode';
import { useActiveVault } from '../hooks/useActiveVault';
import { useNoteRepository } from '../hooks/useNoteRepository';

export function useAppController() {
  const auth = useAuth();
  const urlState = useUrlState({ authState: auth.authState });
  const { date, year } = urlState;
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
