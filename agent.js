// agent.cjs
require("dotenv").config();
const axios = require("axios");
const chrono = require("chrono-node");
const { recallFromMemory } = require("./memoryPrompt.cjs");

// Your memory MCP server URL + token
const BASE_URL = "https://beebo-memory-mcp.onrender.com";
const TOKEN = "Zedy1101";

// Function to add memory with optional date parsing
async function addMemory(text, tags = [], type = "note") {
  try {
    const parsedDate = chrono.parseDate(text);
    let ts = null;
    if (parsedDate) {
      ts = parsedDate.toISOString();
      console.log(`⏰ Parsed datetime: ${ts}`);
    }

    const response = await axios.post(
      `${BASE_URL}/memories?token=${TOKEN}`,
      { text, tags, type, ts }
    );

    console.log("✅ Memory stored:", response.data);
    return response.data;
  } catch (err) {
    console.error("❌ Error adding memory:", err.message);
  }
}

// Function to recall memories manually
async function recallMemories(query, limit = 5) {
  try {
    const response = await axios.get(
      `${BASE_URL}/memories/recall?q=${encodeURIComponent(query)}&token=${TOKEN}&limit=${limit}`
    );
    console.log("🧠 Recall results:", response.data);
    return response.data;
  } catch (err) {
    console.error("❌ Error recalling memory:", err.message);
  }
}

// Simple test run
(async () => {
  console.log("🚀 Running agent test...");

  // Store a test memory
  await addMemory("Meeting with Adam tomorrow at 4pm", ["work"], "event");

  // Recall it the direct way
  await recallMemories("Adam");

  // Recall it the smart way (via memoryPrompt.cjs)
  const userMessage = "When is my meeting with Adam?";
  const recallResponse = await recallFromMemory(userMessage);
  console.log("🧠 AI Memory Recall:", recallResponse);
})();
