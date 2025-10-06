// mcp-memory-bridge.js
import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const { Pool } = pkg;
const app = express();
const port = process.env.PORT || 10000;

// Enable proxy trust and CORS for Render
app.set("trust proxy", 1);
app.use(cors());
app.use(bodyParser.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// === HEALTH / INFO ===
app.get("/version", async (req, res) => {
  res.json({
    version: "postgres + embeddings v1",
    commit: process.env.RENDER_GIT_COMMIT || "local-dev",
  });
});

app.get("/ping", async (req, res) => {
  try {
    const db = await pool.query("SELECT NOW()");
    res.json({ ok: true, message: "pong", db: "connected", time: db.rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, message: "pong", db: "error", error: err.message });
  }
});

// === ADD MEMORY ===
app.post("/memories", async (req, res) => {
  try {
    const token = req.headers["x-mcp-token"];
    if (!token || token !== process.env.MCP_TOKEN) {
      return res.status(403).json({ ok: false, error: "Invalid or missing token" });
    }

    let { text, type = "note", tags = [], source = null, ts = null } = req.body;

    // ✅ Normalize tags to valid JSON string
    if (Array.isArray(tags)) {
      tags = JSON.stringify(tags);
    } else if (typeof tags === "string") {
      try {
        JSON.parse(tags); // already valid JSON string
      } catch {
        tags = JSON.stringify([tags]);
      }
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO memories (id, text, type, tags, source, ts, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [id, text, type, tags, source, ts]
    );

    console.log(`✅ Memory stored: ${text}`);
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error("❌ Error inserting memory:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === GET ALL MEMORIES ===
app.get("/memories/all", async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid or missing token" });
  }

  try {
    const result = await pool.query("SELECT * FROM memories ORDER BY id DESC LIMIT 50");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching memories:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === GET BY TAG ===
app.get("/memories/by-tag", async (req, res) => {
  const token = req.query.token;
  const tag = req.query.tag;
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid or missing token" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM memories WHERE tags::text LIKE $1 ORDER BY created_at DESC LIMIT 50",
      [`%${tag}%`]
    );
    res.json({ ok: true, count: result.rowCount, memories: result.rows });
  } catch (err) {
    console.error("❌ Error fetching memories by tag:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === GET TODAY'S MEMORIES ===
app.get("/memories/today", async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid or missing token" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM memories WHERE created_at::date = CURRENT_DATE ORDER BY created_at DESC"
    );
    res.json({ ok: true, count: result.rowCount, memories: result.rows });
  } catch (err) {
    console.error("❌ Error fetching today's memories:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// === SSE STREAM (for live updates) ===
app.get("/mcp/sse", async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).end("Invalid token");
  }

  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  console.log("📡 SSE connection established");

  const sendUpdate = async () => {
    const result = await pool.query(
      "SELECT * FROM memories ORDER BY created_at DESC LIMIT 10"
    );
    res.write(`data: ${JSON.stringify(result.rows)}\n\n`);
  };

  await sendUpdate();
  const interval = setInterval(sendUpdate, 15000);

  req.on("close", () => {
    clearInterval(interval);
    console.log("❌ SSE connection closed");
  });
});

// === SERVER START ===
app.listen(port, () => {
  console.log(`🚀 MCP Memory Bridge running on port ${port}`);
});
