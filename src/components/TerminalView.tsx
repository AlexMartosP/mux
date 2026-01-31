import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import * as tauri from "../lib/tauri";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputEvent {
  agent_id: string;
  data: string;
}

interface TerminalExitEvent {
  agent_id: string;
  exit_code: number | null;
}

export interface TerminalViewProps {
  agentId: string;
}

export function TerminalView({ agentId }: TerminalViewProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance with proper dark theme colors
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "Geist Mono, JetBrains Mono, SF Mono, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.4,
      theme: {
        background: "#0a0a0a", // --background
        foreground: "#fafafa", // --foreground
        cursor: "#06b6d4", // cyan accent
        cursorAccent: "#0a0a0a",
        selectionBackground: "rgba(6, 182, 212, 0.2)",
        selectionForeground: "#fafafa",
        black: "#1e1e1e",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#ec4899",
        cyan: "#06b6d4",
        white: "#f5f5f5",
        brightBlack: "#525252",
        brightRed: "#f87171",
        brightGreen: "#4ade80",
        brightYellow: "#facc15",
        brightBlue: "#60a5fa",
        brightMagenta: "#f472b6",
        brightCyan: "#22d3ee",
        brightWhite: "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Open terminal in DOM
    term.open(terminalRef.current);
    fitAddon.fit();

    // Handle terminal input
    const onDataDisposable = term.onData((data) => {
      tauri.terminalInput(agentId, data).catch(console.error);
    });

    // Handle terminal resize
    const onResizeDisposable = term.onResize(({ cols, rows }) => {
      tauri.terminalResize(agentId, cols, rows).catch(console.error);
    });

    // Listen for output from backend
    const outputUnlisten = listen<TerminalOutputEvent>("terminal-output", (event) => {
      if (event.payload.agent_id === agentId) {
        term.write(event.payload.data);
      }
    });

    // Listen for terminal exit
    const exitUnlisten = listen<TerminalExitEvent>("terminal-exit", (event) => {
      if (event.payload.agent_id === agentId) {
        setIsConnected(false);
        term.writeln("\r\n\x1b[33mTerminal session ended.\x1b[0m");
      }
    });

    // Open backend terminal (or reconnect to existing session)
    const openBackendTerminal = async () => {
      try {
        const { session_existed } = await tauri.openTerminal(agentId);
        setIsConnected(true);
        setError(null);

        // If reconnecting to existing session, restore the buffered output
        if (session_existed) {
          const buffer = await tauri.getTerminalBuffer(agentId);
          if (buffer) {
            term.write(buffer);
          }
        }

        // Send initial resize after a short delay to let shell initialize
        setTimeout(async () => {
          try {
            await tauri.terminalResize(agentId, term.cols, term.rows);
          } catch {
            // Ignore resize errors
          }
        }, 100);
      } catch (err) {
        setError(String(err));
        term.writeln(`\x1b[31mFailed to open terminal: ${err}\x1b[0m`);
      }
    };

    openBackendTerminal();

    // Handle window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    // Cleanup - don't close backend terminal, just cleanup frontend resources
    // This allows the terminal session to persist when navigating between agents
    return () => {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      outputUnlisten.then((fn) => fn());
      exitUnlisten.then((fn) => fn());
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      term.dispose();
      // Note: We intentionally don't call closeTerminal here
      // The session persists and will be reconnected when returning to this agent
    };
  }, [agentId]);

  return (
    <div className="flex flex-col h-full">
      {/* Status bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 text-xs"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Terminal</span>
        <span
          style={{
            color: isConnected ? "var(--accent-green)" : "var(--text-dim)",
          }}
        >
          {isConnected ? "Connected" : error ? "Error" : "Connecting..."}
        </span>
      </div>

      {/* Terminal container */}
      <div
        ref={terminalRef}
        className="flex-1 p-2"
        style={{
          backgroundColor: "var(--bg-primary)",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
