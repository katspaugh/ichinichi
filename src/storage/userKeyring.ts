import { SupabaseClient } from "@supabase/supabase-js";

export interface UserKeyringEntry {
  keyId: string;
  wrappedDek: string;
  dekIv: string;
  kdfSalt: string;
  kdfIterations: number;
  version: number;
  isPrimary: boolean;
}

interface UserKeyringRow {
  user_id: string;
  key_id: string;
  wrapped_dek: string;
  dek_iv: string;
  kdf_salt: string;
  kdf_iterations: number;
  version: number;
  is_primary: boolean;
}

export async function fetchUserKeyring(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserKeyringEntry[]> {
  const { data, error } = await supabase
    .from("user_keyrings")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => {
    const typed = row as UserKeyringRow;
    return {
      keyId: typed.key_id,
      wrappedDek: typed.wrapped_dek,
      dekIv: typed.dek_iv,
      kdfSalt: typed.kdf_salt,
      kdfIterations: typed.kdf_iterations,
      version: typed.version,
      isPrimary: typed.is_primary,
    };
  });
}

export async function saveUserKeyringEntry(
  supabase: SupabaseClient,
  userId: string,
  entry: UserKeyringEntry,
): Promise<void> {
  const { error } = await supabase.from("user_keyrings").upsert({
    user_id: userId,
    key_id: entry.keyId,
    wrapped_dek: entry.wrappedDek,
    dek_iv: entry.dekIv,
    kdf_salt: entry.kdfSalt,
    kdf_iterations: entry.kdfIterations,
    version: entry.version,
    is_primary: entry.isPrimary,
  });

  if (error) {
    throw error;
  }
}

export async function deleteUserKeyringEntry(
  supabase: SupabaseClient,
  userId: string,
  keyId: string,
): Promise<void> {
  const { error } = await supabase
    .from("user_keyrings")
    .delete()
    .eq("user_id", userId)
    .eq("key_id", keyId);

  if (error) {
    throw error;
  }
}
