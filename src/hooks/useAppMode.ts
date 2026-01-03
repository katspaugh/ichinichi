import { useCallback, useState } from 'react';
import { AuthState } from './useAuth';
import { AUTH_HAS_LOGGED_IN_KEY, STORAGE_PREFIX } from '../utils/constants';
import { useCloudPrompt } from './useCloudPrompt';
import { AppMode } from '../utils/appMode';

export { AppMode } from '../utils/appMode';

const CLOUD_PROMPT_KEY = `${STORAGE_PREFIX}cloud_prompted_v1`;

interface UseAppModeProps {
  authState: AuthState;
}

export interface UseAppModeReturn {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  isModeChoiceOpen: boolean;
  pendingModeChoice: boolean;
  requestModeChoice: () => void;
  openModeChoice: () => void;
  closeModeChoice: () => void;
  switchToCloud: () => void;
}

export function useAppMode({ authState }: UseAppModeProps): UseAppModeReturn {
  const [modePreference, setModePreference] = useState<AppMode | null>(null);
  const cloudPrompt = useCloudPrompt(CLOUD_PROMPT_KEY);
  const hasLoggedIn = typeof window !== 'undefined' &&
    localStorage.getItem(AUTH_HAS_LOGGED_IN_KEY) === '1';
  // If user has logged in before but isn't signed in now, prompt cloud auth
  const shouldPromptCloudAuth = hasLoggedIn && authState !== AuthState.SignedIn;
  const mode: AppMode = authState === AuthState.SignedIn
    ? AppMode.Cloud
    : (shouldPromptCloudAuth ? AppMode.Cloud : (modePreference ?? AppMode.Local));

  const setMode = useCallback((nextMode: AppMode) => {
    setModePreference(nextMode);
    if (nextMode === AppMode.Cloud) {
      cloudPrompt.close();
    }
  }, [cloudPrompt]);

  const requestModeChoice = useCallback(() => {
    cloudPrompt.request();
  }, [cloudPrompt]);

  const openModeChoice = useCallback(() => {
    cloudPrompt.open();
  }, [cloudPrompt]);

  const closeModeChoice = useCallback(() => {
    cloudPrompt.close();
  }, [cloudPrompt]);

  const switchToCloud = useCallback(() => {
    setMode(AppMode.Cloud);
  }, [setMode]);

  const isModeChoiceOpen = mode === AppMode.Cloud ? false : cloudPrompt.isOpen;

  return {
    mode,
    setMode,
    isModeChoiceOpen,
    pendingModeChoice: cloudPrompt.isPending,
    requestModeChoice,
    openModeChoice,
    closeModeChoice,
    switchToCloud
  };
}
