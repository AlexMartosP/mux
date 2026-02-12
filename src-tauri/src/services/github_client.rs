use crate::db::Database;
use crate::error::{AppError, Result};
use crate::services::CryptoService;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// GitHub REST API client for workspace-scoped operations
pub struct GitHubClient {
    access_token: String,
    client: reqwest::blocking::Client,
    workspace_id: String,
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

#[derive(Debug, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub id: i64,
    pub avatar_url: String,
    pub html_url: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreatePRInput {
    pub title: String,
    pub body: String,
    pub head: String,
    pub base: String,
    #[serde(default)]
    pub draft: bool,
}

#[derive(Debug, Deserialize)]
pub struct PullRequestResponse {
    pub number: i64,
    pub html_url: String,
    pub title: String,
    pub body: Option<String>,
    pub state: String,
    pub draft: bool,
    pub user: GitHubUser,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CheckRun {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub html_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CheckRunsResponse {
    total_count: i64,
    check_runs: Vec<CheckRun>,
}

const GITHUB_CLIENT_ID: &str = "Iv23liMJnhSYpbkiujmC";
const GITHUB_CLIENT_SECRET: &str = "abe482a8684808f28f9ce296d0b5cd2e5ab4d88f";

impl GitHubClient {
    /// Create a new GitHub client from workspace settings
    pub fn from_workspace(db: &Database, workspace_id: &str) -> Result<Self> {
        // Get encrypted access token
        let encrypted_token = db
            .get_workspace_setting(workspace_id, "github_access_token")?
            .ok_or_else(|| AppError::Other("GitHub not authenticated for this workspace".to_string()))?;

        // Decrypt token
        let access_token = CryptoService::decrypt(&encrypted_token)?;

        let client = reqwest::blocking::Client::builder()
            .user_agent("Mux")
            .build()
            .map_err(|e| AppError::Other(format!("Failed to create HTTP client: {}", e)))?;

        let mut github_client = Self {
            access_token,
            client,
            workspace_id: workspace_id.to_string(),
        };

        // Ensure token is valid (and refresh if needed)
        github_client.ensure_valid_token(db)?;

        Ok(github_client)
    }

    /// Ensure the access token is valid, refresh if expiring soon
    fn ensure_valid_token(&mut self, db: &Database) -> Result<()> {
        // Check if token expires within 5 minutes
        if let Some(expires_at_str) = db.get_workspace_setting(&self.workspace_id, "github_token_expires_at")? {
            if let Ok(expires_at) = DateTime::parse_from_rfc3339(&expires_at_str) {
                let now = Utc::now();
                let expires_at = expires_at.with_timezone(&Utc);

                // If token expires within 5 minutes, refresh it
                if expires_at.signed_duration_since(now).num_minutes() < 5 {
                    log::info!("[GitHub] Access token expiring soon, refreshing...");
                    self.refresh_token(db)?;
                }
            }
        }

        Ok(())
    }

    /// Refresh the access token using the refresh token
    fn refresh_token(&mut self, db: &Database) -> Result<()> {
        // Get encrypted refresh token
        let encrypted_refresh = db
            .get_workspace_setting(&self.workspace_id, "github_refresh_token")?
            .ok_or_else(|| AppError::Other("No refresh token available".to_string()))?;

        let refresh_token = CryptoService::decrypt(&encrypted_refresh)?;

        // Exchange refresh token for new access token
        let response = self.client
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", GITHUB_CLIENT_ID),
                ("client_secret", GITHUB_CLIENT_SECRET),
                ("grant_type", "refresh_token"),
                ("refresh_token", &refresh_token),
            ])
            .send()
            .map_err(|e| AppError::Other(format!("Failed to refresh token: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::Other(format!(
                "Token refresh failed with status: {}",
                response.status()
            )));
        }

        let token_response: TokenResponse = response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse token response: {}", e)))?;

        // Encrypt new tokens
        let encrypted_access = CryptoService::encrypt(&token_response.access_token)?;
        let encrypted_refresh = token_response
            .refresh_token
            .as_ref()
            .map(|t| CryptoService::encrypt(t))
            .transpose()?;

