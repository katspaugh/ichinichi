import { IntroModal } from "./IntroModal";
import { ModeChoiceModal } from "./ModeChoiceModal";
import { LocalVaultModal } from "./LocalVaultModal";
import { CloudAuthModal } from "./CloudAuthModal";
import { VaultErrorModal } from "./VaultErrorModal";
import type { AppMode } from "../../hooks/useAppMode";

interface AppModalsViewProps {
  introModal: {
    isOpen: boolean;
    onDismiss: () => void;
    onSetupSync: () => void;
  };
  modeChoiceModal: {
    isOpen: boolean;
    onConfirm: () => void;
    onDismiss: () => void;
  };
  localVaultModal: {
    isOpen: boolean;
    hasVault: boolean;
    isBusy: boolean;
    error: string | null;
    onUnlock: (password: string) => Promise<boolean>;
    onSwitchToCloud: () => void;
  };
  cloudAuthModal: {
    isOpen: boolean;
    isSigningIn: boolean;
    isVaultLocked: boolean;
    isBusy: boolean;
    error: string | null;
    localPassword: string | null;
    onDismiss: () => void;
    onSignIn: (email: string, password: string) => Promise<void>;
    onSignUp: (email: string, password: string) => Promise<void>;
    onVaultUnlock: (password: string) => void;
  };
  vaultErrorModal: {
    isOpen: boolean;
    error: string | null;
    mode: AppMode;
    onSignOut: () => Promise<void>;
    onDismiss: () => void;
  };
}

export function AppModalsView({
  introModal,
  modeChoiceModal,
  localVaultModal,
  cloudAuthModal,
  vaultErrorModal,
}: AppModalsViewProps) {
  return (
    <>
      <IntroModal
        isOpen={introModal.isOpen}
        onDismiss={introModal.onDismiss}
        onSetupSync={introModal.onSetupSync}
      />

      <ModeChoiceModal
        isOpen={modeChoiceModal.isOpen}
        onConfirm={modeChoiceModal.onConfirm}
        onDismiss={modeChoiceModal.onDismiss}
      />

      <LocalVaultModal
        isOpen={localVaultModal.isOpen}
        hasVault={localVaultModal.hasVault}
        isBusy={localVaultModal.isBusy}
        error={localVaultModal.error}
        onUnlock={localVaultModal.onUnlock}
        onSwitchToCloud={localVaultModal.onSwitchToCloud}
      />

      <CloudAuthModal
        isOpen={cloudAuthModal.isOpen}
        isSigningIn={cloudAuthModal.isSigningIn}
        isVaultLocked={cloudAuthModal.isVaultLocked}
        isBusy={cloudAuthModal.isBusy}
        error={cloudAuthModal.error}
        localPassword={cloudAuthModal.localPassword}
        onDismiss={cloudAuthModal.onDismiss}
        onSignIn={cloudAuthModal.onSignIn}
        onSignUp={cloudAuthModal.onSignUp}
        onVaultUnlock={cloudAuthModal.onVaultUnlock}
      />

      <VaultErrorModal
        isOpen={vaultErrorModal.isOpen}
        error={vaultErrorModal.error}
        mode={vaultErrorModal.mode}
        onSignOut={vaultErrorModal.onSignOut}
        onDismiss={vaultErrorModal.onDismiss}
      />
    </>
  );
}
