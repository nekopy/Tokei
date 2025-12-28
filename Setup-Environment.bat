@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%TOKEI_TRACE%"=="1" (
  echo [TOKEI_TRACE] enabled
  echo on
)

echo.
echo === Tokei Environment Setup ===
echo.

set "PY_LAUNCHER="
set "PY_ARGS="
where py >nul 2>&1
if not errorlevel 1 (
  set "PY_LAUNCHER=py"
  set "PY_ARGS=-3"
) else (
  where python >nul 2>&1
  if errorlevel 1 goto :NO_PYTHON
  set "PY_LAUNCHER=python"
  set "PY_ARGS="
)

goto :PYTHON_OK

:NO_PYTHON
echo Python 3 was not found in PATH.
echo Install Python 3.10+ and re-run this script.
exit /b 1

:PYTHON_OK
if not exist ".venv\Scripts\python.exe" (
  echo Creating local venv at .venv\
  %PY_LAUNCHER% %PY_ARGS% -m venv ".venv"
  if errorlevel 1 (
    echo Failed to create the local venv.
    exit /b 1
  )
) else (
  echo Found existing local venv at .venv\
)

if not exist "requirements.txt" (
  echo requirements.txt not found.
  exit /b 1
)

echo Installing Python dependencies...
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 (
  echo Failed to install Python dependencies.
  exit /b 1
)

if exist "requirements-lemmas.txt" (
  echo.
  echo === Optional: Phase 2 lemma environment (spaCy) ===
  echo This is needed to build spaCy lemmas on Python 3.14 installs.
  echo.

  set "LEMMA_PY="
  where py >nul 2>&1
  if not errorlevel 1 (
    py -3.13 -c "import sys; raise SystemExit(0 if sys.version_info[:2]==(3,13) else 1)" >nul 2>&1
    if not errorlevel 1 (
      set "LEMMA_PY=py -3.13"
    )
  )

  if "%LEMMA_PY%"=="" (
    if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
      set "LEMMA_PY=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    )
  )

  if "%LEMMA_PY%"=="" (
    echo WARN: Python 3.13 not found; skipping spaCy lemma environment setup.
    echo       Install Python 3.13 and re-run Setup-Environment.bat to enable Phase 2.
    goto :AFTER_LEMMA_SETUP
  )

  if not exist ".venv-lemmas\Scripts\python.exe" (
    echo Creating lemma venv at .venv-lemmas\
    %LEMMA_PY% -m venv ".venv-lemmas"
    if errorlevel 1 (
      echo WARN: Failed to create .venv-lemmas\. Skipping spaCy lemma environment setup.
      goto :AFTER_LEMMA_SETUP
    )
  ) else (
    echo Found existing lemma venv at .venv-lemmas\
  )

  echo Installing spaCy dependencies...
  .venv-lemmas\Scripts\python.exe -m pip install -r requirements-lemmas.txt
  if errorlevel 1 (
    echo WARN: Failed to install spaCy dependencies. Skipping model download.
    goto :AFTER_LEMMA_SETUP
  )

  echo Installing spaCy model: ja_core_news_md
  .venv-lemmas\Scripts\python.exe -m spacy download ja_core_news_md
  if errorlevel 1 (
    echo WARN: Failed to install ja_core_news_md. Phase 2 lemma generation will be skipped.
  )

  :AFTER_LEMMA_SETUP
)

echo.
echo Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js 18+ and re-run this script.
  exit /b 1
)

set "NODE_VER="
set "NODE_MAJOR="
for /f "delims=" %%i in ('node -p process.versions.node') do set "NODE_VER=%%i"
for /f "tokens=1 delims=." %%i in ("%NODE_VER%") do set "NODE_MAJOR=%%i"
if "%NODE_MAJOR%"=="" (
  echo Failed to detect Node.js version.
  exit /b 1
)
set /a NODE_MAJOR_NUM=%NODE_MAJOR%
if errorlevel 1 (
  echo Failed to parse Node.js version: %NODE_VER%
  exit /b 1
)
if %NODE_MAJOR_NUM% LSS 18 (
  echo Node.js 18+ is required for global fetch/AbortSignal support.
  exit /b 1
)

call npm --version >nul 2>nul
if errorlevel 1 (
  echo npm was not found in PATH.
  echo Install Node.js ^(with npm^) and re-run this script.
  exit /b 1
)

if exist "package.json" (
  echo Installing Node dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    exit /b 1
  )
) else (
  echo package.json not found. Skipping npm install.
)

if not exist "node_modules\puppeteer\package.json" (
  echo Puppeteer was not installed in node_modules.
  exit /b 1
)

echo.
echo Environment setup complete.
echo Next: run Setup-Tokei.bat (configuration) or run.bat (app).
echo.
endlocal
