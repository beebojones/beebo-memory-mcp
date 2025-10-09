# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Project overview
- Purpose: An Express-based REST service that stores and recalls “memories” for an AI assistant, backed by PostgreSQL.
- Key entry points:
  - mcp-memory-bridge.js: HTTP server (Express) and all active routes.
  - agent.cjs / agent.js: Example client scripts that add and recall memories.
  - listener.cjs: Interactive CLI that parses natural language (chrono-node) and saves/recalls memories.
  - memoryPrompt.cjs: Helper exposing recallFromMemory(query) for recall via HTTP.
  - db.js: Exposes a pg Pool, but the server currently manages its own Pool and does not import this module.

Environment
- .env keys (see .env.example):
  - DATABASE_URL: Postgres connection string (Render-hosted in README).
  - MCP_TOKEN: Single token used for both read and write endpoints.
  - OPENAI_API_KEY: Present in .env.example; not required by the server endpoints shown here.
- Token mechanics in server (mcp-memory-bridge.js):
  - All protected endpoints accept MCP_TOKEN via x-mcp-token header or token= query param.

Common commands
- Install dependencies (uses package-lock.json):
  - npm ci
  - If you prefer a local install that can update lockfile: npm install
- Run the API locally:
  - npm start
  - npm run dev (uses nodemon; ensure nodemon is installed or switch to npm start)
- Run helper scripts:
  - npm run agent (executes agent.cjs)
  - npm run listener (executes listener.cjs)
- Tests (curl-based):
  - Windows (PowerShell):
    - .\test_routes.bat
    - .\test_memories.bat
    - .\test_memories_postgres.bat
  - Linux/macOS: ./test_memories.sh
- Run a single test (examples)
  - PowerShell, remote service (Render):
    - $env:MCP_TOKEN="<your_token>"; curl "https://beebo-memory-mcp.onrender.com/ping"
    - curl -Method POST -Uri "https://beebo-memory-mcp.onrender.com/memories" -Headers @{"Content-Type"="application/json";"x-mcp-token"=$env:MCP_TOKEN} -Body (@{text="Test memory from Warp"} | ConvertTo-Json)
    - curl "https://beebo-memory-mcp.onrender.com/memories/recall?q=Test&token=$env:MCP_TOKEN"
  - PowerShell, local server:
    - $env:MCP_TOKEN="<your_token>"
    - npm start
    - curl "http://localhost:10000/ping"
    - curl -Method POST -Uri "http://localhost:10000/memories" -Headers @{"Content-Type"="application/json";"x-mcp-token"=$env:MCP_TOKEN} -Body (@{text="Local memory"} | ConvertTo-Json)
    - curl "http://localhost:10000/memories/recall?q=Local&token=$env:MCP_TOKEN"

HTTP service (mcp-memory-bridge.js)
- Express server with pg Pool using DATABASE_URL and SSL (rejectUnauthorized: false) suitable for Render-hosted Postgres.
- Routes implemented:
  - GET /ping: Health and DB connectivity check.
  - GET /version: Static version string plus commit from GIT_COMMIT env if present.
  - POST /memories: Create or update memory with deduplication by normalized text.
    - Body fields: text (required), type (default "note"), tags (array or JSON-encoded string), ts (ISO timestamp, optional), source (default "manual").
    - Normalization: text_norm = lowercase(trim(text)).
    - Insert with ON CONFLICT (text_norm) DO UPDATE SET last_updated = NOW().
  - GET /memories/all: Return all memories ordered by created_at DESC.
  - GET /memories/recall: Text search against text_norm using ILIKE %q%, ordered by last_updated DESC, with optional limit.
  - GET /: Returns service metadata including base_url.

Data model expectations (inferred from queries)
- Table memories with columns: id, text, text_norm, type, tags (jsonb), ts (timestamp), source, created_at, last_updated.
- Unique constraint on text_norm to enable de-duplication.

Client/utility scripts
- agent.cjs: Demonstrates chrono-node timestamp extraction, adds an event memory, then reads back via /memories/all.
- agent.js: Similar to agent.cjs; also demonstrates recall via memoryPrompt.cjs.
- listener.cjs: Interactive readline loop. Commands:
  - "remember <text>": Adds memory; names are extracted for tagging, chrono-node parses a timestamp.
  - "when <name>" / "what <name>": Recalls matching memory via /memories/recall.
- memoryPrompt.cjs: recallFromMemory(query) → calls /memories/recall and returns a formatted string.

Important notes and mismatches
- Older references in scripts pointed to endpoints that previously did not exist; the server now implements /memories/search, /by-tag, /by-type, /recent, /today, and GET/DELETE by id.
- memoryClient.js contains a hardcoded token and legacy endpoints; treat it as sample-only.
- db.js exports a Pool but is currently unused by mcp-memory-bridge.js (the server creates its own Pool).

Key info from README.md
- Features:
  - /ping, /memories/all, /memories/recall (as implemented); PostgreSQL storage; token auth; local agent/listener.
- Local development quick start:
  - Copy .env.example to .env and fill values.
  - Start server: npm start (or npm run dev if nodemon is available).
  - Try agent: npm run agent.
  - Try listener: npm run listener.
