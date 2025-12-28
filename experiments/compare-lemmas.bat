@echo off
setlocal EnableExtensions

set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo.
echo === EXPERIMENT (READ-ONLY): Compare Lemma Counts ===
echo.
echo This does NOT modify any database.
echo It compares:
echo   - AnkiMorphs ^(ankimorphs.db^) lemma counts
echo   - Tokei ^(spaCy-derived^) lemma counts in cache\tokei_words.sqlite
echo.

set "PY=.venv\Scripts\python.exe"
if not exist "%PY%" (
  set "PY=python"
  echo WARN: Local venv not found at .venv\Scripts\python.exe - using python from PATH.
)

%PY% experiments\compare_lemmas.py
echo.
if "%TOKEI_NO_PAUSE%"=="1" goto :END
pause
:END

endlocal
