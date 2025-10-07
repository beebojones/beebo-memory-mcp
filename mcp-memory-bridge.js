// mcp-memory-bridge.js
import express from "express";
import pkg from "pg";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const { Pool } = pkg;
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ✅ Health check route
app.get("/ping", async (req, res) => {
  try {
    const dbCheck = await pool.query("SELECT NOW()");
    res.json({
      ok: true,
      message: "pong",
      db: "connected",
      time: dbCheck.rows[0].now,
    });
  } catch (err) {
    res.json({ ok: false, message: "pong", db: "disconnected", error: err.message });
  }
});

// ✅ Version info
app.get("/version", (req, res) => {
  res.json({ version: "postgres + embeddings v1", commit: process.env.GIT_COMMIT || "local" });
});

// ✅ POST /memories (create or update)
app.post("/memories", async (req, res) => {
  try {
    const token = req.headers["x-mcp-token"] || req.query.token;
    if (token !== process.env.MCP_TOKEN)
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    let { text, type = "note", tags = [], ts = null, source = "manual" } = req.body;

    // 🧩 Parse tags properly if they come in as a string
    if (typeof tags === "string") {
      try {
        tags = JSON.parse(tags);
      } catch {
        tags = [tags];
      }
    }

    if (!Array.isArray(tags)) tags = [String(tags)];

    // 🧩 Normalize text for deduplication
    const text_norm = text.trim().toLowerCase();

    const result = await pool.query(
      `INSERT INTO memories (id, text, text_norm, type, tags, ts, source)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (text_norm) DO UPDATE SET
         last_updated = NOW()
       RETURNING id, NOW() as last_updated;`,
      [uuidv4(), text, text_norm, type, JSON.stringify(tags), ts, source]
    );

    res.json({ ok: true, id: result.rows[0].id, last_updated: result.rows[0].last_updated, updated: true });
  } catch (err) {
    console.error("❌ Memory insert error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ GET /memories/all
app.get("/memories/all", async (req, res) => {
  try {
    const token = req.query.token;
    if (token !== process.env.MCP_TOKEN)
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const result = await pool.query(
      "SELECT id, text, type, tags, created_at, ts, last_updated FROM memories ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching memories:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ GET /memories/recall
app.get("/memories/recall", async (req, res) => {
  try {
    const token = req.query.token;
    if (token !== process.env.MCP_TOKEN)
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const q = (req.query.q || "").toLowerCase();
    const limit = parseInt(req.query.limit || "5");

    const result = await pool.query(
      `SELECT id, text, tags, type, created_at, ts, last_updated
       FROM memories
       WHERE text_norm ILIKE $1
       ORDER BY last_updated DESC
       LIMIT $2`,
      [`%${q}%`, limit]
    );

    res.json({
      ok: true,
      found: result.rows.length > 0,
      count: result.rows.length,
      memories: result.rows,
    });
  } catch (err) {
    console.error("❌ Recall error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Default route
app.get("/", (req, res) => {
  res.json({
    id: "beebo-memory",
    name: "Beebo Memory MCP",
    description: "Memory storage and recall for a personal AI assistant. Backed by Postgres + embeddings.",
    base_url: "https://beebo-memory-mcp.onrender.com",
  });
});

// ✅ Start the server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`MCP Memory Bridge running on port ${PORT}`));
