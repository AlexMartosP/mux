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
  const openedRef = useRef<string | null>(null); // Track which agent's terminal is open
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Prevent duplicate opens for the same task
    if (openedRef.current === agentId) {
      return;
    }

    // Create terminal instance
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, SF Mono, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.2,
      theme: {
        background: "var(--bg-primary)",
        foreground: "var(--text-primary)",
        cursor: "var(--accent-cyan)",
        cursorAccent: "var(--bg-primary)",
        selectionBackground: "var(--bg-accent-subtle)",
        black: "#1e1e1e",
        red: "#f44336",
        green: "#4caf50",
        yellow: "#ffeb3b",
        blue: "#2196f3",
        magenta: "#e91e63",
        cyan: "#00bcd4",
        white: "#ffffff",
        brightBlack: "#424242",
        brightRed: "#ff5252",
        brightGreen: "#69f0ae",
        brightYellow: "#ffff00",
        brightBlue: "#448aff",
        brightMagenta: "#ff4081",
        brightCyan: "#18ffff",
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

    // Open backend terminal
    const openBackendTerminal = async () => {
      try {
        await tauri.openTerminal(agentId);
        openedRef.current = agentId; // Mark as opened
        setIsConnected(true);
        setError(null);

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
    // This allows the terminal session to persist when navigating between tasks
    return () => {
      onDataDisposable.dispose();
      onResizeDisposable.dispose();
      outputUnlisten.then((fn) => fn());
      exitUnlisten.then((fn) => fn());
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      term.dispose();
      // Note: We intentionally don't call closeTerminal here
      // The session persists and will be reconnected when returning to this task
      openedRef.current = null;
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