        // Calculate new expiry
        let expires_at = token_response.expires_in.map(|seconds| {
            let expiry = Utc::now() + chrono::Duration::seconds(seconds as i64);
            expiry.to_rfc3339()
        });

        // Store new tokens
        db.set_workspace_setting(&self.workspace_id, "github_access_token", &encrypted_access)?;
        if let Some(encrypted_refresh) = encrypted_refresh {
            db.set_workspace_setting(&self.workspace_id, "github_refresh_token", &encrypted_refresh)?;
        }
        if let Some(expires) = expires_at {
            db.set_workspace_setting(&self.workspace_id, "github_token_expires_at", &expires)?;
        }

        // Update client's access token
        self.access_token = token_response.access_token;

        log::info!("[GitHub] Successfully refreshed access token");
        Ok(())
    }

    /// Validate the access token by fetching the authenticated user
    pub fn validate_token(&self) -> Result<GitHubUser> {
        let response = self.client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("User-Agent", "Mux")
            .send()
            .map_err(|e| AppError::Other(format!("Failed to validate token: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::Other(format!(
                "Token validation failed with status: {}",
                response.status()
            )));
        }

        response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse user info: {}", e)))
    }

    /// Create a pull request
    pub fn create_pull_request(
        &self,
        owner: &str,
        repo: &str,
        input: CreatePRInput,
    ) -> Result<PullRequestResponse> {
        let url = format!("https://api.github.com/repos/{}/{}/pulls", owner, repo);

        let response = self.client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("User-Agent", "Mux")
            .json(&input)
            .send()
            .map_err(|e| AppError::Other(format!("Failed to create PR: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().unwrap_or_default();
            return Err(AppError::Other(format!(
                "Failed to create PR ({}): {}",
                status, error_text
            )));
        }

        response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse PR response: {}", e)))
    }

    /// Get a pull request by number
    pub fn get_pull_request(
        &self,
        owner: &str,
        repo: &str,
        number: i64,
    ) -> Result<PullRequestResponse> {
        let url = format!("https://api.github.com/repos/{}/{}/pulls/{}", owner, repo, number);

        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("User-Agent", "Mux")
            .send()
            .map_err(|e| AppError::Other(format!("Failed to get PR: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::Other(format!(
                "Failed to get PR with status: {}",
                response.status()
            )));
        }

        response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse PR response: {}", e)))
    }

    /// Get CI check runs for a commit
    pub fn get_check_runs(
        &self,
        owner: &str,
        repo: &str,
        ref_name: &str,
    ) -> Result<Vec<CheckRun>> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/commits/{}/check-runs",
            owner, repo, ref_name
        );

        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("User-Agent", "Mux")
            .send()
            .map_err(|e| AppError::Other(format!("Failed to get check runs: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::Other(format!(
                "Failed to get check runs with status: {}",
                response.status()
            )));
        }

        let check_runs_response: CheckRunsResponse = response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse check runs response: {}", e)))?;

        Ok(check_runs_response.check_runs)
    }

    /// Get the default branch for a repository
    pub fn get_default_branch(&self, owner: &str, repo: &str) -> Result<String> {
        let url = format!("https://api.github.com/repos/{}/{}", owner, repo);

        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("User-Agent", "Mux")
            .send()
            .map_err(|e| AppError::Other(format!("Failed to get repository: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::Other(format!(
                "Failed to get repository with status: {}",
                response.status()
            )));
        }

        #[derive(Deserialize)]
        struct RepoResponse {
            default_branch: String,
        }

        let repo_response: RepoResponse = response
            .json()
            .map_err(|e| AppError::Other(format!("Failed to parse repository response: {}", e)))?;

        Ok(repo_response.default_branch)
    }

    /// Get pull requests created by the authenticated user
    pub fn get_my_pull_requests(&self) -> Result<Vec<PullRequestListItem>> {
        // Search for PRs by the authenticated user
        let url = "https://api.github.com/search/issues?q=is:pr+is:open+author:@me&sort=updated&per_page=50";

        log::info!("[GitHub] Fetching my PRs from: {}", url);

        let response = self.client
            .get(url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("User-Agent", "Mux")
            .send()
            .map_err(|e| AppError::Other(format!("Failed to fetch PRs: {}", e)))?;

        let status = response.status();
        log::info!("[GitHub] My PRs response status: {}", status);

        if !status.is_success() {
            let error_body = response.text().unwrap_or_default();
            log::error!("[GitHub] Failed to fetch PRs. Status: {}, Body: {}", status, error_body);
            return Err(AppError::Other(format!(
                "Failed to fetch PRs with status: {}. Error: {}",
                status, error_body
            )));
        }

        let body = response.text()
            .map_err(|e| AppError::Other(format!("Failed to read response body: {}", e)))?;

        log::info!("[GitHub] My PRs response body length: {}", body.len());

        let search_response: SearchIssuesResponse = serde_json::from_str(&body)
            .map_err(|e| {
                log::error!("[GitHub] Failed to parse response: {}. Body: {}", e, body);
                AppError::Other(format!("Failed to parse PRs response: {}", e))
            })?;

        log::info!("[GitHub] Found {} PRs", search_response.items.len());

        Ok(search_response.items.into_iter().map(|item| item.into()).collect())
    }

    /// Get pull requests where the authenticated user is requested as a reviewer
    pub fn get_review_requests(&self) -> Result<Vec<PullRequestListItem>> {
        // Search for PRs where user is requested as reviewer
        let url = "https://api.github.com/search/issues?q=is:pr+is:open+review-requested:@me&sort=updated&per_page=50";

        log::info!("[GitHub] Fetching review requests from: {}", url);

        let response = self.client
            .get(url)
            .header("Authorization", format!("Bearer {}", self.access_token))
            .header("User-Agent", "Mux")
            .send()
            .map_err(|e| AppError::Other(format!("Failed to fetch review requests: {}", e)))?;

        let status = response.status();
        log::info!("[GitHub] Review requests response status: {}", status);

        if !status.is_success() {
            let error_body = response.text().unwrap_or_default();
            log::error!("[GitHub] Failed to fetch review requests. Status: {}, Body: {}", status, error_body);
            return Err(AppError::Other(format!(
                "Failed to fetch review requests with status: {}. Error: {}",
                status, error_body
            )));
        }

        let body = response.text()
            .map_err(|e| AppError::Other(format!("Failed to read response body: {}", e)))?;

        log::info!("[GitHub] Review requests response body length: {}", body.len());

        let search_response: SearchIssuesResponse = serde_json::from_str(&body)
            .map_err(|e| {
                log::error!("[GitHub] Failed to parse response: {}. Body: {}", e, body);
                AppError::Other(format!("Failed to parse review requests response: {}", e))
            })?;

        log::info!("[GitHub] Found {} review requests", search_response.items.len());

        Ok(search_response.items.into_iter().map(|item| item.into()).collect())
    }
}

