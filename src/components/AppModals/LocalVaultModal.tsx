import { Modal } from "../Modal";
import { VaultUnlock } from "../VaultUnlock";

interface LocalVaultModalProps {
  isOpen: boolean;
  hasVault: boolean;
  isBusy: boolean;
  error: string | null;
  onUnlock: (password: string) => Promise<boolean>;
  onSwitchToCloud: () => void;
}

export function LocalVaultModal({
  isOpen,
  hasVault,
  isBusy,
  error,
  onUnlock,
  onSwitchToCloud,
}: LocalVaultModalProps) {
  if (hasVault) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={() => {}} isDismissable={false}>
      <VaultUnlock
        mode={hasVault ? "unlock" : "setup"}
        isBusy={isBusy}
        error={error}
        onUnlock={onUnlock}
        onSwitchToCloud={onSwitchToCloud}
      />
    </Modal>
  );
}
