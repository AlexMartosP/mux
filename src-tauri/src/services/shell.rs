use std::collections::HashMap;
use std::process::Command;

/// Get the user's shell environment by running their login shell.
/// This ensures tools like nvm, pyenv, rbenv, etc. are properly initialized.
pub fn get_shell_env() -> Option<HashMap<String, String>> {
    // Get the user's default shell and home directory
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let home = std::env::var("HOME").ok()?;

    // Build a command that sources nvm if available, then prints env
    // This handles the common case where nvm is in .nvm/nvm.sh
    let nvm_script = format!("{home}/.nvm/nvm.sh");

    // Create a script that:
    // 1. Sources the shell's rc file to get basic setup
    // 2. Explicitly sources nvm if it exists
    // 3. Prints the environment
    let script = if shell.contains("zsh") {
        format!(
            r#"
            [ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" 2>/dev/null
            [ -f "{nvm_script}" ] && source "{nvm_script}" 2>/dev/null
            env
            "#
        )
    } else {
        format!(
            r#"
            [ -f "$HOME/.bashrc" ] && source "$HOME/.bashrc" 2>/dev/null
            [ -f "{nvm_script}" ] && source "{nvm_script}" 2>/dev/null
            env
            "#
        )
    };

    // Run as login shell to get profile, then execute our script
    let output = Command::new(&shell)
        .args(["-l", "-c", &script])
        .output()
        .ok()?;

    if !output.status.success() {
        // Fallback to just login shell without sourcing rc files
        let output = Command::new(&shell)
            .args(["-l", "-c", "env"])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        return parse_env_output(&output.stdout);
    }

    parse_env_output(&output.stdout)
}

/// Parse the output of `env` command into a HashMap
fn parse_env_output(output: &[u8]) -> Option<HashMap<String, String>> {
    let env_str = String::from_utf8_lossy(output);
    let mut env_map = HashMap::new();

    for line in env_str.lines() {
        if let Some((key, value)) = line.split_once('=') {
            env_map.insert(key.to_string(), value.to_string());
        }
    }

    Some(env_map)
}

/// Apply the shell environment to a Command, clearing existing env first
pub fn apply_shell_env(cmd: &mut Command) {
    if let Some(env) = get_shell_env() {
        cmd.env_clear();
        for (key, value) in env {
            cmd.env(key, value);
        }
    }
}

/// Create a new Command with the user's shell environment applied
pub fn command_with_shell_env(program: &str) -> Command {
    let mut cmd = Command::new(program);
    apply_shell_env(&mut cmd);
    cmd
}
