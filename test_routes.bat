@echo off
echo === Testing MCP Memory Bridge Routes ===

:: Version check
echo.
echo --- /version ---
for /f "delims=" %%i in ('curl -s https://beebo-memory-mcp.onrender.com/version') do set VERSION_JSON=%%i
echo %VERSION_JSON%

:: Extract commit hash from JSON (very simple parse)
echo %VERSION_JSON% | findstr /i "unknown" >nul
if %errorlevel%==0 (
  echo ⚠️  Commit hash not available (Render may not have deployed yet)
) else (
  echo ✅ Commit hash detected.
)

:: Ping
echo.
echo --- /ping ---
curl "https://beebo-memory-mcp.onrender.com/ping"

:: Insert a test memory
echo.
echo --- POST /memories ---
curl -X POST https://beebo-memory-mcp.onrender.com/memories ^
  -H "Content-Type: application/json" ^
  -H "x-mcp-token: Zedy1101" ^
  -d "{\"text\":\"Batch test memory\",\"type\":\"event\",\"tags\":[\"work\",\"test\"],\"source\":\"batch\"}"

:: Get all
echo.
echo --- /memories/all ---
curl "https://beebo-memory-mcp.onrender.com/memories/all?token=Zedy1101"

:: Get by tag
echo.
echo --- /memories/by-tag (work) ---
curl "https://beebo-memory-mcp.onrender.com/memories/by-tag?tag=work&token=Zedy1101"

:: Get today
echo.
echo --- /memories/today ---
curl "https://beebo-memory-mcp.onrender.com/memories/today?token=Zedy1101"

echo.
echo === Test Complete ===
pause
