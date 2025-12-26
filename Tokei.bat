@echo off
setlocal

REM Run from repo root so relative paths (design/templates, tools/) work.
cd /d "%~dp0\.."

REM You can set your Toggl API token here, or use TOGGL_API_TOKEN in your user env,
REM or create Tokei\toggl-token.txt (one line).
REM set "TOGGL_API_TOKEN=YOUR_TOKEN_HERE"

node Tokei\Tokei.mjs
if errorlevel 1 pause

endlocal

