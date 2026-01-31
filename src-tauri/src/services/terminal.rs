use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize, SlavePty};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

use crate::error::{AppError, Result};

/// Terminal output event sent to the frontend
#[derive(Clone, serde::Serialize)]
pub struct TerminalOutputEvent {
    pub agent_id: String,
    pub data: String,
}

/// Terminal exit event sent to the frontend
#[derive(Clone, serde::Serialize)]
pub struct TerminalExitEvent {
    pub agent_id: String,
    pub exit_code: Option<u32>,
}

/// A running terminal session
struct TerminalSession {
    #[allow(dead_code)]
    master: Box<dyn MasterPty + Send>,
    #[allow(dead_code)]
    slave: Box<dyn SlavePty + Send>,
    writer: Box<dyn Write + Send>,
    #[allow(dead_code)]
    reader_thread: thread::JoinHandle<()>,
}

/// Service for managing terminal sessions
pub struct TerminalService {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl TerminalService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Open a new terminal session for a task
    pub fn open(
        &self,
        app_handle: AppHandle,
        task_id: &str,
        working_dir: &str,
    ) -> Result<()> {
        // Check if session already exists
        {
            let sessions = self.sessions.lock().unwrap();
            if sessions.contains_key(task_id) {
                log::info!("Terminal session already exists for task {}", task_id);
                return Ok(());
            }
        }

        log::info!("Opening terminal for task {} in {}", task_id, working_dir);

        let pty_system = native_pty_system();

        // Create PTY pair
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Other(format!("Failed to open PTY: {}", e)))?;

        // Get user's preferred shell
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        log::info!("Using shell: {}", shell);

        // Build command - force interactive mode
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-i");
        cmd.cwd(working_dir);

        // Copy ALL environment variables from parent process
        for (key, value) in std::env::vars() {
            cmd.env(key, value);
        }

        // Terminal identification - these help tools detect a proper terminal
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "mux");
        cmd.env("TERM_PROGRAM_VERSION", "1.0");

        // Ensure shell knows it's interactive
        cmd.env("SHELL", &shell);

        // Disable Powerlevel10k instant prompt which can cause issues in PTY
        cmd.env("POWERLEVEL9K_INSTANT_PROMPT", "off");
        cmd.env("P9K_TTY", "old"); // Tell p10k to use old TTY detection

        // Disable some shell features that might interfere
        cmd.env("DISABLE_AUTO_UPDATE", "true"); // oh-my-zsh
        cmd.env("ZSH_DISABLE_COMPFIX", "true"); // zsh completion warnings

        // Starship prompt compatibility
        cmd.env("STARSHIP_SHELL", &shell);

        // Spawn the shell on the slave
        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Other(format!("Failed to spawn shell: {}", e)))?;

        // Monitor child process in a separate thread to log exit status
        let task_id_for_monitor = task_id.to_string();
        thread::spawn(move || {
            match child.wait() {
                Ok(status) => {
                    log::info!(
                        "Shell process for task {} exited with status: {:?}",
                        task_id_for_monitor,
                        status
                    );
                }
                Err(e) => {
                    log::error!(
                        "Failed to wait on shell process for task {}: {}",
                        task_id_for_monitor,
                        e
                    );
                }
            }
        });

        // Note: We intentionally do NOT drop the slave here.
        // On macOS, dropping the slave too early can cause issues with shell initialization.
        // The slave will be dropped when the session is closed.

        // Get writer for input
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Other(format!("Failed to get PTY writer: {}", e)))?;

        // Get reader for output
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Other(format!("Failed to get PTY reader: {}", e)))?;

        // Spawn thread to read output and send to frontend
        let task_id_clone = task_id.to_string();
        let app_handle_clone = app_handle.clone();
        let sessions_clone = Arc::clone(&self.sessions);

        let reader_thread = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF - terminal closed
                        log::info!("Terminal EOF for task {}", task_id_clone);
                        let _ = app_handle_clone.emit(
                            "terminal-exit",
                            TerminalExitEvent {
                                agent_id: task_id_clone.clone(),
                                exit_code: None,
                            },
                        );
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_handle_clone.emit(
                            "terminal-output",
                            TerminalOutputEvent {
                                agent_id: task_id_clone.clone(),
                                data,
                            },
                        );
                    }
                    Err(e) => {
                        log::error!("Terminal read error for task {}: {}", task_id_clone, e);
                        let _ = app_handle_clone.emit(
                            "terminal-exit",
                            TerminalExitEvent {
                                agent_id: task_id_clone.clone(),
                                exit_code: None,
                            },
                        );
                        break;
                    }
                }
            }

            // Clean up session
            let mut sessions = sessions_clone.lock().unwrap();
            sessions.remove(&task_id_clone);
            log::info!("Terminal session cleaned up for task {}", task_id_clone);
        });

        // Store session - keep master and slave alive
        let session = TerminalSession {
            master: pair.master,
            slave: pair.slave,
            writer,
            reader_thread,
        };

        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(task_id.to_string(), session);

        log::info!("Terminal session created for task {}", task_id);
        Ok(())
    }

    /// Send input to a terminal session
    pub fn input(&self, task_id: &str, data: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(task_id)
            .ok_or_else(|| AppError::Other(format!("No terminal session for task {}", task_id)))?;

        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| AppError::Other(format!("Failed to write to terminal: {}", e)))?;

        session
            .writer
            .flush()
            .map_err(|e| AppError::Other(format!("Failed to flush terminal: {}", e)))?;

        Ok(())
    }

    /// Resize a terminal session
    pub fn resize(&self, task_id: &str, cols: u16, rows: u16) -> Result<()> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(task_id)
            .ok_or_else(|| AppError::Other(format!("No terminal session for task {}", task_id)))?;

        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| AppError::Other(format!("Failed to resize terminal: {}", e)))?;

        Ok(())
    }

    /// Close a terminal session
    pub fn close(&self, task_id: &str) -> Result<()> {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions.remove(task_id).is_some() {
            log::info!("Terminal session closed for task {}", task_id);
        }
        Ok(())
    }

    /// Check if a terminal session exists for a task
    pub fn has_session(&self, task_id: &str) -> bool {
        let sessions = self.sessions.lock().unwrap();
        sessions.contains_key(task_id)
    }
}
