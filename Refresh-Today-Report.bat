@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo === Tokei Refresh (Overwrite Today's Report) ===
echo.
echo This will:
echo  - Fetch fresh Toggl data and regenerate today's report
echo  - Overwrite the existing HTML/PNG for today's report number (if one exists)
echo  - NOT create a second report for today
echo.

if "%TOKEI_FORCE_OVERWRITE%"=="1" goto :AFTER_CONFIRM
set "CONFIRM="
set /p CONFIRM=Type OVERWRITE to continue (anything else cancels) ^> 
if /i not "%CONFIRM%"=="OVERWRITE" (
  echo.
  echo Cancelled.
  echo.
  pause
  exit /b 0
)
:AFTER_CONFIRM

if not exist ".venv\Scripts\activate.bat" (
  echo.
  echo Local venv not found at .venv\Scripts\activate.bat
  echo Run Setup-Environment.bat first.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js was not found in PATH.
  echo Install Node.js ^(18+ recommended^) and re-run Setup-Environment.bat.
  pause
  exit /b 1
)

if not exist "node_modules\puppeteer\package.json" (
  echo.
  echo Puppeteer is not installed in this folder.
  echo Run Setup-Environment.bat to install Node dependencies.
  pause
  exit /b 1
)

call ".venv\Scripts\activate.bat"
if errorlevel 1 (
  echo.
  echo Failed to activate the local venv.
  pause
  exit /b 1
)

node Tokei.mjs --overwrite-today
if errorlevel 1 pause

endlocal

