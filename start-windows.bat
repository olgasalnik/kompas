@echo off
rem Kompas: start on Windows with a double click.
rem First run installs dependencies (1-3 minutes), then opens http://localhost:5180 in the browser.
cd /d "%~dp0"
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org , install it and run this file again.
  start "" https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies - first run only, 1-3 minutes...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo Kompas is starting: http://localhost:5180
echo Keep this window open while you use the site. Close it to stop.
echo.
call npm run dev -- --open
pause
