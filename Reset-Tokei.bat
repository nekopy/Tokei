@echo off
setlocal EnableExtensions

REM Run from repo root so relative paths work.
cd /d "%~dp0\.."

echo.
echo === Tokei Reset ===
echo.
echo This will:
echo  - Delete EVERYTHING in: Tokei\cache\
echo  - Delete EVERYTHING in: Tokei\output\
echo  - Reset: Tokei\config.json back to defaults
echo.
echo After reset you must run: Tokei\Setup-Tokei.bat
echo.

set "CONFIRM="
set /p CONFIRM=Type RESET to continue (anything else cancels) ^> 
if /i not "%CONFIRM%"=="RESET" (
  echo.
  echo Cancelled.
  echo.
  pause
  exit /b 0
)

echo.
set "DEL_TOKEN="
set /p DEL_TOKEN=Also delete Tokei\toggl-token.txt? (y/N) ^> 
set "DEL_TOKEN=%DEL_TOKEN: =%"

set "DEL_TOKEN_FLAG="
if /i "%DEL_TOKEN%"=="y" set "DEL_TOKEN_FLAG=--delete-token"
if /i "%DEL_TOKEN%"=="yes" set "DEL_TOKEN_FLAG=--delete-token"

python Tokei\tools\tokei_reset.py --yes --config Tokei\config.json --cache-dir Tokei\cache --output-dir Tokei\output %DEL_TOKEN_FLAG%
if errorlevel 1 (
  echo.
  echo Reset failed.
  pause
  exit /b 1
)

echo.
echo Reset complete.
echo Next: run Tokei\Setup-Tokei.bat
echo.
pause
endlocal

