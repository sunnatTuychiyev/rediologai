"""Mammografiya ML xizmati (lokal). Modelni bir marta yuklaydi va Next.js ilovasiga JSON beradi.

  python ml/server.py            # http://127.0.0.1:8765
  MAMMO_DEVICE=cpu python ml/server.py

API:
  GET  /health   -> {"ok": true, "device": "mps", "model": "...", "loadSeconds": 1.6}
  POST /analyze  -> body {"images": [{"file": "<uuid>.png", "laterality": "R", "view": "CC"}, ...]}
                    javob: mammo_engine.MammoEngine.analyze natijasi; issiqlik xaritalari storage/mammo/<uuid>-heat.png

Xavfsizlik: faqat 127.0.0.1 da tinglaydi; faqat storage/mammo ichidagi UUID nomli fayllar qabul qilinadi.
"""
from __future__ import annotations

import json
import os
import re
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from mammo_engine import MammoEngine, ViewInput  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
MAMMO_DIR = ROOT / "storage" / "mammo"
SAFE = re.compile(r"^[0-9a-f-]{36}\.png$")
HOST = os.environ.get("MAMMO_HOST", "127.0.0.1")
PORT = int(os.environ.get("MAMMO_PORT", "8765"))

ENGINE = MammoEngine()
LOCK = threading.Lock()  # bitta GPU — so'rovlar navbat bilan


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            return self._send(200, {"ok": True, "device": ENGINE.device, "model": "ianpan/mammoscreen", "loadSeconds": ENGINE.load_seconds})
        self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/analyze":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if n <= 0 or n > 100_000:
                return self._send(400, {"error": "bad body"})
            body = json.loads(self.rfile.read(n))
            views = []
            for im in body.get("images", [])[:8]:
                name = str(im.get("file", ""))
                lat = str(im.get("laterality", ""))
                view = str(im.get("view", ""))
                if not SAFE.match(name) or lat not in ("R", "L") or view not in ("CC", "MLO", "OTHER"):
                    return self._send(400, {"error": f"noto'g'ri tasvir: {name}"})
                path = MAMMO_DIR / name
                if not path.is_file():
                    return self._send(404, {"error": f"fayl topilmadi: {name}"})
                views.append(ViewInput(str(path), lat, view))
            if not views:
                return self._send(400, {"error": "tasvir yo'q"})
            with LOCK:
                result = ENGINE.analyze(views, heatmap_dir=str(MAMMO_DIR))
            # Javobda to'liq yo'llar emas, faqat fayl nomlari
            for b in result["breasts"].values():
                for v in b["views"]:
                    v["file"] = Path(v.pop("path")).name
            self._send(200, result)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self._send(500, {"error": str(e)[:300]})

    def log_message(self, fmt: str, *args) -> None:  # qisqa log
        sys.stderr.write(f"[ml] {self.address_string()} {fmt % args}\n")


if __name__ == "__main__":
    print(f"[ml] model yuklandi ({ENGINE.device}, {ENGINE.load_seconds}s) — http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
