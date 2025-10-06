import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 🩺 Health check
app.get("/ping", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "pong", db: "connected", time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🧾 Version route
app.get("/version", (req, res) => {
  res.json({ version: "postgres + embeddings v1", commit: process.env.RENDER_GIT_COMMIT || "local-dev" });
});

// 🧠 Add or update memory
app.post("/memories", async (req, res) => {
  const token = req.headers["x-mcp-token"];
  if (token !== process.env.MCP_TOKEN)
    return res.status(401).json({ ok: false, error: "Invalid or missing token" });

  try {
    const { text, type, tags, source } = req.body;

    if (!text) {
      return res.status(400).json({ ok: false, error: "Missing text field" });
    }

    const textNorm = text.trim().toLowerCase();

    const result = await pool.query(
      `
      INSERT INTO memories (id, text, type, tags, source, text_norm, ts)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (text_norm)
      DO UPDATE SET
        tags = EXCLUDED.tags,
        type = EXCLUDED.type,
        source = EXCLUDED.source,
        ts = NOW()
      RETURNING id;
      `,
      [uuidv4(), text, type || "note", JSON.stringify(tags || []), source || "manual", textNorm]
    );

    res.json({ ok: true, id: result.rows[0].id, updated: true });
  } catch (err) {
    console.error("Error inserting/updating memory:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🧾 Get all memories
app.get("/memories/all", async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.MCP_TOKEN)
    return res.status(401).json({ ok: false, error: "Invalid or missing token" });

  try {
    const result = await pool.query("SELECT * FROM memories ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🔖 Get memories by tag
app.get("/memories/by-tag", async (req, res) => {
  const token = req.query.token;
  const tag = req.query.tag;
  if (token !== process.env.MCP_TOKEN)
    return res.status(401).json({ ok: false, error: "Invalid or missing token" });
  if (!tag)
    return res.status(400).json({ ok: false, error: "Missing tag parameter" });

  try {
    const result = await pool.query(
      "SELECT * FROM memories WHERE tags::text ILIKE $1 ORDER BY created_at DESC",
      [`%${tag}%`]
    );
    res.json({ ok: true, count: result.rows.length, memories: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📅 Get today’s memories
app.get("/memories/today", async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.MCP_TOKEN)
    return res.status(401).json({ ok: false, error: "Invalid or missing token" });

  try {
    const result = await pool.query(`
      SELECT * FROM memories
      WHERE DATE(created_at) = CURRENT_DATE
      ORDER BY created_at DESC
    `);
    res.json({ ok: true, count: result.rows.length, memories: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 🌐 SSE stream (for AI integration)
app.get("/mcp/sse", async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.MCP_TOKEN) {
    res.status(401).end("Invalid token");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });

  const sendMemories = async () => {
    try {
      const result = await pool.query(
        "SELECT id, text, type, tags, source, created_at, ts FROM memories ORDER BY created_at DESC LIMIT 10"
      );
      res.write(`data: ${JSON.stringify(result.rows)}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${err.message}\n\n`);
    }
  };

  await sendMemories();
  const interval = setInterval(sendMemories, 15000);
  req.on("close", () => clearInterval(interval));
});

// 🧩 Server setup
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 MCP Memory Bridge running on port ${PORT}`));
