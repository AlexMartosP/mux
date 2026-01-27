#!/usr/bin/env node
/**
 * Claude Code Permission Request Hook
 *
 * This script receives permission requests from Claude Code and forwards them
 * to the Agent Coordinator app for user approval.
 */

const net = require('net');
const crypto = require('crypto');
const fs = require('fs');

const IPC_PORT = parseInt(process.env.MUX_IPC_PORT || '19532', 10);
const IPC_HOST = '127.0.0.1';
const DEBUG = process.env.DEBUG_PERMISSION_HOOK === '1';
const LOG_FILE = '/tmp/permission-hook.log';

// Always log to file for debugging
function log(...args) {
  const msg = new Date().toISOString() + ' ' + args.join(' ') + '\n';
  fs.appendFileSync(LOG_FILE, msg);
  if (DEBUG) {
    console.error('[DEBUG]', ...args);
  }
}

// Collect all stdin data
async function readStdin() {
  return new Promise((resolve) => {
    let data = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    // Handle case where stdin is already closed or empty
    setTimeout(() => {
      if (!data) {
        resolve('');
      }
    }, 100);
  });
}

async function sendToIPC(command) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let responseData = '';

    client.setTimeout(300000); // 5 minute timeout

    client.on('connect', () => {
      log('Connected to IPC server');
      const payload = JSON.stringify(command) + '\n';
      log('Sending:', payload.substring(0, 200));
      client.write(payload);
    });

    client.on('data', (data) => {
      responseData += data.toString();
      log('Received data:', data.toString().substring(0, 100));

      // Check if we have a complete JSON response (ends with newline)
      if (responseData.includes('\n')) {
        client.destroy();
        try {
          const response = JSON.parse(responseData.trim());
          resolve(response);
        } catch (e) {
          log('JSON parse error:', e.message);
          reject(new Error('Invalid response from IPC server'));
        }
      }
    });

    client.on('timeout', () => {
      log('Connection timeout');
      client.destroy();
      reject(new Error('IPC timeout'));
    });

    client.on('error', (err) => {
      log('Connection error:', err.message);
      reject(err);
    });

    client.on('close', () => {
      log('Connection closed, responseData:', responseData.length, 'bytes');
      if (!responseData) {
        reject(new Error('Connection closed without response'));
      }
    });

    log('Connecting to', IPC_HOST + ':' + IPC_PORT);
    client.connect(IPC_PORT, IPC_HOST);
  });
}

async function main() {
  log('Hook script started, PID:', process.pid);

  // Check if this is a Mux-managed Claude instance
  const taskId = process.env.AGENT_COORDINATOR_TASK_ID;

  if (!taskId) {
    // Not a Mux-managed instance - exit silently without intervention
    log('Not a Mux-managed instance (no AGENT_COORDINATOR_TASK_ID), exiting');
    process.exit(1);
  }

  try {
    // Read all stdin
    const input = await readStdin();
    log('stdin received:', input.length, 'bytes');
    log('stdin content:', input.substring(0, 500));

    if (!input || input.trim() === '') {
      throw new Error('No input received from stdin');
    }

    const hookInput = JSON.parse(input);
    log('Parsed input successfully');

    // Extract relevant info from hook input
    const toolName = hookInput.tool_name || hookInput.toolName || 'unknown';
    const toolInput = hookInput.tool_input || hookInput.toolInput || hookInput.input || {};

    log('Task ID:', taskId);
    log('Tool:', toolName);

    const requestId = crypto.randomUUID();

    // Create IPC command
    const ipcCommand = {
      command: 'permission_request',
      request_id: requestId,
      task_id: taskId,
      tool_name: toolName,
      tool_input: toolInput
    };

    log('Sending IPC command');

    // Send to IPC server and wait for response
    const response = await sendToIPC(ipcCommand);
    log('Got response:', JSON.stringify(response).substring(0, 200));

    // Output the response for Claude Code
    console.log(JSON.stringify(response));
    process.exit(0);

  } catch (error) {
    log('Error:', error.message);
    if (error.stack) log('Stack:', error.stack);

    // On error, output a deny response in PreToolUse format
    const errorResponse = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `Hook error: ${error.message}`
      }
    };
    console.log(JSON.stringify(errorResponse));
    process.exit(0);
  }
}

main();
