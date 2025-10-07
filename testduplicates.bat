@echo off
setlocal enabledelayedexpansion

REM Set base URL and token
set BASE_URL=https://beebo-memory-mcp.onrender.com/memories
set TOKEN=Zedy1101

REM Define test memories
set MEM[1]=First Postgres memory
set MEM[2]=First Postgres memory
set MEM[3]=first postgres memory
set MEM[4]=First Postgres memory 
set MEM[5]=First   Postgres   memory
set MEM[6]=First Postgres memory\n
set MEM[7]=This is a different memory

REM Loop through and POST each memory
for /L %%i in (1,1,7) do (
  echo Adding memory %%i: !MEM[%%i]!
  curl -X POST %BASE_URL% ^
    -H "Content-Type: application/json" ^
    -H "x-mcp-token: %TOKEN%" ^
    -d "{\"text\":\"!MEM[%%i]!\"}"
  echo.
)

REM Fetch all memories after inserts
echo Fetching all memories...
curl "%BASE_URL%/all?token=%TOKEN%"
echo.

endlocal
pause
