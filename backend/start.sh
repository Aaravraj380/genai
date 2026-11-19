#!/usr/bin/env sh
# Focus & Flow API — start on macOS/Linux.
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt || exit 1
fi
exec .venv/bin/python run.py
