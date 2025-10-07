#!/bin/bash
TOKEN="Zedy1101"
BASE="https://beebo-memory-mcp.onrender.com"

echo "🔎 Version check..."
curl -s "$BASE/version"
echo -e "\n"

echo "🧹 Dump all memories (before)..."
curl -s "$BASE/memories/all?token=$TOKEN"
echo -e "\n"

echo "➕ Adding first memory..."
curl -s -X POST "$BASE/memories" \
  -H "Content-Type: application/json" \
  -H "x-mcp-token: $TOKEN" \
  -d '{"text":"First test memory"}'
echo -e "\n"

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

echo "📖 Get memory by ID (2)..."
curl -s "$BASE/memories/2?token=$TOKEN"
echo -e "\n"

echo "🗑️ Deleting memory ID 1..."
curl -s -X DELETE "$BASE/memories/1?token=$TOKEN"
echo -e "\n"

echo "🧹 Dump all memories (final)..."
curl -s "$BASE/memories/all?token=$TOKEN"
echo -e "\n"
