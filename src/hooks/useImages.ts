import { useMemo } from "react";
import { createImageRepository, type ImageRepository } from "../storage/imageRepository";
import { supabase } from "../lib/supabase";
import { connectivity } from "../services/connectivity";

interface UseImagesProps {
  userId: string | null;
  dek: CryptoKey | null;
  keyId: string | null;
}

export function useImages({ userId, dek, keyId }: UseImagesProps): ImageRepository | null {
  return useMemo(() => {
    if (!userId || !dek || !keyId) return null;
    return createImageRepository({ dek, keyId, supabase, userId, connectivity });
  }, [userId, dek, keyId]);
}
