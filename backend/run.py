"""Start the API so phones on the same Wi-Fi can reach it.

    python run.py            # http://0.0.0.0:8000, auto-reload on code changes
    python run.py --port 9000
"""

import argparse

import uvicorn

from app.main import lan_ip

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Focus & Flow API")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-reload", action="store_true")
    args = parser.parse_args()
    ip = lan_ip()
    print("\n  Focus & Flow API")
    print(f"  This computer : http://localhost:{args.port}")
    print(f"  Phone (Wi-Fi) : http://{ip or '<your-PC-IP>'}:{args.port}")
    print(f"  API docs      : http://localhost:{args.port}/docs\n")
    uvicorn.run("app.main:app", host="0.0.0.0", port=args.port, reload=not args.no_reload)
