// chat.cjs
require("dotenv").config();
const readline = require("readline");
const axios = require("axios");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const BASE_URL = process.env.MCP_BRIDGE_URL || "http://localhost:10000";
const TOKEN = process.env.MCP_TOKEN;

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY in environment. Please set it in .env or your shell.");
  process.exit(1);
}

if (!TOKEN) {
  console.error("Missing MCP_TOKEN in environment. Please set it in .env or your shell.");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });

function prompt() {
  rl.prompt();
}

async function aiDecide(userText) {
  const system = `You are a helpful assistant connected to a memory service. Decide if the user's message should be saved as a memory (action: "save"), queried from memory (action: "recall"), or ignored (action: "none").
Respond ONLY with strict JSON and no commentary using this schema:
{
  "action": "save" | "recall" | "none",
  "text": string,        // if action is save; memory text to store (may equal the user message)
  "type": "note" | "event",
  "tags": string[],      // optional tags you infer
  "query": string        // if action is recall; search query to use
}`;

  const body = {
    model: OPENAI_MODEL,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userText }
    ]
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI error: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content);
  } catch (e) {
    return { action: "none" };
  }
}

async function saveMemory(text, tags = [], type = "note") {
  const payload = { text, tags, type };
  const res = await axios.post(`${BASE_URL}/memories`, payload, {
    headers: {
      "Content-Type": "application/json",
      "x-mcp-token": TOKEN,
    },
  });
  return res.data;
}

async function recall(query, limit = 5) {
  const res = await axios.get(`${BASE_URL}/memories/recall`, {
    params: { q: query, token: TOKEN, limit },
  });
  return res.data;
}

console.log("🗣️  AI Chat connected. Type messages to save/recall. Type 'exit' to quit.\n");
rl.prompt();

rl.on("line", async (line) => {
  const text = (line || "").trim();
  if (!text) return prompt();
  if (text.toLowerCase() === "exit") {
    rl.close();
    return;
  }

  try {
    const decision = await aiDecide(text);
    const action = decision.action || "none";

    if (action === "save") {
      const memText = decision.text || text;
      const tags = Array.isArray(decision.tags) ? decision.tags : [];
      const type = decision.type === "event" ? "event" : "note";
      const result = await saveMemory(memText, tags, type);
      console.log(`✅ Saved: ${memText}`);
      if (tags.length) console.log(`   tags: ${tags.join(", ")}`);
      if (result.id) console.log(`   id: ${result.id}`);
    } else if (action === "recall") {
      const query = decision.query || text;
      const result = await recall(query, 5);
      if (result.ok && result.count > 0) {
        console.log(`🧠 Found ${result.count}:`);
        for (const m of result.memories) {
          const when = m.ts || m.last_updated || m.created_at || "";
          console.log(` • ${m.text}${when ? ` (${when})` : ""}`);
        }
      } else {
        console.log("🤔 No relevant memories found.");
      }
    } else {
      console.log("💬 Not a memory action. (Say 'remember ...' or ask 'when ...')");
    }
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }

  prompt();
});
