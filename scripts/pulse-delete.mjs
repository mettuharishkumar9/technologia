#!/usr/bin/env node
// Delete a previously-published LinkedIn post by its share URN.
// Uses Composio's LINKEDIN_DELETE_LINKED_IN_POST tool (param: share_id, accepts URN).
//
// Usage:
//   node pulse-delete.mjs <share-urn-or-id>
// Examples:
//   node pulse-delete.mjs urn:li:share:7458636794973028352
//   node pulse-delete.mjs 7458636794973028352

import https from "node:https";
import process from "node:process";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Load .env from skill root (Node 20.6+ has process.loadEnvFile)
{
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = path.join(skillRoot, ".env");
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  }
}
const COMPOSIO_KEY = process.env.COMPOSIO_API_KEY;
const MCP_HOST = process.env.COMPOSIO_MCP_HOST || "connect.composio.dev";
const MCP_PATH = process.env.COMPOSIO_MCP_PATH || "/mcp";
if (!COMPOSIO_KEY) {
  console.error("Missing COMPOSIO_API_KEY in env. Set it in ~/.claude/skills/databricks-pulse/.env");
  process.exit(2);
}

if (process.argv.length < 3) {
  console.error("Usage: node pulse-delete.mjs <share-urn-or-id>");
  process.exit(2);
}
const shareId = process.argv[2];

const log = (m) => console.log(`[${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}] ${m}`);

function httpsPost(host, urlPath, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = typeof body === "string" ? Buffer.from(body) : body;
    const opts = { hostname: host, path: urlPath, method: "POST", headers: { ...headers, "Content-Length": buf.length } };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

async function mcpCall(toolName, mcpArgs) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name: toolName, arguments: mcpArgs } });
  const res = await httpsPost(MCP_HOST, MCP_PATH, {
    "x-consumer-api-key": COMPOSIO_KEY,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  }, body);
  const lines = res.body.trim().split("\n");
  for (const line of lines) {
    if (line.startsWith("data:")) {
      const json = JSON.parse(line.slice(6));
      const text = json?.result?.content?.[0]?.text;
      if (text) return JSON.parse(text);
    }
  }
  throw new Error(`MCP call ${toolName} returned no data. Body: ${res.body.slice(0, 500)}`);
}

async function main() {
  log(`Deleting LinkedIn post: ${shareId}`);
  const res = await mcpCall("COMPOSIO_MULTI_EXECUTE_TOOL", {
    tools: [{ tool_slug: "LINKEDIN_DELETE_LINKED_IN_POST", arguments: { share_id: shareId } }],
    sync_response_to_workbench: false,
    thought: "Delete LinkedIn post for re-publish",
    current_step: "DELETING_LINKEDIN_POST",
  });
  const result = res?.data?.results?.[0]?.response;
  if (!result?.successful) {
    throw new Error(`Delete failed: ${JSON.stringify(res).slice(0, 600)}`);
  }
  log(`✓ Deleted ${shareId}`);
  log(`  Response: ${JSON.stringify(result?.data || {}).slice(0, 200)}`);
}

main().catch((err) => {
  log(`ERROR: ${err.message}`);
  process.exit(1);
});
