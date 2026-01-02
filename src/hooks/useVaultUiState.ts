import { useEffect, useReducer } from 'react';
import { AppMode } from './useAppMode';
import { AuthState } from '../types';

export type VaultUiState =
  | 'intro'
  | 'modeChoice'
  | 'localVault'
  | 'cloudAuth'
  | 'vaultError'
  | 'none';

interface VaultUiInputs {
  showIntro: boolean;
  isModeChoiceOpen: boolean;
  mode: AppMode;
  authState: AuthState;
  isSigningIn: boolean;
  isVaultReady: boolean;
  isVaultLocked: boolean;
  vaultError: string | null;
  localVaultReady: boolean;
  localRequiresPassword: boolean;
}

function deriveUiState(inputs: VaultUiInputs): VaultUiState {
  if (inputs.showIntro) return 'intro';
  if (inputs.isModeChoiceOpen) return 'modeChoice';
  if (
    inputs.mode === AppMode.Local &&
    inputs.isVaultLocked &&
    inputs.localVaultReady &&
    inputs.localRequiresPassword
  ) {
    return 'localVault';
  }
  if (
    inputs.mode === AppMode.Cloud &&
    (inputs.authState === AuthState.SignedOut ||
      inputs.authState === AuthState.AwaitingConfirmation ||
      inputs.isSigningIn)
  ) {
    return 'cloudAuth';
  }
  if (inputs.vaultError && inputs.isVaultReady) {
    return 'vaultError';
  }
  return 'none';
}

type VaultUiAction = { type: 'sync'; payload: VaultUiInputs };

function reducer(_state: VaultUiState, action: VaultUiAction): VaultUiState {
  switch (action.type) {
    case 'sync':
      return deriveUiState(action.payload);
    default:
      return 'none';
  }
}

export function useVaultUiState(inputs: VaultUiInputs): VaultUiState {
  const [state, dispatch] = useReducer(reducer, inputs, deriveUiState);

  useEffect(() => {
    dispatch({ type: 'sync', payload: inputs });
  }, [inputs]);

  return state;
}
