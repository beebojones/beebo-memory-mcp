// mcp-memory-bridge.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ TRUST PROXY FIX for Render HTTPS
if (process.env.REQUIRE_HTTPS === "true") {
  app.enable("trust proxy");
  app.use((req, res, next) => {
    const proto = req.headers["x-forwarded-proto"];
    if (proto && proto !== "https") {
      return res.status(403).json({ ok: false, error: "SSL/TLS required" });
    }
    next();
  });
}

// ✅ Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

// ✅ Health check
app.get("/ping", async (req, res) => {
  try {
    const dbCheck = await pool.query("SELECT NOW()");
    res.json({
      ok: true,
      message: "pong",
      db: "connected",
      time: new Date().toISOString(),
      db_time: dbCheck.rows[0].now,
    });
  } catch (err) {
    console.error("Ping DB error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Version info
app.get("/version", (req, res) => {
  res.json({
    version: "postgres + embeddings v1",
    commit: process.env.COMMIT_HASH || "local",
  });
});

// ✅ Add a memory
app.post("/memories", async (req, res) => {
  const token = req.headers["x-mcp-token"];
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid or missing token" });
  }

  const { text, type = "", tags = [], source = "unknown" } = req.body;
  if (!text) return res.status(400).json({ ok: false, error: "Missing text" });

  try {
    const result = await pool.query(
      `INSERT INTO memories (type, tags, text, source, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [type, tags, text, source]
    );
    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error("Error inserting memory:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Get all memories
app.get("/memories/all", async (req, res) => {
  const token = req.query.token;
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid or missing token" });
  }

  try {
    const result = await pool.query(
      "SELECT id, type, tags, text, source, created_at, ts FROM memories ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching memories:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Get by tag
app.get("/memories/by-tag", async (req, res) => {
  const { tag, token } = req.query;
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid or missing token" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM memories WHERE $1 = ANY(tags) ORDER BY id DESC",
      [tag]
    );
    res.json({ ok: true, count: result.rowCount, memories: result.rows });
  } catch (err) {
    console.error("Error filtering by tag:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Today's memories
app.get("/memories/today", async (req, res) => {
  const { token } = req.query;
  if (token !== process.env.MCP_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid or missing token" });
  }

  try {
    const result = await pool.query(
      "SELECT * FROM memories WHERE created_at >= NOW() - INTERVAL '1 day' ORDER BY id DESC"
    );
    res.json({ ok: true, count: result.rowCount, memories: result.rows });
  } catch (err) {
    console.error("Error fetching today's memories:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Fallback route
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

// ✅ Start server
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`🚀 MCP Memory Bridge running on port ${port}`);
});
