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
const useSSL = (process.env.DATABASE_SSL || "").toLowerCase() === "true" || process.env.NODE_ENV === "production";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// Diagnostics and global error handlers (no secrets logged)
function logStartup() {
  const conn = process.env.DATABASE_URL || "";
  let host = "unknown";
  try {
    host = new URL(conn).hostname || "unknown";
  } catch (_) {}
  const tokenSet = Boolean(process.env.MCP_TOKEN);
  console.log(`[config] DB host: ${host} | SSL: ${useSSL ? "on" : "off"} | MCP_TOKEN set: ${tokenSet}`);
}
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] UnhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] UncaughtException:", err);
});

logStartup();

// Helper: ensure schema exists
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      id UUID PRIMARY KEY,
      text TEXT NOT NULL,
      text_norm TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'note',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      ts TIMESTAMPTZ NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS memories_text_norm_key ON memories(text_norm);
  `);
}

function isTokenValid(token) {
  const expected = process.env.MCP_TOKEN || "";
  return token && token === expected;
}

// Boot: initialize schema
initDb().then(() => {
  console.log("✅ Database schema ensured (memories)");
}).catch((err) => {
  console.error("❌ Failed to initialize database schema:", err.message);
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

// ✅ Healthz (DB readiness only)
app.get("/healthz", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});

// ✅ OpenAPI spec (minimal)
const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Beebo Memory MCP API",
    version: "1.0.0"
  },
  servers: [
    { url: "https://beebo-memory-mcp.onrender.com" },
    { url: "http://localhost:10000" }
  ],
  components: {
    securitySchemes: {
      MCPTokenHeader: {
        type: "apiKey",
        in: "header",
        name: "x-mcp-token"
      }
    },
    schemas: {
      Memory: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          text: { type: "string" },
          text_norm: { type: "string" },
          type: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          ts: { type: "string", format: "date-time" },
          created_at: { type: "string", format: "date-time" },
          last_updated: { type: "string", format: "date-time" }
        }
      }
    }
  },
  security: [{ MCPTokenHeader: [] }],
  paths: {
    "/ping": { get: { summary: "Health ping", responses: { 200: { description: "OK" } } } },
    "/version": { get: { summary: "Version", responses: { 200: { description: "OK" } } } },
    "/memories": {
      post: {
        summary: "Create or update a memory",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  type: { type: "string", default: "note" },
                  tags: { type: "array", items: { type: "string" } },
                  ts: { type: "string", format: "date-time" },
                  source: { type: "string" }
                },
                required: ["text"]
              }
            }
          }
        },
        responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } }
      }
    },
    "/memories/all": { get: { summary: "List all memories", responses: { 200: { description: "OK" } } } },
    "/memories/recall": {
      get: {
        summary: "Recall by text query",
        parameters: [
          { in: "query", name: "q", schema: { type: "string" } },
          { in: "query", name: "limit", schema: { type: "integer", default: 5 } }
        ],
        responses: { 200: { description: "OK" } }
      }
    },
    "/memories/search": { get: { summary: "Search alias", responses: { 200: { description: "OK" } } } },
    "/memories/by-tag": { get: { summary: "Filter by tag", responses: { 200: { description: "OK" } } } },
    "/memories/by-type": { get: { summary: "Filter by type", responses: { 200: { description: "OK" } } } },
    "/memories/recent": { get: { summary: "Recent memories", responses: { 200: { description: "OK" } } } },
    "/memories/today": { get: { summary: "Today memories", responses: { 200: { description: "OK" } } } },
    "/memories/{id}": {
      get: { summary: "Get by id", parameters: [{ in: "path", name: "id", required: true }], responses: { 200: { description: "OK" }, 404: { description: "Not found" } } },
      delete: { summary: "Delete by id", parameters: [{ in: "path", name: "id", required: true }], responses: { 200: { description: "OK" }, 404: { description: "Not found" } } }
    }
  }
};
app.get("/openapi.json", (req, res) => {
  res.json(openapiSpec);
});

// ✅ Routes listing (for quick verification)
function getRoutes() {
  const out = [];
  const stack = app._router && app._router.stack ? app._router.stack : [];
  function visit(layer, prefix = "") {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods || {}).map(m => m.toUpperCase());
      out.push({ methods, path: prefix + layer.route.path });
    } else if (layer.name === "router" && layer.handle && Array.isArray(layer.handle.stack)) {
      const newPrefix = layer.regexp && layer.regexp.fast_slash ? prefix : prefix;
      layer.handle.stack.forEach(l => visit(l, newPrefix));
    }
  }
  stack.forEach(layer => visit(layer));
  // de-dup and sort
  const seen = new Set();
  const deduped = out.filter(r => {
    const key = r.methods.sort().join(",") + " " + r.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.sort((a, b) => (a.path > b.path ? 1 : a.path < b.path ? -1 : 0));
}
app.get("/routes", (req, res) => {
  try {
    res.json({ ok: true, routes: getRoutes() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ POST /memories (create or update)
app.post("/memories", async (req, res) => {
  try {
    const token = req.headers["x-mcp-token"] || req.query.token;
    if (token !== (process.env.MCP_TOKEN || ""))
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    let { text, type = "note", tags = [], ts = null, source = "manual" } = req.body;
    if (!text || !String(text).trim()) {
      return res.status(400).json({ ok: false, error: "Missing 'text'" });
    }

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
    const token = req.query.token || req.headers["x-mcp-token"]; 
    if (!isTokenValid(token))
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

// ✅ GET /memories/recall (search by free text)
app.get("/memories/recall", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-mcp-token"]; 
    if (!isTokenValid(token))
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

// ✅ Alias: /memories/search → same as recall
app.get("/memories/search", async (req, res) => {
  req.query.limit = req.query.limit || "10";
  return app._router.handle({ ...req, url: "/memories/recall" }, res, () => {});
});

// ✅ Filter by tag
app.get("/memories/by-tag", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-mcp-token"]; 
    if (!isTokenValid(token))
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const tag = String(req.query.tag || "");
    if (!tag) return res.status(400).json({ ok: false, error: "Missing 'tag'" });

    const result = await pool.query(
      `SELECT id, text, tags, type, created_at, ts, last_updated
       FROM memories
       WHERE tags @> $1::jsonb
       ORDER BY last_updated DESC`,
      [JSON.stringify([tag])]
    );
    res.json({ ok: true, count: result.rows.length, memories: result.rows });
  } catch (err) {
    console.error("❌ by-tag error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Filter by type
app.get("/memories/by-type", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-mcp-token"]; 
    if (!isTokenValid(token))
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const type = String(req.query.type || "");
    if (!type) return res.status(400).json({ ok: false, error: "Missing 'type'" });

    const result = await pool.query(
      `SELECT id, text, tags, type, created_at, ts, last_updated
       FROM memories
       WHERE type = $1
       ORDER BY last_updated DESC`,
      [type]
    );
    res.json({ ok: true, count: result.rows.length, memories: result.rows });
  } catch (err) {
    console.error("❌ by-type error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Recent memories
app.get("/memories/recent", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-mcp-token"]; 
    if (!isTokenValid(token))
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const limit = parseInt(req.query.limit || "5");
    const result = await pool.query(
      `SELECT id, text, tags, type, created_at, ts, last_updated
       FROM memories
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, count: result.rows.length, memories: result.rows });
  } catch (err) {
    console.error("❌ recent error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Today
app.get("/memories/today", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-mcp-token"]; 
    if (!isTokenValid(token))
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const result = await pool.query(
      `SELECT id, text, tags, type, created_at, ts, last_updated
       FROM memories
       WHERE created_at::date = CURRENT_DATE
       ORDER BY created_at DESC`
    );
    res.json({ ok: true, count: result.rows.length, memories: result.rows });
  } catch (err) {
    console.error("❌ today error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Get by id
app.get("/memories/:id", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-mcp-token"]; 
    if (!isTokenValid(token))
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, text, tags, type, created_at, ts, last_updated FROM memories WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, memory: result.rows[0] });
  } catch (err) {
    console.error("❌ get by id error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ Delete by id
app.delete("/memories/:id", async (req, res) => {
  try {
    const token = req.query.token || req.headers["x-mcp-token"];
    if (!isTokenValid(token))
      return res.status(401).json({ ok: false, error: "Invalid or missing token" });

    const { id } = req.params;
    const result = await pool.query(`DELETE FROM memories WHERE id = $1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, deleted: id });
  } catch (err) {
    console.error("❌ delete by id error:", err);
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
const server = app.listen(PORT, () => {
  console.log(`MCP Memory Bridge running on port ${PORT}`);
  try {
    const addr = server.address();
    if (addr && typeof addr === "object") {
      console.log(`[listen] bound on ${addr.address || "unknown"}:${addr.port}`);
    }
  } catch (_) {}
});
server.on("error", (err) => {
  console.error("[listen] Server error:", err);
});
