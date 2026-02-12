use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use zeroize::Zeroize;
use std::fs;
use std::path::PathBuf;

use crate::error::{AppError, Result};

/// Crypto service for encrypting/decrypting sensitive data like GitHub tokens
pub struct CryptoService;

impl CryptoService {
    /// Get the path to the master key file
    fn get_key_file_path() -> Result<PathBuf> {
        let data_dir = directories::ProjectDirs::from("com", "mux", "Mux")
            .ok_or_else(|| AppError::Other("Failed to get data directory".to_string()))?;

        let key_dir = data_dir.data_dir().join(".secrets");

        // Create directory if it doesn't exist
        fs::create_dir_all(&key_dir)
            .map_err(|e| AppError::Other(format!("Failed to create secrets directory: {}", e)))?;

        Ok(key_dir.join("master.key"))
    }

    /// Get or create the master encryption key from local file
    fn get_or_create_master_key() -> Result<Vec<u8>> {
        let key_path = Self::get_key_file_path()?;

        // Try to read existing key
        match fs::read(&key_path) {
            Ok(key_bytes) => {
                if key_bytes.len() == 32 {
                    Ok(key_bytes)
                } else {
                    Err(AppError::Other("Invalid master key length".to_string()))
                }
            }
            Err(_) => {
                // Key doesn't exist, generate new one
                let mut key = vec![0u8; 32]; // 256-bit key
                OsRng.fill_bytes(&mut key);

                // Store in file with restricted permissions
                fs::write(&key_path, &key)
                    .map_err(|e| AppError::Other(format!("Failed to store master key: {}", e)))?;

                // Set file permissions to be readable only by the owner (Unix only)
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let mut perms = fs::metadata(&key_path)
                        .map_err(|e| AppError::Other(format!("Failed to get file metadata: {}", e)))?
                        .permissions();
                    perms.set_mode(0o600); // rw------- (owner read/write only)
                    fs::set_permissions(&key_path, perms)
                        .map_err(|e| AppError::Other(format!("Failed to set file permissions: {}", e)))?;
                }

                Ok(key)
            }
        }
    }

    /// Encrypt a string using AES-256-GCM
    pub fn encrypt(plaintext: &str) -> Result<String> {
        let key = Self::get_or_create_master_key()?;

        // Create cipher
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| AppError::Other(format!("Failed to create cipher: {}", e)))?;

        // Generate random nonce (96 bits for GCM)
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Encrypt
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| AppError::Other(format!("Encryption failed: {}", e)))?;

        // Combine nonce + ciphertext and encode as base64
        let mut combined = nonce_bytes.to_vec();
        combined.extend_from_slice(&ciphertext);

        Ok(base64::encode(&combined))
    }

    /// Decrypt a string using AES-256-GCM
    pub fn decrypt(encrypted: &str) -> Result<String> {
        let key = Self::get_or_create_master_key()?;

        // Create cipher
        let cipher = Aes256Gcm::new_from_slice(&key)
            .map_err(|e| AppError::Other(format!("Failed to create cipher: {}", e)))?;

        // Decode from base64
        let combined = base64::decode(encrypted)
            .map_err(|e| AppError::Other(format!("Failed to decode encrypted data: {}", e)))?;

        // Split nonce and ciphertext
        if combined.len() < 12 {
            return Err(AppError::Other("Invalid encrypted data".to_string()));
        }

        let (nonce_bytes, ciphertext) = combined.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        // Decrypt
        let mut plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| AppError::Other(format!("Decryption failed: {}", e)))?;

        let result = String::from_utf8(plaintext.clone())
            .map_err(|e| AppError::Other(format!("Invalid UTF-8: {}", e)))?;

        // Clear sensitive data from memory
        plaintext.zeroize();

        Ok(result)
    }

    /// Clear the master key from file (for testing/debugging)
    #[allow(dead_code)]
    pub fn clear_master_key() -> Result<()> {
        let key_path = Self::get_key_file_path()?;

        if key_path.exists() {
            fs::remove_file(&key_path)
                .map_err(|e| AppError::Other(format!("Failed to delete master key: {}", e)))?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let plaintext = "my_secret_token_12345";

        let encrypted = CryptoService::encrypt(plaintext).expect("Encryption failed");
        assert_ne!(encrypted, plaintext);

        let decrypted = CryptoService::decrypt(&encrypted).expect("Decryption failed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_different_nonces() {
        let plaintext = "same_text";

        let encrypted1 = CryptoService::encrypt(plaintext).expect("Encryption failed");
        let encrypted2 = CryptoService::encrypt(plaintext).expect("Encryption failed");

        // Same plaintext should produce different ciphertext (different nonces)
        assert_ne!(encrypted1, encrypted2);

        // Both should decrypt to the same value
        assert_eq!(
            CryptoService::decrypt(&encrypted1).unwrap(),
            plaintext
        );
        assert_eq!(
            CryptoService::decrypt(&encrypted2).unwrap(),
            plaintext
        );
    }
}
