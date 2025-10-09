# Beebo Memory MCP

A memory MCP backend for an AI assistant that stores and recalls important information.

Features
- Express REST API:
  - GET /ping
  - GET /version
  - POST /memories
  - GET /memories/all
  - GET /memories/recall?q=... (free-text search)
  - GET /memories/search?q=... (alias of recall)
  - GET /memories/by-tag?tag=...
  - GET /memories/by-type?type=...
  - GET /memories/recent?limit=5
  - GET /memories/today
  - GET /memories/:id
  - DELETE /memories/:id
- PostgreSQL storage (Render-hosted) with automatic schema initialization
- Token auth via MCP_TOKEN for both reads and writes.
- Local agent and listener scripts for testing

Environment Variables
- DATABASE_URL
- MCP_TOKEN (used for both read and write)
- OPENAI_API_KEY

Local Development
- Copy .env.example to .env and fill values (set MCP_TOKEN).
- Start server: npm start (or npm run dev with nodemon)
- Try agent: npm run agent
- Try listener: npm run listener
