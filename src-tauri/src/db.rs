use crate::error::{AppError, Result};
use crate::models::{Task, TaskStatus};
use directories::ProjectDirs;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for better concurrent read/write performance
        // WAL allows readers and writers to operate simultaneously
        conn.pragma_update(None, "journal_mode", "WAL")?;

        // Reduce fsync frequency for better write performance
        // NORMAL is safe for most cases (data loss only on OS crash, not app crash)
        conn.pragma_update(None, "synchronous", "NORMAL")?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init()?;
        Ok(db)
    }

    fn get_db_path() -> Result<PathBuf> {
        let qualifier = if cfg!(debug_assertions) {
            "AgentCoordinator-Dev"
        } else {
            "AgentCoordinator"
        };
        let proj_dirs = ProjectDirs::from("com", "agent-coordinator", qualifier)
            .ok_or_else(|| AppError::Other("Could not determine app data directory".into()))?;

        Ok(proj_dirs.data_dir().join("tasks.db"))
    }

    fn init(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                repository_path TEXT NOT NULL,
                branch TEXT NOT NULL,
                worktree_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'idle',
                prompt TEXT NOT NULL,
                created_at TEXT NOT NULL,
                pr_url TEXT,
                metadata_loading INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )?;

        // Migration: Add description column if it doesn't exist
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT ''", []);

        // Migration: Add metadata_loading column if it doesn't exist
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN metadata_loading INTEGER NOT NULL DEFAULT 0", []);

        // Output logs table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS task_output (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                output_type TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                tool_name TEXT,
                tool_input TEXT,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Migration: Add tool_name and tool_input columns if they don't exist
        let _ = conn.execute("ALTER TABLE task_output ADD COLUMN tool_name TEXT", []);
        let _ = conn.execute("ALTER TABLE task_output ADD COLUMN tool_input TEXT", []);

        // Create index for faster lookups
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_task_output_task_id ON task_output(task_id)",
            [],
        )?;

        // Settings table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )",
            [],
        )?;

        // Migration: Add takeover state columns
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN takeover_original_branch TEXT", []);
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN takeover_wip_commit TEXT", []);
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN takeover_had_stash INTEGER DEFAULT 0", []);
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN takeover_started_at TEXT", []);

        // Migration: Add last_pid column for process state persistence
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN last_pid INTEGER", []);

        // Migration: Add auto_accept_edits column
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN auto_accept_edits INTEGER NOT NULL DEFAULT 0", []);

        // Migration: Add pinned column
        let _ = conn.execute("ALTER TABLE tasks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0", []);

        // Notification log table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                notification_type TEXT NOT NULL DEFAULT 'info',
                read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
            )",
            [],
        )?;

        Ok(())
    }

    // Settings methods
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let value = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?",
                [key],
                |row| row.get(0),
            )
            .optional()?;
        Ok(value)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_all_settings(&self) -> Result<std::collections::HashMap<String, String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
        let settings = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<std::result::Result<std::collections::HashMap<_, _>, _>>()?;
        Ok(settings)
    }

    pub fn get_all_tasks(&self) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, repository_path, branch, worktree_path, status, prompt, created_at, pr_url, metadata_loading, auto_accept_edits, pinned
             FROM tasks ORDER BY created_at DESC",
        )?;

        let tasks = stmt
            .query_map([], |row| {
                Ok(Task {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    repository_path: row.get(3)?,
                    branch: row.get(4)?,
                    worktree_path: row.get(5)?,
                    status: TaskStatus::from_str(&row.get::<_, String>(6)?),
                    prompt: row.get(7)?,
                    created_at: row.get(8)?,
                    pr_url: row.get(9)?,
                    metadata_loading: row.get::<_, i32>(10)? != 0,
                    auto_accept_edits: row.get::<_, i32>(11).unwrap_or(0) != 0,
                    pinned: row.get::<_, i32>(12).unwrap_or(0) != 0,
                    pid: None,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(tasks)
    }

    pub fn get_task(&self, id: &str) -> Result<Option<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, repository_path, branch, worktree_path, status, prompt, created_at, pr_url, metadata_loading, auto_accept_edits, pinned
             FROM tasks WHERE id = ?",
        )?;

        let task = stmt
            .query_row([id], |row| {
                Ok(Task {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    repository_path: row.get(3)?,
                    branch: row.get(4)?,
                    worktree_path: row.get(5)?,
                    status: TaskStatus::from_str(&row.get::<_, String>(6)?),
                    prompt: row.get(7)?,
                    created_at: row.get(8)?,
                    pr_url: row.get(9)?,
                    metadata_loading: row.get::<_, i32>(10)? != 0,
                    auto_accept_edits: row.get::<_, i32>(11).unwrap_or(0) != 0,
                    pinned: row.get::<_, i32>(12).unwrap_or(0) != 0,
                    pid: None,
                })
            })
            .optional()?;

        Ok(task)
    }

    pub fn insert_task(&self, task: &Task) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO tasks (id, name, description, repository_path, branch, worktree_path, status, prompt, created_at, pr_url, metadata_loading, auto_accept_edits, pinned)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                task.id,
                task.name,
                task.description,
                task.repository_path,
                task.branch,
                task.worktree_path,
                task.status.as_str(),
                task.prompt,
                task.created_at,
                task.pr_url,
                task.metadata_loading as i32,
                task.auto_accept_edits as i32,
                task.pinned as i32,
            ],
        )?;
        Ok(())
    }

    /// Update task metadata (name, description, branch) and clear loading flag
    pub fn update_task_metadata(
        &self,
        id: &str,
        name: &str,
        description: &str,
        branch: &str,
        worktree_path: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET name = ?, description = ?, branch = ?, worktree_path = ?, metadata_loading = 0 WHERE id = ?",
            params![name, description, branch, worktree_path, id],
        )?;
        Ok(())
    }

    pub fn set_task_pinned(&self, id: &str, pinned: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET pinned = ? WHERE id = ?",
            params![pinned as i32, id],
        )?;
        Ok(())
    }

    pub fn get_running_task_count(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = 'running'",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    pub fn get_queued_tasks(&self) -> Result<Vec<Task>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, repository_path, branch, worktree_path, status, prompt, created_at, pr_url, metadata_loading, auto_accept_edits, pinned
             FROM tasks WHERE status = 'queued' ORDER BY created_at ASC",
        )?;

        let tasks = stmt
            .query_map([], |row| {
                Ok(Task {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    repository_path: row.get(3)?,
                    branch: row.get(4)?,
                    worktree_path: row.get(5)?,
                    status: TaskStatus::from_str(&row.get::<_, String>(6)?),
                    prompt: row.get(7)?,
                    created_at: row.get(8)?,
                    pr_url: row.get(9)?,
                    metadata_loading: row.get::<_, i32>(10)? != 0,
                    auto_accept_edits: row.get::<_, i32>(11).unwrap_or(0) != 0,
                    pinned: row.get::<_, i32>(12).unwrap_or(0) != 0,
                    pid: None,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(tasks)
    }

    // Notification methods
    pub fn insert_notification(
        &self,
        task_id: Option<&str>,
        title: &str,
        body: &str,
        notification_type: &str,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO notifications (task_id, title, body, notification_type, created_at) VALUES (?, ?, ?, ?, ?)",
            params![task_id, title, body, notification_type, timestamp],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_notifications(&self, limit: i64, include_read: bool) -> Result<Vec<NotificationEntry>> {
        let conn = self.conn.lock().unwrap();
        let query = if include_read {
            "SELECT id, task_id, title, body, notification_type, read, created_at FROM notifications ORDER BY created_at DESC LIMIT ?"
        } else {
            "SELECT id, task_id, title, body, notification_type, read, created_at FROM notifications WHERE read = 0 ORDER BY created_at DESC LIMIT ?"
        };
        let mut stmt = conn.prepare(query)?;

        let notifications = stmt
            .query_map(params![limit], |row| {
                Ok(NotificationEntry {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    title: row.get(2)?,
                    body: row.get(3)?,
                    notification_type: row.get(4)?,
                    read: row.get::<_, i32>(5)? != 0,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(notifications)
    }

    pub fn get_unread_notification_count(&self) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM notifications WHERE read = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    pub fn mark_notification_read(&self, id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE notifications SET read = 1 WHERE id = ?", params![id])?;
        Ok(())
    }

    pub fn mark_all_notifications_read(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("UPDATE notifications SET read = 1 WHERE read = 0", [])?;
        Ok(())
    }

    pub fn clear_notifications(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM notifications", [])?;
        Ok(())
    }

    pub fn set_task_auto_accept_edits(&self, id: &str, enabled: bool) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET auto_accept_edits = ? WHERE id = ?",
            params![enabled as i32, id],
        )?;
        Ok(())
    }

    pub fn update_task_status(&self, id: &str, status: TaskStatus) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET status = ? WHERE id = ?",
            params![status.as_str(), id],
        )?;
        Ok(())
    }

    /// Update task status and PID together
    pub fn update_task_status_and_pid(&self, id: &str, status: TaskStatus, pid: Option<u32>) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET status = ?, last_pid = ? WHERE id = ?",
            params![status.as_str(), pid, id],
        )?;
        Ok(())
    }

    /// Get all tasks that have a "running" status (for startup recovery check)
    pub fn get_running_tasks_with_pids(&self) -> Result<Vec<(String, Option<u32>)>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, last_pid FROM tasks WHERE status = 'running'"
        )?;

        let tasks = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<u32>>(1)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(tasks)
    }

    pub fn update_task_pr_url(&self, id: &str, pr_url: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET pr_url = ? WHERE id = ?",
            params![pr_url, id],
        )?;
        Ok(())
    }

    pub fn update_task_description(&self, id: &str, description: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET description = ? WHERE id = ?",
            params![description, id],
        )?;
        Ok(())
    }

    pub fn update_task_name(&self, id: &str, name: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET name = ? WHERE id = ?",
            params![name, id],
        )?;
        Ok(())
    }

    pub fn delete_task(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        // Delete output first due to foreign key
        conn.execute("DELETE FROM task_output WHERE task_id = ?", [id])?;
        conn.execute("DELETE FROM tasks WHERE id = ?", [id])?;
        Ok(())
    }

    // Output log methods
    pub fn append_output(
        &self,
        task_id: &str,
        output_type: &str,
        content: &str,
        tool_name: Option<&str>,
        tool_input: Option<&serde_json::Value>,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Utc::now().to_rfc3339();
        let tool_input_str = tool_input.map(|v| v.to_string());
        conn.execute(
            "INSERT INTO task_output (task_id, output_type, content, timestamp, tool_name, tool_input) VALUES (?, ?, ?, ?, ?, ?)",
            params![task_id, output_type, content, timestamp, tool_name, tool_input_str],
        )?;
        Ok(())
    }

    /// Batch insert multiple output lines in a single transaction
    /// This is much faster than individual inserts for high-throughput scenarios
    pub fn append_output_batch<'a>(
        &self,
        outputs: impl Iterator<Item = (&'a str, &'a str, &'a str, Option<&'a str>, Option<&'a serde_json::Value>, &'a str)>,
    ) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO task_output (task_id, output_type, content, timestamp, tool_name, tool_input) VALUES (?, ?, ?, ?, ?, ?)",
            )?;

            for (task_id, output_type, content, tool_name, tool_input, timestamp) in outputs {
                let tool_input_str = tool_input.map(|v| v.to_string());
                stmt.execute(params![task_id, output_type, content, timestamp, tool_name, tool_input_str])?;
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_task_output(&self, task_id: &str, limit: Option<i64>, offset: Option<i64>) -> Result<Vec<OutputLine>> {
        let conn = self.conn.lock().unwrap();
        let limit = limit.unwrap_or(200);
        let offset = offset.unwrap_or(0);
        let mut stmt = conn.prepare(
            "SELECT output_type, content, timestamp, tool_name, tool_input FROM task_output
             WHERE task_id = ? ORDER BY id ASC LIMIT ? OFFSET ?",
        )?;

        let output = stmt
            .query_map(params![task_id, limit, offset], |row| {
                let tool_input_str: Option<String> = row.get(4)?;
                let tool_input = tool_input_str
                    .and_then(|s| serde_json::from_str(&s).ok());
                Ok(OutputLine {
                    output_type: row.get(0)?,
                    content: row.get(1)?,
                    timestamp: row.get(2)?,
                    tool_name: row.get(3)?,
                    tool_input,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(output)
    }

    /// Get total count of output lines for a task
    pub fn get_task_output_count(&self, task_id: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM task_output WHERE task_id = ?",
            [task_id],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    pub fn clear_task_output(&self, task_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM task_output WHERE task_id = ?", [task_id])?;
        Ok(())
    }

    /// Set takeover state for a task
    pub fn set_takeover_state(
        &self,
        task_id: &str,
        original_branch: &str,
        wip_commit: &str,
        had_stash: bool,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let timestamp = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE tasks SET takeover_original_branch = ?, takeover_wip_commit = ?, takeover_had_stash = ?, takeover_started_at = ? WHERE id = ?",
            params![original_branch, wip_commit, had_stash as i32, timestamp, task_id],
        )?;
        Ok(())
    }

    /// Get takeover state for a task
    pub fn get_takeover_state(&self, task_id: &str) -> Result<Option<TakeoverState>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT takeover_original_branch, takeover_wip_commit, takeover_had_stash, takeover_started_at FROM tasks WHERE id = ?",
        )?;

        let state = stmt
            .query_row([task_id], |row| {
                let original_branch: Option<String> = row.get(0)?;
                let wip_commit: Option<String> = row.get(1)?;
                let had_stash: i32 = row.get(2)?;
                let started_at: Option<String> = row.get(3)?;

                if original_branch.is_some() && wip_commit.is_some() {
                    Ok(Some(TakeoverState {
                        original_branch: original_branch.unwrap(),
                        wip_commit: wip_commit.unwrap(),
                        had_stash: had_stash != 0,
                        started_at,
                    }))
                } else {
                    Ok(None)
                }
            })
            .optional()?
            .flatten();

        Ok(state)
    }

    /// Clear takeover state for a task
    pub fn clear_takeover_state(&self, task_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE tasks SET takeover_original_branch = NULL, takeover_wip_commit = NULL, takeover_had_stash = 0, takeover_started_at = NULL WHERE id = ?",
            [task_id],
        )?;
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct TakeoverState {
    pub original_branch: String,
    pub wip_commit: String,
    pub had_stash: bool,
    pub started_at: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct NotificationEntry {
    pub id: i64,
    pub task_id: Option<String>,
    pub title: String,
    pub body: String,
    pub notification_type: String,
    pub read: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OutputLine {
    pub output_type: String,
    pub content: String,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<serde_json::Value>,
}
