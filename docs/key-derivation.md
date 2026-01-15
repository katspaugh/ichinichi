# Key Derivation, KEK/DEK, and Unlock Flow

This document explains how key derivation works in this project, why password changes do not re-encrypt all notes, and how device unlock and Supabase tokens fit in.

## ELI5 overview

Think of your notes as a treasure chest:

- The **DEK** (Data Encryption Key) is the real key that locks/unlocks the chest (your notes).
- The **KEK** (Key Encryption Key) is a separate key used only to lock/unlock the DEK.
- Your **password** is used to derive the KEK. The password never encrypts notes directly.

Because notes are encrypted with the DEK, changing your password only changes how the DEK is wrapped. The notes themselves do not need to be re-encrypted.

## Where this lives in code

- KEK derivation, DEK wrapping/unwrapping: `src/storage/vault.ts`
- Cloud unlock flow: `src/hooks/useVault.ts`
- Supabase storage for wrapped DEKs: `src/storage/userKeyring.ts`
- Note encryption/decryption: `src/services/e2eeService.ts`, `src/storage/noteStorage.ts`

## Cloud mode flow (step-by-step)

### First sign-in

1. Generate a new random DEK (`generateDEK` in `src/storage/vault.ts`).
2. Derive a KEK from the password with PBKDF2 (`deriveKEK` in `src/storage/vault.ts`).
3. Wrap the DEK with the KEK (`wrapDEK` in `src/storage/vault.ts`).
4. Store the wrapped DEK plus KDF salt/iterations in Supabase (`saveUserKeys` in `src/storage/userKeys.ts`).

### Later sign-in

1. Fetch wrapped DEK and KDF params from Supabase (`fetchUserKeys` in `src/storage/userKeys.ts`).
2. Re-derive the KEK from the typed password + stored salt/iterations (`deriveKEK`).
3. Unwrap the DEK (`unwrapDEK`).
4. Use the DEK to encrypt/decrypt notes (`src/services/e2eeService.ts`, `src/storage/noteStorage.ts`).

## Why password changes do not re-encrypt notes

Notes are encrypted with the DEK, not the password. A password change only:

- derives a new KEK from the new password, and
- re-wraps the same DEK with that new KEK (`updatePasswordWrappedKey` in `src/storage/vault.ts`).

Since the DEK is unchanged, note ciphertext is unchanged.

## Device key and auto-unlock

To avoid typing the password on every visit, the DEK can be wrapped with a **device key**:

- The device key is a non-exportable CryptoKey stored in IndexedDB.
- The DEK is wrapped with the device key and stored locally (`storeDeviceWrappedDEK`).
- On sign-in, the app first tries to unwrap the DEK with the device key (`tryUnlockWithDeviceDEK`).

## Unified dataset keys (multi-key)

- The app can keep multiple DEKs (key_id) for notes/images.
- Local-only mode: the local DEK is device-wrapped and stored locally.
- Cloud mode: all locally known DEKs are wrapped with the password-derived KEK and stored in Supabase.
- Notes/images carry a key_id so they can be decrypted without re-encrypting data.
- This avoids re-encryption during sign-in; older data remains readable as long as its key is available.

### What if the device is cleared?

If browser data is cleared (IndexedDB/local storage wiped):

- The device key and device-wrapped DEK are deleted.
- Auto-unlock stops working.
- You must enter the password to re-derive the KEK and unwrap the DEK.
- No notes are lost because the wrapped DEK is still stored in Supabase.

## Supabase token vs password

A stored Supabase auth token only gives access to the database. It does not contain the password or KEK.

So with a valid token:

- The app can fetch the wrapped DEK from Supabase.
- The app still needs your password to derive the KEK and unwrap the DEK.
- The only exception is if the device key is present locally, which can unlock without a password.

## Practical summary

- **Stay logged in**: Supabase token lets you skip re-auth.
- **Skip typing password**: Only possible when this device has the device key + device-wrapped DEK.
- **New device or cleared storage**: Password is required to unlock the DEK.
