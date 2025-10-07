// memoryPrompt.cjs
require("dotenv").config();
const axios = require("axios");

const BASE_URL = "https://beebo-memory-mcp.onrender.com";
const TOKEN = process.env.MCP_BRIDGE_TOKEN || "Zedy1101";

// Simple helper to recall information from memory
async function recallFromMemory(query) {
  try {
    const response = await axios.get(
      `${BASE_URL}/memories/recall?q=${encodeURIComponent(query)}&token=${TOKEN}`
    );

    if (response.data.ok && response.data.memories?.length > 0) {
      const memories = response.data.memories
        .map((m) => `• ${m.text} (${m.last_updated || m.created_at})`)
        .join("\n");
      return `🧠 Found ${response.data.count} memories:\n${memories}`;
    } else {
      return "🤔 No relevant memories found.";
    }
  } catch (err) {
    console.error("❌ Error recalling from memory:", err.message);
    if (err.response?.status === 401) {
      return "Error accessing memory — unauthorized (check token).";
    } else {
      return "Error accessing memory.";
    }
  }
}

module.exports = { recallFromMemory };
