@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Please install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\next\dist\bin\next" (
  echo node_modules is missing. Running npm install...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting NY Rental Map V2 dev server at http://localhost:5503
node ".\node_modules\next\dist\bin\next" dev -p 5503
pause
