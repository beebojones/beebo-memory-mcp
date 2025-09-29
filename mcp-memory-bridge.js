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
      embedding TEXT
    )
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
  const prompt = `Summarize these memory items into 3 bullets:\n\n${JSON.stringify(items.map(i => ({id:i.id, ts:i.ts, text:i.text, tags:i.tags})),null,2)}`;
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
      }),
    });
    const j = await resp.json();
    return j?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.warn("OpenAI summary failed", e);
    return null;
  }
}

// --- Routes ---
// Place by-tag route *before* :id route
app.get("/memories/by-tag", requireAuth, async (req, res) => {
  try {
    const tag = req.query.tag;
    if (!tag) return res.status(400).json({ error: "tag required" });
    const { rows } = await pool.query(
      "SELECT * FROM memories WHERE tags @> $1::jsonb ORDER BY id DESC LIMIT 50",
      [JSON.stringify([tag])]
    );
    res.json(rows);
  } catch (err) {
    console.error("Route error /memories/by-tag:", err);
    res.status(500).json({ error: "server error" });
  }
});

app.get("/mcp/sse", requireAuth, async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
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
  try {
    const { text, type = "", tags = [], meta = null } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });

    const normText = text.trim();
    const ts = new Date().toISOString();

    // Exact duplicate check
    const dupCheck = await pool.query("SELECT id, text FROM memories WHERE lower(trim(text)) = lower(trim($1))", [normText]);
    if (dupCheck.rows.length > 0) {
      return res.json({ ok: false, msg: "duplicate", existing: dupCheck.rows[0] });
    }

    // Embedding duplicate check
    let embedding = null;
    if (OPENAI_KEY) {
      try {
        const resp = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input: normText, model: "text-embedding-3-small" }),
        });
        const data = await resp.json();
        embedding = data.data[0].embedding;

        const existingRows = await pool.query("SELECT id, text, embedding FROM memories WHERE embedding IS NOT NULL");
        for (const row of existingRows.rows) {
          const sim = cosineSimilarity(embedding, JSON.parse(row.embedding));
          if (sim > 0.9) {
            return res.json({ ok: false, msg: "semantic duplicate", similarity: sim, existing: { id: row.id, text: row.text } });
          }
        }
      } catch (err) {
        console.error("Embedding fetch failed", err);
      }
    }

    // Insert
    const result = await pool.query(
      "INSERT INTO memories (ts,type,tags,text,meta,embedding) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [ts, type, JSON.stringify(tags), normText, meta ? JSON.stringify(meta) : null, embedding ? JSON.stringify(embedding) : null]
    );

    return res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error("Route error /memories:", err);
    res.status(500).json({ error: "server error" });
  }
});

app.get("/memories/search", requireAuth, async (req, res) => {
  try {
    const q = `%${(req.query.q || "").replace(/%/g,"")}%`;
    const limit = parseInt(req.query.limit || "25", 10);
    const { rows } = await pool.query("SELECT * FROM memories WHERE text ILIKE $1 OR tags::text ILIKE $1 ORDER BY id DESC LIMIT $2", [q, limit]);
    res.json(rows);
  } catch (err) {
    console.error("Route error /memories/search:", err);
    res.status(500).json({ error: "server error" });
  }
});

app.get("/memories/all", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM memories ORDER BY id ASC LIMIT 500");
  res.json(rows);
});

// must come after by-tag
app.get("/memories/:id", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM memories WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Route error /memories/:id:", err);
    res.status(500).json({ error: "server error" });
  }
});

app.delete("/memories/:id", requireAuth, async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM memories WHERE id = $1", [req.params.id]);
  res.json({ deleted: rowCount });
});

app.get("/version", (req, res) => {
  res.json({ version: "postgres + embeddings v2" });
});

app.listen(PORT, () => {
  console.log(`MCP Memory Bridge running on port ${PORT}`);
});
