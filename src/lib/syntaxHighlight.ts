import hljs from "highlight.js/lib/core";

// Import common languages
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import bash from "highlight.js/lib/languages/bash";
import rust from "highlight.js/lib/languages/rust";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import scala from "highlight.js/lib/languages/scala";

// Register languages
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("python", python);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("php", php);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("swift", swift);
hljs.registerLanguage("kotlin", kotlin);
hljs.registerLanguage("scala", scala);

// File extension to language mapping
const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mjs": "javascript",
  ".cjs": "javascript",

  // Web
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".sass": "css",
  ".less": "css",

  // Data
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "xml",
  ".svg": "xml",

  // Systems
  ".rs": "rust",
  ".go": "go",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",

  // JVM
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",

  // .NET
  ".cs": "csharp",

  // Scripting
  ".py": "python",
  ".rb": "ruby",
  ".php": "php",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",

  // Mobile
  ".swift": "swift",

  // Documentation
  ".md": "markdown",
  ".markdown": "markdown",

  // SQL
  ".sql": "sql",

  // Config files
  ".toml": "yaml", // Close enough
  ".ini": "yaml",
  ".conf": "bash",
  ".env": "bash",
};

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): string | null {
  if (!filePath) return null;

  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return extensionToLanguage[ext] || null;
}

/**
 * Highlight a single line of code
 * Returns HTML string with syntax highlighting spans
 */
export function highlightLine(code: string, language: string | null): string {
  if (!language || !code) {
    return escapeHtml(code);
  }

  try {
    const result = hljs.highlight(code, { language, ignoreIllegals: true });
    return result.value;
  } catch {
    return escapeHtml(code);
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
