/**
 * mcp-memory-bridge.js
 * Minimal memory MCP bridge for xdc.aipi.com
 *
 * Usage:
 *   npm init -y
 *   npm i express better-sqlite3 cors dotenv node-fetch
 *   node mcp-memory-bridge.js
 *
 * Deploy on a host supporting long-lived SSE connections (Render, Heroku, Fly, DigitalOcean).
 */

import express from "express";
import fs from "fs";
import Database from "better-sqlite3";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.MCP_BRIDGE_TOKEN || "change-me";
const OPENAI_KEY = process.env.OPENAI_API_KEY || ""; // optional

// --- DB setup (file: memories.db) ---
const dbFile = "./memories.db";
const initDb = () => {
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  db.prepare(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      type TEXT,
      tags TEXT,
      text TEXT NOT NULL,
      meta TEXT,
      embedding TEXT
    )
  `).run();
  return db;
};
const db = initDb();


// Prepared statements
const insertStmt = db.prepare("INSERT INTO memories (ts,type,tags,text,meta) VALUES (@ts,@type,@tags,@text,@meta)");
const selectAllStmt = db.prepare("SELECT * FROM memories ORDER BY id DESC LIMIT ?");
const selectSinceStmt = db.prepare("SELECT * FROM memories WHERE id <= ? ORDER BY id DESC LIMIT ?");
const searchStmt = db.prepare("SELECT * FROM memories WHERE text LIKE @q OR tags LIKE @q ORDER BY id DESC LIMIT @limit");
const getById = db.prepare("SELECT * FROM memories WHERE id = ?");
const deleteStmt = db.prepare("DELETE FROM memories WHERE id = ?");

// --- App ---
const app = express();
app.use(express.json());
app.use(cors());

function requireAuth(req, res, next) {
  // Accept token from header OR query parameter
  const token = req.header("x-mcp-token") || req.query.token;
  if (!token || token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}


// Helper: format SSE event
function sseFormat(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// Optional OpenAI summarization
async function synthSummary(items) {
  if (!OPENAI_KEY) return null;
  const prompt = `You are a helpful assistant. Summarize these memory items into a short friendly list (3 bullets max):\n\n${JSON.stringify(items.map(i=>({id:i.id, ts:i.ts, text:i.text, tags:i.tags})),null,2)}`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1", // replace with available model if needed
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      }),
    });
    const j = await resp.json();
    const text = j?.choices?.[0]?.message?.content ?? null;
    return text;
  } catch (e) {
    console.warn("OpenAI summary failed", e);
    return null;
  }
}

// SSE endpoint: xdc connects here
app.get("/mcp/sse", requireAuth, async (req, res) => {
  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // consider limiting CORS origins in prod
  });

  // send a welcome / protocol event
  res.write(sseFormat({ type: "mcp_welcome", ts: new Date().toISOString(), msg: "Beebo memory bridge connected" }));

  // stream the most recent N memories
  const limit = parseInt(req.query.limit || "50", 10);
  const items = selectAllStmt.all(limit);
  // Send each item
  for (const it of items.reverse()) { // older first
    res.write(sseFormat({ type: "memory_item", item: it }));
  }

  // optional synthesized summary
  const summary = await synthSummary(items.slice(0, 25));
  if (summary) {
    res.write(sseFormat({ type: "synth_summary", text: summary }));
  }

  // keepalive ping every 20s
  const keep = setInterval(() => {
    res.write(": ping\n\n");
  }, 20_000);

  // Watch DB file for changes and push updates (simple approach)
  const watcher = fs.watch(dbFile, async () => {
    try {
      const recent = selectAllStmt.all(10);
      res.write(sseFormat({ type: "memory_update", items: recent }));
    } catch (e) { /* ignore */ }
  });

  req.on("close", () => {
    clearInterval(keep);
    watcher?.close();
    res.end();
  });
});

app.post("/memories", requireAuth, (req, res) => {
  const { text, type = "", tags = "", meta = null } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  // Normalize text for comparison
  const normText = text.trim().toLowerCase();

  // Check for duplicate (case-insensitive)
  const existing = db.prepare(
    "SELECT id, text FROM memories WHERE lower(trim(text)) = ?"
  ).get(normText);

  if (existing) {
    return res.json({
      ok: false,
      msg: "duplicate",
      existing: existing
    });
  }

  const ts = new Date().toISOString();
  insertStmt.run({
    ts,
    type,
    tags,
    text,
    meta: meta ? JSON.stringify(meta) : null
  });

  return res.json({ ok: true });
});



// Search
app.get("/memories/search", requireAuth, (req, res) => {
  const q = `%${(req.query.q || "").replace(/%/g,"")}%`;
  const limit = parseInt(req.query.limit || "25", 10);
  const rows = searchStmt.all({ q, limit });
  res.json(rows);
});

// Dump all memories (debug only!)
app.get("/memories/all", requireAuth, (req, res) => {
  const rows = selectAllStmt.all(500); // adjust limit if you want
  res.json(rows);
});

// Get by id
app.get("/memories/:id", requireAuth, (req,res) => {
  const row = getById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

// Delete
app.delete("/memories/:id", requireAuth, (req,res) => {
  const info = deleteStmt.run(req.params.id);
  res.json({ deleted: info.changes });
});

app.get("/version", (req, res) => {
  res.json({ version: "embeddings + all route v2" });
});

app.listen(PORT, () => {
  console.log(`MCP Memory Bridge running on port ${PORT}`);
});


