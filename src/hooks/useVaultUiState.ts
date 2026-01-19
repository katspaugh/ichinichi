import { useEffect } from "react";
import { useMachine } from "@xstate/react";
import { assign, setup } from "xstate";
import { AppMode } from "./useAppMode";
import { AuthState } from "../types";

export type VaultUiState =
  | "intro"
  | "modeChoice"
  | "localVault"
  | "cloudAuth"
  | "vaultError"
  | "none";

interface VaultUiInputs {
  showIntro: boolean;
  isModeChoiceOpen: boolean;
  mode: AppMode;
  authState: AuthState;
  isSigningIn: boolean;
  isVaultReady: boolean;
  isVaultLocked: boolean;
  isVaultBusy: boolean;
  vaultError: string | null;
  localVaultReady: boolean;
  localRequiresPassword: boolean;
}

function deriveUiState(inputs: VaultUiInputs): VaultUiState {
  if (inputs.showIntro) return "intro";
  if (inputs.isModeChoiceOpen) return "modeChoice";
  if (
    inputs.mode === AppMode.Local &&
    inputs.isVaultLocked &&
    inputs.localVaultReady &&
    inputs.localRequiresPassword
  ) {
    return "localVault";
  }
  if (inputs.mode === AppMode.Cloud) {
    // Show auth modal when not signed in or still signing in
    if (
      inputs.authState === AuthState.SignedOut ||
      inputs.authState === AuthState.Loading ||
      inputs.isSigningIn
    ) {
      return "cloudAuth";
    }
    // Show vault unlock when signed in but vault is locked (and not currently unlocking)
    if (
      inputs.authState === AuthState.SignedIn &&
      inputs.isVaultLocked &&
      inputs.isVaultReady &&
      !inputs.isVaultBusy
    ) {
      return "cloudAuth";
    }
  }
  if (inputs.vaultError && inputs.isVaultReady) {
    return "vaultError";
  }
  return "none";
}

type VaultUiEvent = { type: "SYNC"; payload: VaultUiInputs };

interface VaultUiContext {
  value: VaultUiState;
}

export const vaultUiMachine = setup({
  types: {
    context: {} as VaultUiContext,
    events: {} as VaultUiEvent,
  },
  actions: {
    applyInputs: assign((args: { event: VaultUiEvent }) => {
      const { event } = args;
      if (event.type !== "SYNC") {
        return {};
      }
      return { value: deriveUiState(event.payload) };
    }),
  },
}).createMachine({
  id: "vaultUi",
  initial: "idle",
  context: {
    value: "none",
  },
  states: {
    idle: {
      on: {
        SYNC: {
          actions: "applyInputs",
        },
      },
    },
  },
});

export function useVaultUiState(inputs: VaultUiInputs): VaultUiState {
  const [state, send] = useMachine(vaultUiMachine);

  useEffect(() => {
    send({ type: "SYNC", payload: inputs });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Spread individual properties to avoid infinite loop from object reference changes
  }, [
    send,
    inputs.showIntro,
    inputs.isModeChoiceOpen,
    inputs.mode,
    inputs.authState,
    inputs.isSigningIn,
    inputs.isVaultReady,
    inputs.isVaultLocked,
    inputs.isVaultBusy,
    inputs.vaultError,
    inputs.localVaultReady,
    inputs.localRequiresPassword,
  ]);

  return state.context.value;
}
