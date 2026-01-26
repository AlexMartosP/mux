import { useState, useMemo } from "react";
import Markdown from "react-markdown";
import type { OutputLine } from "../types/task";

interface OutputRendererProps {
  output: OutputLine[];
  isRunning: boolean;
}

interface OutputSection {
  type: "text" | "tool" | "result" | "system" | "thinking";
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
}

export function OutputRenderer({ output, isRunning }: OutputRendererProps) {
  const sections = useMemo(() => {
    const result: OutputSection[] = [];
    let currentTextContent = "";

    for (const line of output) {
      if (line.output_type === "text") {
        currentTextContent += (currentTextContent ? "\n" : "") + line.content;
      } else {
        if (currentTextContent) {
          result.push({ type: "text", content: currentTextContent });
          currentTextContent = "";
        }

        if (line.output_type === "tool") {
          result.push({
            type: "tool",
            content: line.content,
            toolName: line.tool_name || extractToolName(line.content),
            toolInput: line.tool_input,
          });
        } else if (line.output_type === "result") {
          result.push({ type: "result", content: line.content });
        } else if (line.output_type === "system") {
          result.push({ type: "system", content: line.content });
        } else if (line.output_type === "thinking") {
          result.push({ type: "thinking", content: line.content });
        }
      }
    }

    if (currentTextContent) {
      result.push({ type: "text", content: currentTextContent });
    }

    return result;
  }, [output]);

  if (sections.length === 0 && !isRunning) {
    return null;
  }

  return (
    <div className="space-y-3">
      {sections.map((section, index) => (
        <Section key={index} section={section} />
      ))}
      {isRunning && sections.length === 0 && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
          <span className="animate-pulse">▌</span>
          <span>Thinking...</span>
        </div>
      )}
      {isRunning && sections.length > 0 && (
        <span
          className="inline-block w-2 h-4 animate-pulse"
          style={{ backgroundColor: 'var(--accent-green)' }}
        />
      )}
    </div>
  );
}

