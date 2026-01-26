# Release & Auto-Update Setup

This guide explains how to set up automatic releases and updates for Mux.

## 1. Generate Signing Keys

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

## 2. Configure GitHub Repository

### Add Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:
- `TAURI_SIGNING_PRIVATE_KEY`: Contents of `~/.tauri/mux.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Password you used when generating the key

### Update tauri.conf.json

Replace the placeholder in `src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/YOUR_ORG/mux/releases/latest/download/latest.json"
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

## 3. Create a Release

### Option A: Push a tag
```bash
# Update version in src-tauri/tauri.conf.json
# Commit the change
git add -A && git commit -m "Bump version to 0.2.0"

# Create and push tag
git tag v0.2.0
git push origin v0.2.0
```

### Option B: Manual workflow dispatch
Go to Actions → Release → Run workflow → Enter version

## 4. How Updates Work

1. User opens Settings → clicks "Check for Updates"
2. App fetches `latest.json` from GitHub Releases
3. If newer version exists, shows "Update to vX.X.X" button
4. User clicks → downloads and installs → app relaunches

## 5. Version Bumping

Before each release, update the version in:
- `src-tauri/tauri.conf.json` → `"version": "X.X.X"`
- `src-tauri/Cargo.toml` → `version = "X.X.X"`
- `package.json` → `"version": "X.X.X"`

## Troubleshooting

### Update check fails
- Verify the endpoint URL is correct
- Check that releases are public (or user has access to private repo)
- Ensure `latest.json` exists in the release assets

### Signature verification fails
- Ensure pubkey in tauri.conf.json matches the private key used to sign
- Check that TAURI_SIGNING_PRIVATE_KEY secret is set correctly

### Build fails on CI
- Check that all secrets are configured
- Verify Node.js and Rust versions are compatible
