@echo off
echo === Adding test memory ===
curl -X POST https://beebo-memory-mcp.onrender.com/memories ^
  -H "Content-Type: application/json" ^
  -H "x-mcp-token: Zedy1101" ^
  -d "{\"text\":\"Project kickoff with Adam\",\"type\":\"event\",\"tags\":[\"work\",\"meeting\"],\"meta\":{\"location\":\"Zoom\"}}" > add_result.json

echo.
echo === New memory added ===
type add_result.json
echo.

:: Extract the new memory ID from JSON (basic find trick)
for /f "tokens=2 delims=:,}" %%a in ('findstr /i "id" add_result.json') do set NEW_ID=%%a
set NEW_ID=%NEW_ID: =%
echo New memory ID = %NEW_ID%
echo.

echo === Fetching all memories (limit 5) ===
curl "https://beebo-memory-mcp.onrender.com/memories/all?token=Zedy1101"
echo.

echo === Search by text: 'Project' ===
curl "https://beebo-memory-mcp.onrender.com/memories/search?q=Project&token=Zedy1101"
echo.

echo === Search by tag: work ===
curl "https://beebo-memory-mcp.onrender.com/memories/by-tag?tag=work&token=Zedy1101"
echo.

echo === Search by type: event ===
curl "https://beebo-memory-mcp.onrender.com/memories/by-type?type=event&token=Zedy1101"
echo.

echo === Fetch most recent 3 memories ===
curl "https://beebo-memory-mcp.onrender.com/memories/recent?limit=3&token=Zedy1101"
echo.

echo === Deleting the test memory ===
curl -X DELETE "https://beebo-memory-mcp.onrender.com/memories/%NEW_ID%?token=Zedy1101"
echo.

del add_result.json

pause
