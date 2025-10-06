/**
 * mcp-memory-bridge.js
 * Postgres-backed memory bridge with working /recall auth
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const { Pool } = pkg;

const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.MCP_BRIDGE_TOKEN || "Zedy1101";
const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize DB
await pool.query(`
  CREATE TABLE IF NOT EXISTS memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT,
    tags JSONB,
    text TEXT NOT NULL,
    meta JSONB,
    embedding TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ts TEXT,
    text_norm TEXT UNIQUE,
    last_updated TIMESTAMPTZ DEFAULT NOW()
  );
`);

// Middleware
const app = express();
app.use(express.json());
app.use(cors());

// Helper: require valid token (checks both header and query)
function requireAuth(req, res, next) {
  const token =
    req.header("x-mcp-token") ||
    req.query.token ||
    req.body?.token;
  if (!token || token !== AUTH_TOKEN) {
    return res.status(401).json({ ok: false, error: "Invalid or missing token" });
  }
  next();
}

// Add new memory
app.post("/memories", requireAuth, async (req, res) => {
  try {
    const { text, type = "note", tags = [], meta = null, ts = null, source = "api" } = req.body;
    if (!text) return res.status(400).json({ ok: false, error: "Missing text" });

    const text_norm = text.toLowerCase().trim();

    const existing = await pool.query("SELECT id FROM memories WHERE text_norm=$1", [text_norm]);
    if (existing.rows.length > 0) {
      return res.json({ ok: false, error: "Duplicate entry", existing: existing.rows[0] });
    }

    const result = await pool.query(
      `INSERT INTO memories (id, text, type, tags, meta, source, ts, text_norm)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, last_updated`,
      [uuidv4(), text, type, tags, meta, source, ts, text_norm]
    );

    res.json({ ok: true, id: result.rows[0].id, last_updated: result.rows[0].last_updated, updated: true });
  } catch (err) {
    console.error("POST /memories error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Recall route
app.get("/memories/recall", requireAuth, async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();
    if (!q) return res.status(400).json({ ok: false, error: "Missing query" });

    const result = await pool.query(
      `SELECT id, text, tags, type, source, created_at, last_updated
       FROM memories
       WHERE text_norm ILIKE $1
       ORDER BY last_updated DESC
       LIMIT 10`,
      [`%${q}%`]
    );

    res.json({
      ok: true,
      found: result.rows.length > 0,
      count: result.rows.length,
      memories: result.rows
    });
  } catch (err) {
    console.error("GET /memories/recall error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// All memories
app.get("/memories/all", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM memories ORDER BY created_at DESC LIMIT 50");
  res.json(rows);
});

// Healthcheck
app.get("/ping", (req, res) => {
  res.json({ ok: true, message: "pong", db: "connected", time: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`✅ MCP Memory Bridge running on port ${PORT}`));