function Section({ section }: { section: OutputSection }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (section.type === "thinking") {
    return (
      <ThinkingSection
        content={section.content}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
    );
  }

  if (section.type === "text") {
    return (
      <div className="prose prose-invert max-w-none" style={{ fontSize: 'var(--font-xs)' }}>
        <Markdown
          components={{
            pre: ({ children }) => (
              <pre
                className="p-3 overflow-x-auto text-xs"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                }}
              >
                {children}
              </pre>
            ),
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              return isInline ? (
                <code
                  className="px-1 py-0.5 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                  }}
                  {...props}
                >
                  {children}
                </code>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            a: ({ children, href }) => (
              <a
                href={href}
                style={{ color: 'var(--accent-cyan)' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-4 space-y-1">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-4 space-y-1">{children}</ol>
            ),
            li: ({ children }) => (
              <li style={{ color: 'var(--text-primary)' }}>{children}</li>
            ),
            p: ({ children }) => (
              <p className="mb-2 last:mb-0" style={{ color: 'var(--text-primary)' }}>{children}</p>
            ),
            h1: ({ children }) => (
              <h1 className="font-bold mt-4 mb-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--font-base)' }}>{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="font-bold mt-3 mb-2" style={{ color: 'var(--text-primary)', fontSize: 'var(--font-sm)' }}>{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-bold mt-2 mb-1" style={{ color: 'var(--text-primary)', fontSize: 'var(--font-xs)' }}>{children}</h3>
            ),
            blockquote: ({ children }) => (
              <blockquote
                className="pl-3 italic"
                style={{
                  borderLeft: '2px solid var(--border-active)',
                  color: 'var(--text-secondary)',
                }}
              >
                {children}
              </blockquote>
            ),
          }}
        >
          {section.content}
        </Markdown>
      </div>
    );
  }

  if (section.type === "tool") {
    return (
      <ToolSection
        content={section.content}
        toolName={section.toolName}
        toolInput={section.toolInput}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
    );
  }

  if (section.type === "result") {
    return (
      <div
        className="text-xs px-3 py-2"
        style={{
          backgroundColor: 'rgba(0, 255, 0, 0.05)',
          borderLeft: '2px solid var(--accent-green)',
          color: 'var(--accent-green)',
        }}
      >
        {section.content}
      </div>
    );
  }

  if (section.type === "system") {
    return (
      <div className="text-xs italic" style={{ color: 'var(--text-dim)' }}>
        {section.content}
      </div>
    );
  }

  return null;
}

function ThinkingSection({
  content,
  isExpanded,
  onToggle,
}: {
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  // Truncate preview to first 100 chars
  const preview = content.length > 100 ? content.slice(0, 100) + "..." : content;

  return (
    <div
      className="text-xs"
      style={{
        backgroundColor: 'rgba(128, 128, 128, 0.1)',
        borderLeft: '2px solid var(--text-dim)',
      }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/5"
      >
        <span style={{ color: 'var(--text-dim)' }}>[~]</span>
        <span className="flex-1 truncate" style={{ color: 'var(--text-dim)' }}>
          {isExpanded ? "Thinking" : preview}
        </span>
        <span
          className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
          style={{ color: 'var(--text-dim)' }}
        >
          ▼
        </span>
      </button>
      {isExpanded && (
        <div
          className="px-3 pb-3 whitespace-pre-wrap"
          style={{ color: 'var(--text-secondary)' }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

function ToolSection({
  content,
  toolName,
  toolInput,
  isExpanded,
  onToggle,
}: {
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const indicator = getToolIndicator(toolName);
  const color = getToolColor(toolName);

  return (
    <div
      className="text-xs"
      style={{
        backgroundColor: `${color}10`,
        borderLeft: `2px solid ${color}`,
      }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left flex items-center gap-2 px-3 py-2 transition-colors hover:bg-white/5"
        style={{ color: color }}
      >
        <span>[{indicator}]</span>
        <span className="flex-1">{content}</span>
        {toolInput && (
          <span className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
        )}
      </button>
      {isExpanded && toolInput && (
        <div className="px-3 pb-3">
          <ToolInputDetails toolName={toolName} toolInput={toolInput} />
        </div>
      )}
    </div>
  );
}

// Helper to safely get string from unknown
function str(value: unknown): string {
  return value != null ? String(value) : '';
}

// Helper to truncate and show ellipsis
function truncate(value: unknown, maxLen: number): string {
  const s = str(value);
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

function ToolInputDetails({
  toolName,
  toolInput,
}: {
  toolName?: string;
  toolInput: Record<string, unknown>;
}) {
  const filePath = str(toolInput.file_path);
  const offset = toolInput.offset != null ? str(toolInput.offset) : null;
  const limit = toolInput.limit != null ? str(toolInput.limit) : null;
  const content = toolInput.content != null ? str(toolInput.content) : null;
  const oldString = toolInput.old_string != null ? str(toolInput.old_string) : null;
  const newString = toolInput.new_string != null ? str(toolInput.new_string) : null;
  const command = str(toolInput.command);
  const description = toolInput.description != null ? str(toolInput.description) : null;
  const pattern = str(toolInput.pattern);
  const path = toolInput.path != null ? str(toolInput.path) : null;
  const glob = toolInput.glob != null ? str(toolInput.glob) : null;
  const prompt = toolInput.prompt != null ? str(toolInput.prompt) : null;

  // Format tool-specific details
  switch (toolName) {
    case "Read":
      return (
        <div className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div><span style={{ color: 'var(--text-dim)' }}>file:</span> {filePath}</div>
          {offset && <div><span style={{ color: 'var(--text-dim)' }}>offset:</span> {offset}</div>}
          {limit && <div><span style={{ color: 'var(--text-dim)' }}>limit:</span> {limit}</div>}
        </div>
      );
    case "Write":
      return (
        <div className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div><span style={{ color: 'var(--text-dim)' }}>file:</span> {filePath}</div>
          {content && (
            <div>
              <span style={{ color: 'var(--text-dim)' }}>content:</span>
              <pre
                className="mt-1 p-2 overflow-x-auto max-h-40 overflow-y-auto"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                }}
              >
                {truncate(content, 500)}
              </pre>
            </div>
          )}
        </div>
      );
    case "Edit":
      return (
        <div className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div><span style={{ color: 'var(--text-dim)' }}>file:</span> {filePath}</div>
          {oldString && (
            <div>
              <span style={{ color: 'var(--text-dim)' }}>old:</span>
              <pre
                className="mt-1 p-2 overflow-x-auto max-h-20 overflow-y-auto"
                style={{
                  backgroundColor: 'rgba(255, 68, 68, 0.1)',
                  border: '1px solid var(--accent-red)',
                }}
              >
                {truncate(oldString, 200)}
              </pre>
            </div>
          )}
          {newString && (
            <div>
              <span style={{ color: 'var(--text-dim)' }}>new:</span>
              <pre
                className="mt-1 p-2 overflow-x-auto max-h-20 overflow-y-auto"
                style={{
                  backgroundColor: 'rgba(0, 255, 0, 0.1)',
                  border: '1px solid var(--accent-green)',
                }}
              >
                {truncate(newString, 200)}
              </pre>
            </div>
          )}
        </div>
      );
    case "Bash":
      return (
        <div className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>command:</span>
            <pre
              className="mt-1 p-2 overflow-x-auto"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
              }}
            >
              {command}
            </pre>
          </div>
          {description && (
            <div><span style={{ color: 'var(--text-dim)' }}>description:</span> {description}</div>
          )}
        </div>
      );
    case "Glob":
    case "Search":
      return (
        <div className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div><span style={{ color: 'var(--text-dim)' }}>pattern:</span> {pattern}</div>
          {path && <div><span style={{ color: 'var(--text-dim)' }}>path:</span> {path}</div>}
        </div>
      );
    case "Grep":
      return (
        <div className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <div><span style={{ color: 'var(--text-dim)' }}>pattern:</span> {pattern}</div>
          {path && <div><span style={{ color: 'var(--text-dim)' }}>path:</span> {path}</div>}
          {glob && <div><span style={{ color: 'var(--text-dim)' }}>glob:</span> {glob}</div>}
        </div>
      );
    case "Task":
      return (
        <div className="space-y-1" style={{ color: 'var(--text-secondary)' }}>
          {description && <div><span style={{ color: 'var(--text-dim)' }}>description:</span> {description}</div>}
          {prompt && (
            <div>
              <span style={{ color: 'var(--text-dim)' }}>prompt:</span>
              <pre
                className="mt-1 p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                }}
              >
                {truncate(prompt, 500)}
              </pre>
            </div>
          )}
        </div>
      );
    default:
      // Generic JSON display for unknown tools
      return (
        <pre
          className="p-2 overflow-x-auto max-h-40 overflow-y-auto"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
          }}
        >
          {JSON.stringify(toolInput, null, 2)}
        </pre>
      );
  }
}

function extractToolName(content: string): string | undefined {
  if (content.startsWith("Reading")) return "Read";
  if (content.startsWith("Writing")) return "Write";
  if (content.startsWith("Editing")) return "Edit";
  if (content.startsWith("Running:")) return "Bash";
  if (content.startsWith("Searching") || content.startsWith("Finding")) return "Search";
  if (content.startsWith("Spawning agent")) return "Task";
  if (content.startsWith("Fetching")) return "WebFetch";
  if (content.startsWith("Updating task")) return "TodoWrite";
  return undefined;
}

function getToolIndicator(toolName?: string): string {
  switch (toolName) {
    case "Read": return "R";
    case "Write": return "W";
    case "Edit": return "E";
    case "Bash": return "$";
    case "Search": return "?";
    case "Task": return "T";
    case "WebFetch": return "@";
    case "TodoWrite": return "L";
    default: return ">";
  }
}

function getToolColor(toolName?: string): string {
  switch (toolName) {
    case "Read":
      return "var(--accent-cyan)";
    case "Write":
    case "Edit":
      return "var(--accent-green)";
    case "Bash":
      return "var(--accent-magenta)";
    case "Search":
      return "var(--accent-cyan)";
    case "Task":
      return "var(--accent-yellow)";
    case "WebFetch":
      return "var(--accent-magenta)";
    default:
      return "var(--text-secondary)";
  }
}
