import { useUrlState } from "../hooks/useUrlState";
import { useAuthContext } from "../contexts/authContext";
import { useNoteRepository } from "../hooks/useNoteRepository";

export function useAppController() {
  const auth = useAuthContext();
  const routing = useUrlState({ authState: auth.authState });
  const { date, year } = routing;

  const notes = useNoteRepository({
    userId: auth.user?.id ?? null,
    dek: auth.dek,
    keyId: auth.keyId,
    date,
    year,
  });

  return { routing, auth, notes };
}
