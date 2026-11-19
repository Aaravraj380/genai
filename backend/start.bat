@echo off
REM Focus & Flow API — one-click start for Windows.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Creating virtual environment...
  python -m venv .venv || (echo Python 3.11+ is required: https://www.python.org/downloads/ & pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\python.exe" -m pip install -r requirements-dev.txt || (pause & exit /b 1)
)
".venv\Scripts\python.exe" run.py
pause