/// Pull request list item (simplified for listing)
#[derive(Debug, Serialize, Deserialize)]
pub struct PullRequestListItem {
    pub number: i64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub author: String,
    pub repository: String,
    pub created_at: String,
    pub updated_at: String,
    pub draft: bool,
}

#[derive(Debug, Deserialize)]
struct SearchIssuesResponse {
    items: Vec<SearchIssueItem>,
}

#[derive(Debug, Deserialize)]
struct SearchIssueItem {
    number: i64,
    title: String,
    html_url: String,
    state: String,
    user: IssueUser,
    repository_url: String,
    created_at: String,
    updated_at: String,
    draft: Option<bool>,
    pull_request: Option<serde_json::Value>, // Present if this is a PR
}

#[derive(Debug, Deserialize)]
struct IssueUser {
    login: String,
}

impl From<SearchIssueItem> for PullRequestListItem {
    fn from(item: SearchIssueItem) -> Self {
        // Extract repository name from repository_url
        // Format: https://api.github.com/repos/owner/repo
        let repository = item.repository_url
            .strip_prefix("https://api.github.com/repos/")
            .unwrap_or("unknown/unknown")
            .to_string();

        PullRequestListItem {
            number: item.number,
            title: item.title,
            url: item.html_url,
            state: item.state,
            author: item.user.login,
            repository,
            created_at: item.created_at,
            updated_at: item.updated_at,
            draft: item.draft.unwrap_or(false),
        }
    }
}
