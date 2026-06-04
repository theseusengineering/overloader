#!/usr/bin/env python3
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENDPOINTS = {
    "/api/exercises-repo": {
        "target": ROOT / "exercises.repo.json",
        "schema": "overloader-exercises",
        "array_key": "exercises",
        "label": "Exercise",
    },
    "/api/templates-repo": {
        "target": ROOT / "templates.repo.json",
        "schema": "overloader-templates",
        "array_key": "templates",
        "label": "Template",
    },
}


class RepoSyncHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        endpoint = ENDPOINTS.get(self.path.rstrip("/"))
        if endpoint is None:
            self.send_error(404, "Unknown endpoint")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            validate_payload(payload, endpoint)
            endpoint["target"].write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        except Exception as error:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(error)}).encode("utf-8"))
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "path": str(endpoint["target"])}).encode("utf-8"))


def validate_payload(payload, endpoint):
    array_key = endpoint["array_key"]
    if payload.get("schema") != endpoint["schema"]:
        raise ValueError(f"Expected {endpoint['schema']} schema")
    if not isinstance(payload.get(array_key), list):
        raise ValueError(f"Expected {array_key} array")
    if payload.get("count") != len(payload[array_key]):
        raise ValueError(f"{endpoint['label']} count does not match {array_key} array")


def main():
    parser = argparse.ArgumentParser(description="Serve OverLoader with local repo-sync endpoints.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8799)
    args = parser.parse_args()

    handler = lambda *handler_args, **handler_kwargs: RepoSyncHandler(
        *handler_args,
        directory=str(ROOT),
        **handler_kwargs
    )
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving OverLoader on http://{args.host}:{args.port}/")
    for endpoint in ENDPOINTS.values():
        print(f"{endpoint['label']} pushes write to {endpoint['target']}")
    server.serve_forever()


if __name__ == "__main__":
    main()
