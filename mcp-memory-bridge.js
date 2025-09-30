import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const { Pool } = pg;
const app = express();
app.use(bodyParser.json());

// Connect to Postgres
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Health check (does not touch DB)
app.get("/ping", (req, res) => {
  res.json({ ok: true, message: "pong" });
});

// Create a memory
app.post("/memories", async (req, res) => {
  try {
    const { text, type, tags = [], source, meta = {} } = req.body;

    const result = await pool.query(
      `INSERT INTO memories (type, tags, text, source, meta)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [type, JSON.stringify(tags), text, source, JSON.stringify(meta)]
    );

    res.json({ ok: true, id: result.rows[0].id });
  } catch (err) {
    console.error("Error inserting memory:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get all memories
app.get("/memories/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM memories ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching all memories:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get memories by tag
app.get("/memories/by-tag", async (req, res) => {
  try {
    const { tag } = req.query;
    if (!tag) {
      return res.status(400).json({ ok: false, error: "Missing tag parameter" });
    }

    const result = await pool.query(
      "SELECT * FROM memories WHERE tags @> $1::jsonb ORDER BY id DESC",
      [JSON.stringify([tag])]
    );

    res.json({ ok: true, count: result.rows.length, memories: result.rows });
  } catch (err) {
    console.error("Error fetching memories by tag:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get a memory by ID (make sure this comes AFTER /by-tag route)
app.get("/memories/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, error: "Invalid ID" });
    }

    const result = await pool.query("SELECT * FROM memories WHERE id = $1", [
      id
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching memory by ID:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`MCP Memory Bridge running on port ${PORT}`);
});
