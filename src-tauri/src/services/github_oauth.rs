use crate::db::Database;
use crate::error::{AppError, Result};
use crate::services::crypto::CryptoService;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tiny_http::{Response, Server};

const GITHUB_CLIENT_ID: &str = "Iv23liMJnhSYpbkiujmC";
const GITHUB_CLIENT_SECRET: &str = "abe482a8684808f28f9ce296d0b5cd2e5ab4d88f";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubAuthStatus {
    pub authenticated: bool,
    pub username: Option<String>,
    pub scopes: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    token_type: String,
    scope: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<u64>,
}

pub struct GitHubOAuthService;

impl GitHubOAuthService {
    /// Start OAuth flow and return the authorization URL
    /// Returns (auth_url, local_port)
    pub fn start_oauth(workspace_id: &str) -> Result<(String, u16)> {
        // Find available port (8000-9000 range)
        let port = Self::find_available_port()?;

        // Construct GitHub OAuth authorization URL
        let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
        let state = workspace_id.to_string(); // Use workspace_id as state for verification

        let auth_url = format!(
            "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}&state={}",
            GITHUB_CLIENT_ID,
            urlencoding::encode(&redirect_uri),
            urlencoding::encode("repo read:user"),
            urlencoding::encode(&state)
        );

        Ok((auth_url, port))
    }

    /// Start local callback server and wait for OAuth code
    pub fn wait_for_callback(port: u16, workspace_id: String, db: Arc<Database>) -> Result<()> {
        let address = format!("127.0.0.1:{}", port);
        let server = Server::http(&address)
            .map_err(|e| AppError::Other(format!("Failed to start callback server: {}", e)))?;

        log::info!("[OAuth] Callback server listening on {}", address);

        // Wrap server in Arc<Mutex> for timeout handling
        let server = Arc::new(Mutex::new(server));
        let server_clone = Arc::clone(&server);
        let result = Arc::new(Mutex::new(None));
        let result_clone = Arc::clone(&result);
        let workspace_id_clone = workspace_id.clone();

        // Spawn thread to handle the request
        let handle = thread::spawn(move || {
            let server = server_clone.lock().unwrap();
            match server.recv_timeout(Duration::from_secs(30)) {
                Ok(Some(request)) => {
                    let url = request.url().to_string();
                    log::info!("[OAuth] Received callback: {}", url);

                    // Parse query parameters
                    if let Some(query_start) = url.find('?') {
                        let query = &url[query_start + 1..];
                        let params: Vec<(&str, &str)> = query
                            .split('&')
                            .filter_map(|param| {
                                let mut parts = param.splitn(2, '=');
                                match (parts.next(), parts.next()) {
                                    (Some(key), Some(value)) => Some((key, value)),
                                    _ => None,
                                }
                            })
                            .collect();

                        // Find code and state
                        let code = params.iter().find(|(k, _)| *k == "code").map(|(_, v)| *v);
                        let state = params.iter().find(|(k, _)| *k == "state").map(|(_, v)| *v);

                        // Verify state matches workspace_id
                        if let (Some(code), Some(state)) = (code, state) {
                            let decoded_state = urlencoding::decode(state).unwrap_or_default();
                            if decoded_state == workspace_id_clone {
                                // Send success response to browser
                                let response = Response::from_string(
                                    "<html><body><h1>Authentication Successful!</h1><p>You can close this window.</p></body></html>"
                                ).with_header(
                                    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap()
                                );
                                let _ = request.respond(response);

                                // Store code in result
                                *result_clone.lock().unwrap() = Some(Ok(code.to_string()));
                                return;
                            }
                        }
                    }

                    // Send error response
                    let response = Response::from_string(
                        "<html><body><h1>Authentication Failed</h1><p>Invalid or missing parameters.</p></body></html>"
                    ).with_header(
                        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap()
                    );
                    let _ = request.respond(response);
                    *result_clone.lock().unwrap() = Some(Err(AppError::Other("Invalid OAuth callback".to_string())));
                }
                Ok(None) | Err(_) => {
                    *result_clone.lock().unwrap() = Some(Err(AppError::Other("OAuth timeout".to_string())));
                }
            }
        });

        // Wait for the thread to complete
        handle
            .join()
            .map_err(|_| AppError::Other("Callback thread panicked".to_string()))?;

        // Get result
        let result = result.lock().unwrap().take();
        match result {
            Some(Ok(code)) => {
                // Exchange code for tokens
                Self::complete_oauth(&workspace_id, &code, &db)?;
                Ok(())
            }
            Some(Err(e)) => Err(e),
            None => Err(AppError::Other("No result from callback".to_string())),
        }
    }

