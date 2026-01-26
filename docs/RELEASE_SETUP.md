# Release & Auto-Update Setup

This guide explains how to set up automatic releases and updates for Mux using a separate public releases repository.

## Architecture

```
Private Repo (AlexMartosP/mux)          Public Repo (AlexMartosP/mux-releases)
┌─────────────────────────────┐         ┌─────────────────────────────┐
│  Source code (private)      │         │  Release assets only        │
│  Push tag v0.2.0            │         │  - Mux_aarch64.dmg          │
│         │                   │         │  - Mux_x64.dmg              │
│         ▼                   │         │  - Mux.app.tar.gz           │
│  GitHub Actions builds      │────────▶│  - latest.json              │
│  and publishes to ──────────│         │                             │
└─────────────────────────────┘         └─────────────────────────────┘
                                                     │
                                                     ▼
                                        App fetches latest.json
                                        Downloads update if available
```

## 1. Create Public Releases Repository

1. Go to GitHub → New Repository
2. Name: `mux-releases`
3. **Make it PUBLIC** (required for auto-updates to work without auth)
4. No need to initialize with README

## 2. Generate Signing Keys

Tauri requires signed updates. Generate a key pair:

```bash
# Install tauri-cli if not already installed
cargo install tauri-cli

# Generate signing keys
cargo tauri signer generate -w ~/.tauri/mux.key
```

This creates:
- `~/.tauri/mux.key` - Private key (keep secret!)
- `~/.tauri/mux.key.pub` - Public key

## 3. Configure GitHub Secrets

Go to your **private** repo (AlexMartosP/mux) → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/mux.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you used when generating the key |
| `RELEASES_PAT` | Personal Access Token with `repo` scope (see below) |

### Creating the Personal Access Token (RELEASES_PAT)

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Name: `mux-releases-publish`
4. Expiration: No expiration (or set a reminder to rotate)
5. Scopes: Check `repo` (full control of private repositories)
6. Copy the token and add it as `RELEASES_PAT` secret

## 4. Update tauri.conf.json (if not already done)

Ensure `src-tauri/tauri.conf.json` points to your public releases repo:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/AlexMartosP/mux-releases/releases/latest/download/latest.json"
      ],
      "pubkey": "CONTENTS_OF_YOUR_PUBLIC_KEY_FILE"
    }
  }
}
```

Get your public key:
```bash
cat ~/.tauri/mux.key.pub
```

## 5. Create a Release

### Option A: Push a tag
```bash
# Update version in src-tauri/tauri.conf.json and src-tauri/Cargo.toml
# Commit the change
git add -A && git commit -m "Bump version to 0.2.0"

# Create and push tag
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

### Option B: Manual workflow dispatch
Go to Actions → Release → Run workflow → Enter version (e.g., `0.2.0`)

## 6. How Updates Work

1. User opens Settings → clicks "Check for Updates"
2. App fetches `latest.json` from the **public** mux-releases repo
3. If newer version exists, shows "Update to vX.X.X" button
4. User clicks → downloads `.tar.gz` → verifies signature → installs → relaunches

## 7. Version Bumping

Before each release, update the version in:
- `src-tauri/tauri.conf.json` → `"version": "X.X.X"`
- `src-tauri/Cargo.toml` → `version = "X.X.X"`
- `package.json` → `"version": "X.X.X"` (optional)

## First-Time Installation

For users installing Mux for the first time:

1. Go to https://github.com/AlexMartosP/mux-releases/releases
2. Download the appropriate DMG:
   - `Mux_aarch64.dmg` for Apple Silicon (M1/M2/M3)
   - `Mux_x64.dmg` for Intel Mac
3. Open the DMG and drag Mux to Applications
4. First launch: Right-click → Open (to bypass Gatekeeper warning)

## Troubleshooting

### Update check fails
- Verify the releases repo is **public**
- Check that `latest.json` exists in the release assets
- Verify the endpoint URL in tauri.conf.json matches your releases repo

### Signature verification fails
- Ensure pubkey in tauri.conf.json matches the private key used to sign
- Check that TAURI_SIGNING_PRIVATE_KEY secret is set correctly in the private repo

### Build fails on CI
- Check that all secrets are configured (TAURI_SIGNING_PRIVATE_KEY, TAURI_SIGNING_PRIVATE_KEY_PASSWORD, RELEASES_PAT)
- Verify the RELEASES_PAT has `repo` scope
- Check that the releases repo exists and is public

### "Resource not accessible by integration" error
- Ensure `permissions: contents: write` is in the workflow
- For cross-repo publishing, ensure RELEASES_PAT is valid and has correct scope
