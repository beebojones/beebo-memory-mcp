#!/bin/bash
TOKEN="${MCP_TOKEN:-Zedy1101}"
BASE="${MCP_URL:-https://beebo-memory-mcp.onrender.com}"

echo "🔎 Version check..."
curl -s "$BASE/version"
echo -e "\n"

echo "🧹 Dump all memories (before)..."
curl -s "$BASE/memories/all?token=$TOKEN"
echo -e "\n"

echo "➕ Adding first memory..."
ADD_JSON=$(curl -s -X POST "$BASE/memories" \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $TOKEN" \
  -d '{"text":"First test memory"}')
echo "$ADD_JSON"
echo -e "\n"

NEW_ID=$(echo "$ADD_JSON" | grep -o '"id":"[^"]*"' | sed 's/"id":"\([^"]*\)"/\1/')

echo "➕ Adding duplicate memory..."
curl -s -X POST "$BASE/memories" \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $TOKEN" \
  -d '{"text":"First test memory"}'
echo -e "\n"

echo "➕ Adding second memory..."
curl -s -X POST "$BASE/memories" \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $TOKEN" \
  -d '{"text":"Second test memory"}'
echo -e "\n"

echo "🧹 Dump all memories (after)..."
curl -s "$BASE/memories/all?token=$TOKEN"
echo -e "\n"

echo "🔍 Search for 'Second'..."
curl -s "$BASE/memories/search?q=Second&token=$TOKEN"
echo -e "\n"

if [ -n "$NEW_ID" ]; then
  echo "📖 Get memory by ID ($NEW_ID)..."
  curl -s "$BASE/memories/$NEW_ID?token=$TOKEN"
  echo -e "\n"

  echo "🗑️ Deleting memory ID $NEW_ID..."
  curl -s -X DELETE "$BASE/memories/$NEW_ID?token=$TOKEN"
  echo -e "\n"
fi

echo "🧹 Dump all memories (final)..."
curl -s "$BASE/memories/all?token=$TOKEN"
echo -e "\n"
