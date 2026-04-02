# Ichinichi macOS Notarization & Distribution Guide

Guide for building, signing, notarizing, and publishing Ichinichi as a `.dmg` for direct distribution (outside the Mac App Store).

## Prerequisites (one-time setup)

### 1. Install Xcode CLI tools

```bash
xcode-select --install
```

### 2. Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Restart your terminal after installation.

### 3. Install Node.js

Download and install Node.js v18+ from https://nodejs.org

### 4. Create a "Developer ID Application" certificate

1. Go to https://developer.apple.com and sign in
2. Navigate to **Certificates, Identifiers & Profiles** > **Certificates**
3. Click **+** and choose **Developer ID Application**
4. Open **Keychain Access** on your Mac
5. Go to **Keychain Access** > **Certificate Assistant** > **Request a Certificate From a Certificate Authority**
6. Fill in your email, select **Saved to disk**, and save the CSR file
7. Upload the CSR on the Apple Developer portal
8. Download the generated certificate and double-click to install it

### 5. Create an app-specific password

1. Go to https://appleid.apple.com
2. Navigate to **Sign-In and Security** > **App-Specific Passwords**
3. Generate a new password and save it somewhere safe

### 6. Find your Team ID

Go to https://developer.apple.com > **Membership** > **Team ID** (10-character alphanumeric string).

### 7. Find your signing identity name

Run this in Terminal:

```bash
security find-identity -v -p codesigning
```

Copy the full string in quotes, e.g. `Developer ID Application: John Smith (ABC1234567)`.

## Build, Sign, Notarize

```bash
# 1. Clone the repository
git clone https://github.com/katspaugh/ichinichi.git
cd ichinichi

# 2. Install dependencies
npm install

# 3. Set environment variables (replace with your values)
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="your-app-specific-password"
export APPLE_TEAM_ID="XXXXXXXXXX"

# 4. Build, sign, and notarize (Tauri handles all three automatically)
npx tauri build
```

The signed and notarized `.dmg` will be at:

```
src-tauri/target/release/bundle/dmg/Ichinichi_1.0.0_aarch64.dmg
```

(File name varies by architecture: `aarch64` for Apple Silicon, `x64` for Intel.)

## Publish on GitHub Releases

1. Go to https://github.com/katspaugh/ichinichi/releases
2. Click **Draft a new release**
3. Create a new tag, e.g. `v1.0.0`
4. Upload the `.dmg` file from the previous step
5. Click **Publish release**

## Troubleshooting

### `npm install` fails

The project uses Yarn v4. Use Yarn instead:

```bash
corepack enable
yarn install
yarn tauri:build
```

### Notarization fails with "invalid credentials"

Double-check that:
- `APPLE_ID` is the email associated with your Apple Developer account
- `APPLE_PASSWORD` is the **app-specific password**, not your Apple ID password
- `APPLE_TEAM_ID` matches the Team ID from the Developer portal

### "No identity found" error

Your Developer ID certificate may not be installed. Re-download it from the Apple Developer portal and double-click to install into Keychain.
