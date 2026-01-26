use crate::error::Result;
use std::process::Command;

/// Open a path in the specified editor (vscode or cursor)
#[tauri::command]
pub fn open_in_editor(path: String, editor: String) -> Result<()> {
    let cmd = match editor.as_str() {
        "vscode" => "code",
        "cursor" => "cursor",
        _ => return Err(crate::error::AppError::Other(format!("Unknown editor: {}", editor))),
    };

    Command::new(cmd)
        .arg(&path)
        .spawn()
        .map_err(|e| crate::error::AppError::Other(format!("Failed to open {}: {}", editor, e)))?;

    Ok(())
}
