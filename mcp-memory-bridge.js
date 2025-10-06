// mcp-memory-bridge.js
import express from "express";
import bodyParser from "body-parser";
import pkg from "pg";
import dotenv from "dotenv";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const MCP_TOKEN = process.env.MCP_TOKEN || "Zedy1101";

function checkAuth(req, res, next) {
  const token = req.query.token || req.headers["x-mcp-token"];
  if (!token || token !== MCP_TOKEN) {
    return res.status(401).json({ ok: false, error: "Invalid or missing token" });
  }
  next();
}

// --- Add new memory ---
app.post("/memories", checkAuth, async (req, res) => {
  try {
    const { text, tags = [], type = "", meta = null, ts = null, source = "manual" } = req.body;
    const id = uuidv4();

    await pool.query(
      `INSERT INTO memories (id, text, text_norm, tags, type, meta, ts, source, created_at, last_updated)
       VALUES ($1, $2, LOWER($2), $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET last_updated = NOW()`,
      [id, text, tags, type, meta, ts, source]
    );

    res.json({ ok: true, id, last_updated: new Date().toISOString(), updated: true });
  } catch (err) {
    console.error("Error inserting memory:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Get all memories (clean output) ---
app.get("/memories/all", checkAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM memories ORDER BY last_updated DESC");
    res.json(
      result.rows.map(m => ({
        id: m.id,
        text: m.text,
        type: m.type,
        tags: m.tags,
        created_at: m.created_at,
        ts: m.ts,
        last_updated: m.last_updated
      }))
    );
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Search memories ---
app.get("/memories/search", checkAuth, async (req, res) => {
  try {
    const q = req.query.q?.toLowerCase() || "";
    const result = await pool.query(
      `SELECT * FROM memories WHERE text_norm LIKE $1 ORDER BY last_updated DESC LIMIT 10`,
      [`%${q}%`]
    );
    res.json({ ok: true, count: result.rowCount, memories: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --- Recall (semantic fallback ready) ---
app.get("/memories/recall", checkAuth, async (req, res) => {
  try {
    const q = req.query.q?.toLowerCase() || "";
    const result = await pool.query(
      `SELECT * FROM memories WHERE text_norm LIKE $1 ORDER BY last_updated DESC LIMIT 5`,
      [`%${q}%`]
    );

    if (result.rowCount === 0) {
      return res.json({ ok: true, found: false, count: 0, memories: [] });
    }

    res.json({
      ok: true,
      found: true,
      count: result.rowCount,
      memories: result.rows.map(m => ({
        id: m.id,
        text: m.text,
        type: m.type,
        tags: m.tags,
        created_at: m.created_at,
        ts: m.ts,
        last_updated: m.last_updated
      }))
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🧠 MCP Memory Bridge running on port ${PORT}`);
});
