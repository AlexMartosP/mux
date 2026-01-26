import { spawn } from "child_process";
import * as readline from "readline";

function messageToJson(prompt: string): string {
  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: prompt }],
    },
  });
}

// Get prompt from command line args or use default
const prompt = process.argv[2] || "Hello, what can you do?";

console.log("=".repeat(60));
console.log("Claude CLI Tester");
console.log("=".repeat(60));
console.log(`Prompt: ${prompt}`);
console.log("=".repeat(60));
console.log("");

// Spawn claude CLI with the prompt
// Using stream-json format to see structured output
const claude = spawn("claude", [
  "--print",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
], {
  cwd: process.cwd(),
  env: process.env,
});

// Setup readline for user input (to respond to permission prompts)
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Track if we're waiting for user input
let waitingForInput = false;

claude.on("spawn", () => {
  console.log("Claude CLI spawned");
});

claude.on("message", (message: string) => {
  console.log(`[MESSAGE] ${message}`);
});

claude.on("exit", (code: number) => {
  console.log(`Claude CLI exited with code: ${code}`);
});

claude.on("data", (data: Buffer) => {
  console.log(`[DATA] ${data.toString()}`);
});

claude.stdin.write(messageToJson(prompt) + "\n");

// Handle stdout - this is where JSON messages come
claude.stdout.on("data", (data: Buffer) => {
  const text = data.toString();

  // Try to parse each line as JSON
  const lines = text.split("\n").filter(line => line.trim());

  for (const line of lines) {
    try {
      const json = JSON.parse(line);
      console.log("\n[STDOUT JSON]", JSON.stringify(json, null, 2));

      // Check for permission-related messages
      if (json.type === "assistant" && json.message?.content) {
        for (const block of json.message.content) {
          if (block.type === "tool_use") {
            console.log(`\n[TOOL USE] ${block.name}`);
            console.log(`  Input: ${JSON.stringify(block.input, null, 2)}`);
          }
        }
      }

      if (json.type === "user" && json.message?.content) {
        for (const block of json.message.content) {
          if (block.type === "tool_result" && block.is_error === false) {
            console.log(`[RESULT] ${block.text}`);
          }

          if (block.type === "tool_result" && block.is_error === true) {
            console.log(`[ERROR] ${block.content}`);

            // Check if this looks like a permission prompt
            const lowerText = block.content.toLowerCase();
            if (
              lowerText.includes("permission") ||
              lowerText.includes("allow") ||
              lowerText.includes("deny") ||
              lowerText.includes("y/n") ||
              lowerText.includes("[y]") ||
              lowerText.includes("[n]") || 
              lowerText.includes("approval")
            ) {
              console.log("\n>>> PERMISSION PROMPT DETECTED <<<");
              waitingForInput = true;

              rl.question("Your response (y/n/yes/no): ", (answer) => {
                waitingForInput = false;
                console.log(`[SENDING TO STDIN]: ${answer}`);
                claude.stdin.write(messageToJson(JSON.stringify({ behavior: "allow" })) + "\n");
              });
            }
          }
        }
      }
    } catch {
      // Not JSON, print as-is
      if (line.trim()) {
        console.log("[STDOUT]", line);
      }
    }
  }
});


// Handle stderr - this is where permission prompts and other messages appear
claude.stderr.on("data", (data: Buffer) => {
  const text = data.toString();
  console.log("\n[STDERR]", text);

  // Check if this looks like a permission prompt
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes("permission") ||
    lowerText.includes("allow") ||
    lowerText.includes("deny") ||
    lowerText.includes("y/n") ||
    lowerText.includes("[y]") ||
    lowerText.includes("[n]")
  ) {
    console.log("\n>>> PERMISSION PROMPT DETECTED <<<");
    waitingForInput = true;

    rl.question("Your response (y/n/yes/no): ", (answer) => {
      waitingForInput = false;
      console.log(`[SENDING TO STDIN]: ${answer}`);
      claude.stdin.write(answer + "\n");
    });
  }
});

// Handle process exit
claude.on("close", (code) => {
  console.log("\n" + "=".repeat(60));
  console.log(`Claude CLI exited with code: ${code}`);
  console.log("=".repeat(60));
  rl.close();
  process.exit(code || 0);
});

// Handle errors
claude.on("error", (err) => {
  console.error("\n[ERROR] Failed to spawn claude:", err.message);
  rl.close();
  process.exit(1);
});

// Allow manual input at any time by pressing Enter
process.stdin.on("data", (data) => {
  if (!waitingForInput) {
    const input = data.toString().trim();
    if (input) {
      console.log(`[MANUAL INPUT]: ${input}`);
      claude.stdin.write(input + "\n");
    }
  }
});

// Handle SIGINT (Ctrl+C)
process.on("SIGINT", () => {
  console.log("\n[SIGINT] Terminating claude process...");
  claude.kill("SIGTERM");
  setTimeout(() => {
    claude.kill("SIGKILL");
    process.exit(0);
  }, 1000);
});

console.log("Claude CLI spawned. Waiting for output...");
console.log("(You can type and press Enter to send input manually)");
console.log("");
