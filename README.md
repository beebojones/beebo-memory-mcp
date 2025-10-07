# Beebo Memory MCP

A memory MCP backend for an AI assistant that stores and recalls important information.

Features
- Express REST API: /ping, /memories/all, /memories/search?q=, /memories/by-tag?tag=, POST /memories
- PostgreSQL storage (Render-hosted)
- Token auth via MCP_BRIDGE_TOKEN
- Local agent and listener scripts for testing

Environment Variables
- DATABASE_URL
- MCP_BRIDGE_TOKEN
- OPENAI_API_KEY

Local Development
- Copy .env.example to .env and fill values
- Start server: npm start (or npm run dev with nodemon)
- Try agent: npm run agent
- Try listener: npm run listener
