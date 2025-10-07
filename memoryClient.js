// memoryClient.js
const BASE_URL = "https://beebo-memory-mcp.onrender.com";
const TOKEN = "Zedy1101"; // replace with your token if different

async function addMemory(text, tags = [], type = "note", source = "ai") {
  const resp = await fetch(`${BASE_URL}/memories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-mcp-token": TOKEN,
    },
    body: JSON.stringify({ text, tags, type, source }),
  });
  return resp.json();
}

async function searchMemories(query) {
  const resp = await fetch(`${BASE_URL}/memories/search?q=${encodeURIComponent(query)}&token=${TOKEN}`);
  return resp.json();
}

async function getByTag(tag) {
  const resp = await fetch(`${BASE_URL}/memories/by-tag?tag=${encodeURIComponent(tag)}&token=${TOKEN}`);
  return resp.json();
}

async function getToday() {
  const resp = await fetch(`${BASE_URL}/memories/today?token=${TOKEN}`);
  return resp.json();
}

export { addMemory, searchMemories, getByTag, getToday };
