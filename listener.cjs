// listener.cjs
require("dotenv").config();
const axios = require("axios");
const chrono = require("chrono-node");
const readline = require("readline");

// ===== CONFIG =====
const BASE_URL = process.env.MCP_BRIDGE_URL || "https://beebo-memory-mcp.onrender.com";
const TOKEN = process.env.MCP_TOKEN || "Zedy1101";

// ===== HELPERS =====
function cleanInput(line) {
  return (line || "")
    .replace(/^>+\s*/g, "") // strip leading > or >> characters
    .trim();
}

function extractNames(text) {
  const raw = text.match(/\b[A-Z][a-z]+\b/g) || [];
  const ignore = new Set([
    "I", "My", "Today", "Tomorrow", "Tonight", "This", "Next",
    "What", "When", "Remember",
    "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
    "Jan","Feb","Mar","Apr","May","Jun","July","Aug","Sep","Sept","Oct","Nov","Dec"
  ]);
  return raw.filter(n => !ignore.has(n));
}

const normalizeName = n => (n || "").trim().toLowerCase();

function formatWhen(tsLike) {
  try {
    const d = new Date(tsLike);
    return d.toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return null;
  }
}

// ===== IO =====
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "> " });
console.log("🎧 Voice listener active — type or speak messages below.\n");
rl.prompt();

// ===== SERVER FUNCTIONS =====
async function addMemory(text) {
  const parsedDate = chrono.parseDate(text);
  const ts = parsedDate ? parsedDate.toISOString() : null;

  const names = extractNames(text);
  const person = names.length ? normalizeName(names[0]) : null;
  const tags = ["voice", ...(person ? [person] : [])];

  const isEvent = /\b(meeting|appt|appointment|call|interview|session)\b/i.test(text);
  const type = isEvent ? "event" : "note";

  const payload = { text, tags, type };
  if (ts) payload.ts = ts;

  const url = `${BASE_URL}/memories?token=${encodeURIComponent(TOKEN)}`;
  const res = await axios.post(url, payload);
  console.log(`✅ Saved memory: "${text}"`);
  if (person) console.log(`   tagged: ${person}`);
  if (ts) console.log(`   timestamp: ${formatWhen(ts)}`);
}

async function recallMemory(name) {
  const url = `${BASE_URL}/memories/recall`;
  const res = await axios.get(url, { params: { q: name, token: TOKEN } });
  const data = res.data;

  if (!data.ok || !data.found || data.count === 0) {
    console.log("🤔 No relevant memories found.");
    return;
  }

  const matches = data.memories.filter(m => {
    const tags = (m.tags || []).map(t => String(t).toLowerCase());
    const text = (m.text || "").toLowerCase();
    return tags.includes(name.toLowerCase()) || text.includes(name.toLowerCase());
  });

  const mem = matches.length ? matches[0] : data.memories[0];
  const when = mem.ts ? formatWhen(mem.ts) : null;
  console.log(`📅 ${mem.text}${when ? ` — ${when}` : ""}`);
}

// ===== COMMAND HANDLER =====
rl.on("line", async (rawLine) => {
  const text = cleanInput(rawLine);

  if (!text) return rl.prompt();

  const lower = text.toLowerCase();

  try {
    if (lower.startsWith("remember ")) {
      const phrase = text.replace(/^remember\s+/i, "").trim();
      await addMemory(phrase);
    } else if (lower.startsWith("when ")) {
      const names = extractNames(text);
      const name = names.length ? names[names.length - 1] : null;
      if (!name) return console.log("🤔 Whose meeting are you asking about?");
      await recallMemory(name);
    } else if (lower.startsWith("what ")) {
      const names = extractNames(text);
      const name = names.length ? names[names.length - 1] : null;
      if (!name) return console.log("🤔 Whose item are you asking about?");
      await recallMemory(name);
    } else {
      console.log('🤖 Try:\n  • remember meeting with Adam tomorrow at 4pm\n  • when is my meeting with Adam\n  • what do I have with Tricia');
    }
  } catch (err) {
    console.log("❌ Error:", err.response?.status || err.message);
  }

  rl.prompt();
});
