@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  py -3.12 -m venv .venv
)

call ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 exit /b 1

REM Всегда пересобираем UI — иначе после первого запуска остаётся старый index.html без новых кнопок.
if exist "frontend\package.json" (
  cd frontend
  if not exist "node_modules\" call npm install
  if errorlevel 1 exit /b 1
  call npm run build
  if errorlevel 1 exit /b 1
  cd ..
)

set PORT=8000
start "" http://127.0.0.1:%PORT%
call ".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 0.0.0.0 --port %PORT%
