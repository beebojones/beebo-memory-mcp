import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// 🔒 Simple token auth
const TOKEN = process.env.MCP_TOKEN || "Zedy1101";
function requireAuth(req, res, next) {
  const token = req.query.token || req.headers["x-mcp-token"];
  if (token !== TOKEN) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}

// Helper for SSE formatting
function sseFormat(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

// 🟢 Basic health check
app.get("/ping", requireAuth, async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "pong", db: "connected", time: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "DB error" });
  }
});

// Version info
app.get("/version", (req, res) => {
  res.json({ version: "postgres + embeddings v1", commit: process.env.GIT_COMMIT || "local" });
});

// 📝 Add memory
app.post("/memories", requireAuth, async (req, res) => {
  const { text, tags = [], type = "", source = "manual", ts = null } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO memories (text, tags, type, source, ts)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [text, tags, type, source, ts]
    );
    res.json({ ok: true, id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// 📚 List all memories
app.get("/memories/all", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM memories ORDER BY id DESC LIMIT 50");
  res.json(rows);
});

// 🔖 Filter by tag
app.get("/memories/by-tag", requireAuth, async (req, res) => {
  const tag = req.query.tag;
  const { rows } = await pool.query("SELECT * FROM memories WHERE $1 = ANY(tags) ORDER BY id DESC", [tag]);
  res.json({ ok: true, count: rows.length, memories: rows });
});

// 🗓 Today’s memories
app.get("/memories/today", requireAuth, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { rows } = await pool.query("SELECT * FROM memories WHERE created_at >= $1 ORDER BY id DESC", [today]);
  res.json({ ok: true, count: rows.length, memories: rows });
});

// ✍️ Simple summary function
async function synthSummary(rows) {
  if (!rows || rows.length === 0) return "No recent memories.";
  const bullets = rows.slice(0, 5).map(
    (r) => `- ${r.text}`
  );
  return bullets.join("\n");
}

// 🌊 SSE endpoint — now just sends a summary instead of each item
app.get("/mcp/sse", requireAuth, async (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  res.write(sseFormat({
    type: "mcp_welcome",
    ts: new Date().toISOString(),
    msg: "Beebo memory bridge connected"
  }));

  const limit = parseInt(req.query.limit || "50", 10);
  const { rows } = await pool.query(
    "SELECT * FROM memories ORDER BY id DESC LIMIT $1",
    [limit]
  );

  const summary = await synthSummary(rows);
  if (summary) {
    res.write(sseFormat({
      type: "synth_summary",
      text: summary
    }));
  }

  const keep = setInterval(() => {
    res.write(": ping\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(keep);
    res.end();
  });
});

// 🌐 Start server
const port = process.env.PORT || 10000;
app.listen(port, () => console.log(`MCP Memory Bridge running on port ${port}`));