    /// Exchange OAuth code for access token and store in workspace settings
    fn complete_oauth(workspace_id: &str, code: &str, db: &Database) -> Result<()> {
        log::info!("[OAuth] Exchanging code for access token");

        // Exchange code for access token
        let client = reqwest::blocking::Client::new();
        let redirect_uri = "http://127.0.0.1:8000/callback"; // TODO: Use actual port

        let response = client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GITHUB_CLIENT_ID),
                ("client_secret", GITHUB_CLIENT_SECRET),
                ("code", code),
                ("redirect_uri", redirect_uri),
            ])
            .send()
            .map_err(|e| AppError::Other(format!("Failed to exchange code: {}", e)))?;

        let token_response: TokenResponse = response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse token response: {}", e)))?;

        // Fetch user info
        let user_info = Self::fetch_user_info(&token_response.access_token)?;

        // Encrypt tokens
        let encrypted_access_token = CryptoService::encrypt(&token_response.access_token)?;
        let encrypted_refresh_token = token_response
            .refresh_token
            .as_ref()
            .map(|t| CryptoService::encrypt(t))
            .transpose()?;

        // Calculate expiry timestamp
        let expires_at = token_response.expires_in.map(|seconds| {
            let expiry = chrono::Utc::now() + chrono::Duration::seconds(seconds as i64);
            expiry.to_rfc3339()
        });

        // Store in workspace settings
        db.set_workspace_setting(workspace_id, "github_access_token", &encrypted_access_token)?;
        db.set_workspace_setting(workspace_id, "github_token_type", &token_response.token_type)?;
        db.set_workspace_setting(workspace_id, "github_authenticated_user", &user_info.login)?;
        db.set_workspace_setting(workspace_id, "github_auth_scopes", &token_response.scope)?;

        if let Some(encrypted_refresh) = encrypted_refresh_token {
            db.set_workspace_setting(workspace_id, "github_refresh_token", &encrypted_refresh)?;
        }

        if let Some(expires) = expires_at {
            db.set_workspace_setting(workspace_id, "github_token_expires_at", &expires)?;
        }

        log::info!("[OAuth] Successfully authenticated as {}", user_info.login);
        Ok(())
    }

    /// Fetch GitHub user info to get username
    fn fetch_user_info(access_token: &str) -> Result<GitHubUser> {
        let client = reqwest::blocking::Client::new();
        let response = client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("User-Agent", "Mux")
            .send()
            .map_err(|e| AppError::Other(format!("Failed to fetch user info: {}", e)))?;

        response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse user info: {}", e)))
    }

    /// Check authentication status for a workspace
    pub fn check_auth_status(workspace_id: &str, db: &Database) -> Result<GitHubAuthStatus> {
        // Check if tokens exist
        let access_token = db.get_workspace_setting(workspace_id, "github_access_token")?;

        if access_token.is_none() {
            return Ok(GitHubAuthStatus {
                authenticated: false,
                username: None,
                scopes: None,
            });
        }

        // Get username and scopes
        let username = db.get_workspace_setting(workspace_id, "github_authenticated_user")?;
        let scopes_str = db.get_workspace_setting(workspace_id, "github_auth_scopes")?;
        let scopes = scopes_str.map(|s| s.split(',').map(|s| s.trim().to_string()).collect());

        Ok(GitHubAuthStatus {
            authenticated: true,
            username,
            scopes,
        })
    }

    /// Disconnect GitHub (remove tokens from workspace settings)
    pub fn disconnect(workspace_id: &str, db: &Database) -> Result<()> {
        db.delete_workspace_setting(workspace_id, "github_access_token")?;
        db.delete_workspace_setting(workspace_id, "github_refresh_token")?;
        db.delete_workspace_setting(workspace_id, "github_token_expires_at")?;
        db.delete_workspace_setting(workspace_id, "github_token_type")?;
        db.delete_workspace_setting(workspace_id, "github_authenticated_user")?;
        db.delete_workspace_setting(workspace_id, "github_auth_scopes")?;

        log::info!("[OAuth] Disconnected GitHub for workspace {}", workspace_id);
        Ok(())
    }

    /// Find an available port in the range 8000-9000
    fn find_available_port() -> Result<u16> {
        for port in 8000..9000 {
            if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
                return Ok(port);
            }
        }
        Err(AppError::Other("No available ports in range 8000-9000".to_string()))
    }
}

#[derive(Debug, Deserialize)]
struct GitHubUser {
    login: String,
}
