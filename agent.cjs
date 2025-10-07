// agent.cjs
require("dotenv").config();
const axios = require("axios");
const chrono = require("chrono-node");

// ✅ Use HTTPS (Render requires SSL)
const BASE_URL = process.env.MCP_URL || "https://beebo-memory-mcp.onrender.com";
const TOKEN = process.env.MCP_TOKEN || "Zedy1101";

console.log("🚀 Running agent test...");

// Example message the AI might say
const input = "I have a meeting with Adam tomorrow at 4pm.";

// Step 1 — Parse datetime from the input using chrono
const parsedDate = chrono.parseDate(input);
if (parsedDate) {
  console.log("⏰ Parsed datetime:", parsedDate.toISOString());
}

// Step 2 — Try adding a memory
async function addMemory() {
  try {
    const response = await axios.post(
      `${BASE_URL}/memories`,
      {
        text: input,
        type: "event",
        tags: ["work", "meeting"],
        source: "agent.cjs",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-mcp-token": TOKEN,
        },
      }
    );
    console.log("✅ Memory added:", response.data);
  } catch (error) {
    console.error("❌ Error adding memory:", error.response?.data || error.message);
  }
}

// Step 3 — Try recalling memories (simple example)
async function recallMemories() {
  try {
    const response = await axios.get(`${BASE_URL}/memories/all?token=${TOKEN}`);
    console.log(`🧠 Retrieved ${response.data.length || 0} memories`);
    console.log(response.data.slice(-3)); // show last 3 for brevity
  } catch (error) {
    console.error("❌ Error recalling memory:", error.response?.data || error.message);
  }
}

// Run both steps in order
(async () => {
  await addMemory();
  await recallMemories();
})();
