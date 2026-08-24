from __future__ import annotations

import argparse
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit


PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = (PROJECT_ROOT / "web").resolve()
DEMOS_ROOT = (PROJECT_ROOT / "demos").resolve()


class WebTFHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        request_path = PurePosixPath(unquote(urlsplit(path).path))
        parts = [part for part in request_path.parts if part not in {"/", "", ".", ".."}]

        root = WEB_ROOT
        if parts[:2] == ["webtf", "demos"]:
            root = DEMOS_ROOT
            parts = parts[2:]
        elif parts[:1] == ["demos"]:
            root = DEMOS_ROOT
            parts = parts[1:]
        elif parts[:1] == ["webtf"]:
            parts = parts[1:]

        candidate = root.joinpath(*parts).resolve()
        if not candidate.is_relative_to(root):
            return os.fspath(root / "__not_found__")
        return os.fspath(candidate)

    def end_headers(self) -> None:
        path = urlsplit(self.path).path
        if "/build/" in path or "/packs/" in path:
            self.send_header("Cache-Control", "public, max-age=2592000, immutable")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve WebTF and external demo files locally")
    parser.add_argument("port", nargs="?", type=int, default=3000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), WebTFHandler)
    print(f"WebTF: http://localhost:{args.port}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
