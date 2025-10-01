/**
 * mcp-memory-bridge.js
 * Minimal memory MCP bridge for xdc.aipi.com
 *
 * Postgres-backed version
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.MCP_BRIDGE_TOKEN || "change-me";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL;

// --- DB setup ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      id SERIAL PRIMARY KEY,
      ts TEXT,
      type TEXT,
      tags JSONB,
      text TEXT NOT NULL,
      meta JSONB,
      embedding TEXT,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS memories_unique_text_norm
    ON memories (lower(trim(text)))
  `);
}
await initDb();

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// --- App ---
const app = express();
app.use(express.json());
app.use(cors());

function requireAuth(req, res, next) {
  const token = req.header("x-mcp-token") || req.query.token;
  if (!token || token !== AUTH_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

function sseFormat(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function synthSummary(items) {
  if (!OPENAI_KEY) return null;
  const prompt = `You are a helpful assistant. Summarize these memory items into a short friendly list (3 bullets max):\n\n${JSON.stringify(
    items.map(i => ({
      id: i.id,
      ts: i.ts,
      text: i.text,
      tags: i.tags
    })),
    null,
    2
  )}`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200
      })
    });
    const j = await resp.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.warn("OpenAI summary failed", e);
    return null;
  }
}

// --- Routes ---
app.get("/ping", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      message: "pong",
      db: "connected",
      time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: "db error", error: err.message });
  }
});

app.get("/version", (_req, res) => {
  res.json({ version: "postgres + embeddings v1", commit: process.env.RENDER_GIT_COMMIT || "local-dev" });
});

app.get("/mcp/sse", requireAuth, async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  res.write(sseFormat({ type: "mcp_welcome", ts: new Date().toISOString(), msg: "Beebo memory bridge connected" }));

  const limit = parseInt(req.query.limit || "50", 10);
  const { rows } = await pool.query("SELECT * FROM memories ORDER BY id DESC LIMIT $1", [limit]);

  for (const it of rows.reverse()) {
    res.write(sseFormat({ type: "memory_item", item: it }));
  }

  const summary = await synthSummary(rows.slice(0, 25));
  if (summary) {
    res.write(sseFormat({ type: "synth_summary", text: summary }));
  }

  const keep = setInterval(() => {
    res.write(": ping\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(keep);
    res.end();
  });
});

app.post("/memories", requireAuth, async (req, res) => {
  const { text, type = "", tags = [], meta = null, source = null } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  const normText = text.trim();
  const ts = new Date().toISOString();

  // Exact duplicate check
  const dupCheck = await pool.query("SELECT id, text FROM memories WHERE lower(trim(text)) = lower(trim($1))", [normText]);
  if (dupCheck.rows.length > 0) {
    return res.json({ ok: false, error: "duplicate", existing: dupCheck.rows[0] });
  }

  // Embedding duplicate check
  let embedding = null;
  if (OPENAI_KEY) {
    try {
      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ input: normText, model: "text-embedding-3-small" })
      });
      const data = await resp.json();
      embedding = data.data[0].embedding;

      const existingRows = await pool.query("SELECT id, text, embedding FROM memories WHERE embedding IS NOT NULL");
      for (const row of existingRows.rows) {
        const sim = cosineSimilarity(embedding, JSON.parse(row.embedding));
        if (sim > 0.9) {
          return res.json({
            ok: false,
            error: "semantic duplicate",
            similarity: sim,
            existing: { id: row.id, text: row.text }
          });
        }
      }
    } catch (err) {
      console.error("Embedding fetch failed", err);
    }
  }

  const result = await pool.query(
    "INSERT INTO memories (ts, type, tags, text, meta, embedding, source) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [ts, type, JSON.stringify(tags), normText, meta ? JSON.stringify(meta) : null, embedding ? JSON.stringify(embedding) : null, source]
  );

  return res.json({ ok: true, id: result.rows[0].id });
});

app.get("/memories/search", requireAuth, async (req, res) => {
  const q = `%${(req.query.q || "").replace(/%/g, "")}%`;
  const limit = parseInt(req.query.limit || "25", 10);
  const { rows } = await pool.query("SELECT * FROM memories WHERE text ILIKE $1 OR tags::text ILIKE $1 ORDER BY id DESC LIMIT $2", [q, limit]);
  res.json(rows);
});

app.get("/memories/all", requireAuth, async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM memories ORDER BY id ASC LIMIT 500");
  res.json(rows);
});

app.get("/memories/by-tag", requireAuth, async (req, res) => {
  const { tag } = req.query;
  if (!tag) return res.status(400).json({ error: "tag required" });

  const { rows } = await pool.query("SELECT * FROM memories WHERE tags @> $1::jsonb ORDER BY id DESC", [JSON.stringify([tag])]);
  res.json({ ok: true, count: rows.length, memories: rows });
});

app.get("/memories/today", requireAuth, async (_req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const { rows } = await pool.query("SELECT * FROM memories WHERE ts::text LIKE $1 OR created_at::text LIKE $1 ORDER BY id DESC", [`${today}%`]);
  res.json({ ok: true, count: rows.length, memories: rows });
});

app.get("/memories/:id", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM memories WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: "not found" });
  res.json(rows[0]);
});

app.delete("/memories/:id", requireAuth, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM memories WHERE id = $1", [req.params.id]);
  res.json({ deleted: rowCount });
});

// --- MCP Manifest (for your voice AI to discover this bridge) ---
app.get("/mcp.json", (_req, res) => {
  const manifest = {
    id: "beebo-memory",
    name: "Beebo Memory MCP",
    description: "Memory storage and recall for a personal AI assistant. Backed by Postgres + optional embeddings.",
    base_url: "https://beebo-memory-mcp.onrender.com",
    auth: { type: "header", name: "x-mcp-token", required: true },
    endpoints: [
      { method: "GET", path: "/ping", purpose: "Health check" },
      { method: "GET", path: "/version", purpose: "Bridge version + commit" },
      { method: "GET", path: "/memories/all", purpose: "List all memories" },
      { method: "GET", path: "/memories/search", purpose: "Search by text or tags" },
      { method: "GET", path: "/memories/by-tag", purpose: "Filter by tag" },
      { method: "GET", path: "/memories/today", purpose: "Memories from today" },
      { method: "GET", path: "/memories/:id", purpose: "Fetch by id" },
      { method: "POST", path: "/memories", purpose: "Add a memory" },
      { method: "DELETE", path: "/memories/:id", purpose: "Delete a memory" },
      { method: "GET", path: "/mcp/sse", purpose: "SSE stream of memories" }
    ],
    sse: { path: "/mcp/sse", event_types: ["mcp_welcome", "memory_item", "synth_summary"] },
    schema_version: "1.0.0"
  };
  res.setHeader("Cache-Control", "no-store");
  res.type("application/json").status(200).send(JSON.stringify(manifest, null, 2));
});
app.get("/mcp/manifest", (_req, res) => res.redirect(301, "/mcp.json"));

app.listen(PORT, () => {
  console.log(`MCP Memory Bridge running on port ${PORT}`);
});
