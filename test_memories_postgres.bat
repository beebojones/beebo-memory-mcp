@echo off
setlocal enabledelayedexpansion

set TOKEN=Zedy1101
set BASE=https://beebo-memory-mcp.onrender.com

:: Make logs folder if it doesn't exist
if not exist logs mkdir logs

:: Build log file name
set DATETIME=%date:~-4%-%date:~4,2%-%date:~7,2%_%time:~0,2%-%time:~3,2%-%time:~6,2%
set DATETIME=%DATETIME: =0%
set LOGFILE=logs\postgres_test_%DATETIME%.log

:: Helper for step headers
:step
echo. >> %LOGFILE%
echo [%time%] %~1 >> %LOGFILE%
echo -------------------------------------------- >> %LOGFILE%
echo.
echo [%time%] %~1
echo --------------------------------------------
goto :eof

cls
call :step "🔎 Version check"
curl -s %BASE%/version >> %LOGFILE%
curl -s %BASE%/version
echo. >> %LOGFILE%

call :step "🧹 Dump all memories (before)"
curl -s "%BASE%/memories/all?token=%TOKEN%" >> %LOGFILE%
curl -s "%BASE%/memories/all?token=%TOKEN%"
echo. >> %LOGFILE%

call :step "➕ Adding unique memory"
curl -s -X POST %BASE%/memories ^
  -H "Content-Type: application/json" ^
  -H "x-mcp-token: %TOKEN%" ^
  -d "{\"text\":\"unique test memory\"}" >> %LOGFILE%
curl -s -X POST %BASE%/memories ^
  -H "Content-Type: application/json" ^
  -H "x-mcp-token: %TOKEN%" ^
  -d "{\"text\":\"unique test memory\"}"
echo. >> %LOGFILE%

call :step "➕ Trying duplicate memory (should fail)"
curl -s -X POST %BASE%/memories ^
  -H "Content-Type: application/json" ^
  -H "x-mcp-token: %TOKEN%" ^
  -d "{\"text\":\"unique test memory\"}" >> %LOGFILE%
curl -s -X POST %BASE%/memories ^
  -H "Content-Type: application/json" ^
  -H "x-mcp-token: %TOKEN%" ^
  -d "{\"text\":\"unique test memory\"}"
echo. >> %LOGFILE%

call :step "🧹 Dump all memories (after)"
curl -s "%BASE%/memories/all?token=%TOKEN%" >> %LOGFILE%
curl -s "%BASE%/memories/all?token=%TOKEN%"
echo. >> %LOGFILE%

call :step "🔍 Search for 'unique'"
curl -s "%BASE%/memories/search?q=unique&token=%TOKEN%" >> %LOGFILE%
curl -s "%BASE%/memories/search?q=unique&token=%TOKEN%"
echo. >> %LOGFILE%

echo ============================================
echo [%time%] ✅ Postgres test sequence complete!
echo Log saved to %LOGFILE%
echo ============================================

pause
