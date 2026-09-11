#!/usr/bin/env python3

from __future__ import annotations

import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from random import randint
from urllib.parse import urlsplit


HOST = "127.0.0.1"
PORT = 9512
UNIVERSE_SIZE = 32

PATCH = {
    "universe": 1,
    "fixtures": [
        {
            "id": "front_left",
            "label": "Front Left Wash",
            "personality": {"intensity": 1, "red": 2, "green": 3, "blue": 4, "white": 5},
            "group_ids": ["front_wash", "all_wash", "all"],
            "x": 16,
            "y": 72,
        },
        {
            "id": "front_right",
            "label": "Front Right Wash",
            "personality": {"intensity": 6, "red": 7, "green": 8, "blue": 9, "white": 10},
            "group_ids": ["front_wash", "all_wash", "all"],
            "x": 84,
            "y": 72,
        },
        {
            "id": "back_left",
            "label": "Back Left Beam",
            "personality": {"intensity": 11, "red": 12, "green": 13, "blue": 14, "white": 15},
            "group_ids": ["back_beams", "all"],
            "x": 22,
            "y": 24,
        },
        {
            "id": "back_right",
            "label": "Back Right Beam",
            "personality": {"intensity": 16, "red": 17, "green": 18, "blue": 19, "white": 20},
            "group_ids": ["back_beams", "all"],
            "x": 78,
            "y": 24,
        },
        {
            "id": "center_strobe",
            "label": "Center Strobe",
            "personality": {"intensity": 21, "white": 22},
            "group_ids": ["strobes", "all"],
            "x": 50,
            "y": 38,
        },
        {
            "id": "floor_glow",
            "label": "Floor Glow",
            "personality": {"intensity": 23, "red": 24, "green": 25, "blue": 26},
            "group_ids": ["floor", "all"],
            "x": 50,
            "y": 88,
        },
    ],
    "groups": [
        {"id": "all", "label": "Whole Rig", "fixture_ids": ["front_left", "front_right", "back_left", "back_right", "center_strobe", "floor_glow"]},
        {"id": "all_wash", "label": "All Washes", "fixture_ids": ["front_left", "front_right"]},
        {"id": "front_wash", "label": "Front Wash", "fixture_ids": ["front_left", "front_right"]},
        {"id": "back_beams", "label": "Back Beams", "fixture_ids": ["back_left", "back_right"]},
        {"id": "strobes", "label": "Strobes", "fixture_ids": ["center_strobe"]},
        {"id": "floor", "label": "Floor Glow", "fixture_ids": ["floor_glow"]},
    ],
}

SCENES = [
    {"id": "blackout", "label": "Blackout", "target_group_id": "all", "values": {"intensity": 0, "red": 0, "green": 0, "blue": 0, "white": 0}},
    {"id": "full_white", "label": "Full White", "target_group_id": "all", "values": {"intensity": 255, "red": 255, "green": 255, "blue": 255, "white": 255}},
    {"id": "club_purple", "label": "Club Purple", "target_group_id": "all", "values": {"intensity": 220, "red": 190, "green": 30, "blue": 255, "white": 0}},
    {"id": "acid_green", "label": "Acid Green", "target_group_id": "all", "values": {"intensity": 210, "red": 30, "green": 255, "blue": 80, "white": 0}},
    {"id": "front_warm", "label": "Front Warm", "target_group_id": "front_wash", "values": {"intensity": 190, "red": 255, "green": 150, "blue": 60, "white": 80}},
    {"id": "back_blue", "label": "Back Blue", "target_group_id": "back_beams", "values": {"intensity": 230, "red": 20, "green": 90, "blue": 255, "white": 0}},
    {"id": "strobe_hit", "label": "Strobe Hit", "target_group_id": "strobes", "values": {"intensity": 255, "white": 255}},
    {"id": "random_rig", "label": "Random Rig", "target_group_id": "all", "values": {}},
]


class DemoState:
    def __init__(self) -> None:
        self.channels = [0] * UNIVERSE_SIZE
        self.revision = 0
        self.armed = True
        self.last_event = "Demo rig online"
        self.updated_at = time.time()

    def write_group(self, group_id: str, values: dict[str, int | None]) -> None:
        group = next((entry for entry in PATCH["groups"] if entry["id"] == group_id), None)
        if group is None:
            raise ValueError(f"Unknown group_id: {group_id}")

        resolved = {key: clamp_channel(value) for key, value in values.items() if value is not None}
        if group_id == "all" and not resolved:
            resolved = {
                "intensity": randint(120, 255),
                "red": randint(0, 255),
                "green": randint(0, 255),
                "blue": randint(0, 255),
                "white": randint(0, 120),
            }

        for fixture_id in group["fixture_ids"]:
            fixture = next((entry for entry in PATCH["fixtures"] if entry["id"] == fixture_id), None)
            if fixture is None:
                continue
            for logical_name, channel_number in fixture["personality"].items():
                if logical_name in resolved:
                    self.channels[channel_number - 1] = resolved[logical_name]

        self.revision += 1
        self.updated_at = time.time()
        self.last_event = f"{group_id}: " + ", ".join(f"{key}={value}" for key, value in sorted(resolved.items()))

    def blackout(self) -> None:
        self.channels = [0] * UNIVERSE_SIZE
        self.revision += 1
        self.updated_at = time.time()
        self.last_event = "Blackout"


STATE = DemoState()


def clamp_channel(value: int | float | None) -> int:
    if value is None:
        return 0
    return max(0, min(255, round(float(value))))


def public_patch() -> dict[str, object]:
    return {
        "universe": PATCH["universe"],
        "fixtures": [
            {
                "id": fixture["id"],
                "label": fixture["label"],
                "personality": fixture["personality"],
                "group_ids": fixture["group_ids"],
            }
            for fixture in PATCH["fixtures"]
        ],
        "groups": PATCH["groups"],
    }


def state_payload() -> dict[str, object]:
    return {
        "connection": {
            "connected": True,
            "backend": "simulator",
            "armed": STATE.armed,
            "patch_path": "dmxdemo.ussyco.de/fake-stage",
        },
        "backend": "simulator",
        "armed": STATE.armed,
        "patch": public_patch(),
        "scenes": [{"id": scene["id"], "label": scene["label"], "target_group_id": scene["target_group_id"]} for scene in SCENES],
        "universe": {
            "universe": PATCH["universe"],
            "revision": STATE.revision,
            "channels": STATE.channels,
            "source": "observed",
        },
        "demo": {
            "last_event": STATE.last_event,
            "updated_at": STATE.updated_at,
            "fixtures": [
                {"id": fixture["id"], "x": fixture["x"], "y": fixture["y"]}
                for fixture in PATCH["fixtures"]
            ],
        },
    }


class DemoHandler(BaseHTTPRequestHandler):
    server_version = "ShoedelussyDmxDemo/1.0"

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/":
            self.write_html()
        elif path in {"/jam", "/record", "/all-in-one"}:
            self.write_html(JAM_HTML)
        elif path == "/health":
            self.write_json({"ok": True, "connected": True, "backend": "simulator", "armed": STATE.armed})
        elif path == "/state":
            self.write_json(state_payload())
        elif path == "/patch":
            self.write_json(public_patch())
        elif path == "/scenes":
            self.write_json({"scenes": state_payload()["scenes"]})
        else:
            self.write_json({"error": "Not found"}, 404)

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        try:
            payload = self.read_json_body()
            if path == "/control/arm":
                STATE.armed = True
                STATE.revision += 1
                STATE.last_event = "Armed"
                self.write_json({"success": True, "armed": True, "revision": STATE.revision})
            elif path == "/control/disarm":
                STATE.armed = False
                STATE.revision += 1
                STATE.last_event = "Disarmed"
                self.write_json({"success": True, "armed": False, "revision": STATE.revision})
            elif path == "/control/blackout":
                STATE.blackout()
                self.write_json({"success": True, "revision": STATE.revision})
            elif path == "/control/group":
                group_id = str(payload.get("group_id", ""))
                if not group_id:
                    self.write_json({"error": "group_id is required"}, 400)
                    return
                STATE.write_group(group_id, {key: payload.get(key) for key in ["intensity", "red", "green", "blue", "white"]})
                self.write_json({"success": True, "group_id": group_id, "revision": STATE.revision})
            elif path == "/scenes/apply":
                scene_id = str(payload.get("scene_id", ""))
                scene = next((entry for entry in SCENES if entry["id"] == scene_id), None)
                if scene is None:
                    self.write_json({"error": "scene not found"}, 404)
                    return
                values = scene["values"] or {
                    "intensity": randint(120, 255),
                    "red": randint(0, 255),
                    "green": randint(0, 255),
                    "blue": randint(0, 255),
                    "white": randint(0, 100),
                }
                STATE.write_group(scene["target_group_id"], values)
                STATE.last_event = f"Scene: {scene['label']}"
                self.write_json({"success": True, "scene_id": scene_id, "revision": STATE.revision})
            else:
                self.write_json({"error": "Not found"}, 404)
        except ValueError as error:
            self.write_json({"error": str(error)}, 400)
        except Exception as error:
            self.write_json({"error": str(error)}, 500)

    def read_json_body(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        if length > 65536:
            raise ValueError("Request body is too large")
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError("Invalid JSON body") from error

    def write_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def write_html(self, html: str = None) -> None:
        body = (html or HTML).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Shoedelussy DMX Demo Rig</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #020617; color: #e0f2fe; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 50% 20%, #0f172a, #020617 55%, #000); }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; min-height: 100vh; padding: 20px; }
    .stage { position: relative; overflow: hidden; min-height: calc(100vh - 40px); border: 1px solid rgba(34, 211, 238, .28); border-radius: 28px; background: linear-gradient(180deg, rgba(15,23,42,.8), rgba(2,6,23,.96)); box-shadow: inset 0 0 80px rgba(34,211,238,.08); }
    .floor { position: absolute; left: 8%; right: 8%; bottom: 7%; height: 26%; border: 1px solid rgba(148,163,184,.18); border-radius: 50%; background: radial-gradient(ellipse at center, rgba(15,23,42,.9), rgba(0,0,0,.2)); transform: perspective(500px) rotateX(62deg); }
    .fixture { position: absolute; width: 84px; height: 84px; margin: -42px 0 0 -42px; display: grid; place-items: center; border-radius: 999px; border: 1px solid rgba(255,255,255,.18); background: #020617; transition: transform .04s linear, box-shadow .04s linear; }
    .beam { position: absolute; left: 50%; top: 50%; width: 220px; height: 220px; transform: translate(-50%, -50%) scale(var(--scale, .05)); border-radius: 999px; background: radial-gradient(circle, rgba(var(--rgb), .72), rgba(var(--rgb), .24) 38%, rgba(var(--rgb), 0) 72%); filter: blur(3px); opacity: var(--opacity, 0); pointer-events: none; }
    .fixture strong { z-index: 2; max-width: 70px; text-align: center; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: rgba(224,242,254,.9); }
    aside { border: 1px solid rgba(34, 211, 238, .26); border-radius: 24px; background: rgba(2,6,23,.84); padding: 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,.06); }
    h1 { margin: 0; font-size: 20px; }
    .eyebrow { color: #22d3ee; font-size: 11px; letter-spacing: .24em; text-transform: uppercase; }
    .status { margin: 12px 0; padding: 10px; border-radius: 14px; background: rgba(8,47,73,.35); color: #bae6fd; font-size: 12px; }
    button { width: 100%; margin: 5px 0; border: 1px solid rgba(34,211,238,.35); border-radius: 12px; background: rgba(8,47,73,.45); color: #ecfeff; padding: 10px 12px; cursor: pointer; text-align: left; }
    button:hover { background: rgba(14,116,144,.45); }
    .channels { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin-top: 12px; }
    .channel { height: 34px; border-radius: 7px; background: rgba(15,23,42,.8); border: 1px solid rgba(148,163,184,.16); transform-origin: bottom; }
    code { color: #67e8f9; }
    @media (max-width: 860px) { main { grid-template-columns: 1fr; } .stage { min-height: 58vh; } }
  </style>
</head>
<body>
  <main>
    <section class="stage" id="stage"><div class="floor"></div></section>
    <aside>
      <div class="eyebrow">Shoedelussy DMX Demo</div>
      <h1>Fake Lighting Rig</h1>
      <div class="status" id="status">Waiting for state...</div>
      <p>This page is both a visualizer and a simulator-compatible bridge. Point Shoedelussy at <code>https://dmxdemo.ussyco.de</code> and watch this page react.</p>
      <div id="sceneButtons"></div>
      <div class="channels" id="channels"></div>
    </aside>
  </main>
  <script>
    const stage = document.getElementById('stage');
    const statusBox = document.getElementById('status');
    const sceneButtons = document.getElementById('sceneButtons');
    const channelsEl = document.getElementById('channels');
    let fixtureNodes = new Map();
    let sceneButtonsReady = false;

    const post = (path, payload = {}) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    function value(data, fixture, key) {
      const channel = fixture.personality[key];
      return channel ? data.universe.channels[channel - 1] || 0 : 0;
    }

    function render(data) {
      statusBox.textContent = `${data.demo.last_event} · revision ${data.universe.revision} · ${data.armed ? 'armed' : 'disarmed'}`;
      const positions = new Map(data.demo.fixtures.map((entry) => [entry.id, entry]));
      for (const fixture of data.patch.fixtures) {
        let node = fixtureNodes.get(fixture.id);
        if (!node) {
          node = document.createElement('div');
          node.className = 'fixture';
          node.innerHTML = '<div class="beam"></div><strong></strong>';
          stage.appendChild(node);
          fixtureNodes.set(fixture.id, node);
        }
        const pos = positions.get(fixture.id) || { x: 50, y: 50 };
        const intensity = value(data, fixture, 'intensity');
        const red = Math.max(value(data, fixture, 'red'), value(data, fixture, 'white'));
        const green = Math.max(value(data, fixture, 'green'), value(data, fixture, 'white'));
        const blue = Math.max(value(data, fixture, 'blue'), value(data, fixture, 'white'));
        node.style.left = `${pos.x}%`;
        node.style.top = `${pos.y}%`;
        node.style.transform = `scale(${1 + intensity / 700})`;
        node.style.boxShadow = `0 0 ${8 + intensity / 4}px rgba(${red}, ${green}, ${blue}, ${0.15 + intensity / 320})`;
        node.style.setProperty('--rgb', `${red}, ${green}, ${blue}`);
        node.style.setProperty('--scale', `${0.12 + intensity / 160}`);
        node.style.setProperty('--opacity', `${intensity / 255}`);
        node.querySelector('strong').textContent = fixture.label;
      }
      channelsEl.innerHTML = data.universe.channels.slice(0, 32).map((channel) => `<div class="channel" style="opacity:${0.18 + channel / 255}; transform:scaleY(${0.18 + channel / 255}); background:rgba(34,211,238,${0.15 + channel / 300})"></div>`).join('');
      if (!sceneButtonsReady) {
        sceneButtons.innerHTML = data.scenes.map((scene) => `<button data-scene="${scene.id}">${scene.label}<br><small>${scene.target_group_id}</small></button>`).join('');
        sceneButtons.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => post('/scenes/apply', { scene_id: button.dataset.scene })));
        sceneButtonsReady = true;
      }
    }

    let pollInFlight = false;
    async function poll() {
      if (pollInFlight) return;
      pollInFlight = true;
      try {
        const response = await fetch('/state', { cache: 'no-store' });
        render(await response.json());
      } catch (error) {
        statusBox.textContent = 'State unavailable';
      } finally {
        pollInFlight = false;
      }
    }

    poll();
    setInterval(poll, 50);
  </script>
</body>
</html>'''


JAM_HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Shoedelussy + DMX Recording Demo</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #020617; color: #e0f2fe; }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; background: radial-gradient(circle at top, #082f49, #020617 42%, #000 100%); overflow: hidden; }
    header { height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 16px; border-bottom: 1px solid rgba(34,211,238,.22); background: rgba(2,6,23,.9); }
    h1 { margin: 0; font-size: 15px; letter-spacing: .16em; text-transform: uppercase; color: #a5f3fc; }
    p { margin: 0; font-size: 12px; color: #bae6fd; }
    a { color: #67e8f9; }
    .shell { height: calc(100% - 58px); display: grid; grid-template-columns: minmax(0, 1.22fr) minmax(390px, .78fr); gap: 10px; padding: 10px; }
    .pane { overflow: hidden; border: 1px solid rgba(34,211,238,.24); border-radius: 18px; background: #020617; box-shadow: 0 18px 60px rgba(0,0,0,.35); }
    .pane-title { height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; border-bottom: 1px solid rgba(34,211,238,.16); color: #67e8f9; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; background: rgba(8,47,73,.45); }
    iframe { display: block; width: 100%; height: calc(100% - 34px); border: 0; background: #000; }
    .actions { display: flex; align-items: center; gap: 10px; white-space: nowrap; }
    button { border: 1px solid rgba(34,211,238,.35); border-radius: 999px; background: rgba(14,116,144,.36); color: #ecfeff; padding: 7px 11px; cursor: pointer; font: inherit; font-size: 12px; }
    button:hover { background: rgba(14,116,144,.58); }
    @media (max-width: 980px) {
      body { overflow: auto; }
      header { height: auto; align-items: flex-start; flex-direction: column; }
      .shell { height: auto; grid-template-columns: 1fr; }
      .pane { height: 72vh; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Shoedelussy + DMX Recording Demo</h1>
      <p>Press Play in the left pane. The right pane is the fake rig receiving scene and group writes from the demo project.</p>
    </div>
    <div class="actions">
      <button id="blackout">Blackout rig</button>
      <a href="https://strudel.ussyco.de/?template=demo" target="_blank" rel="noreferrer">Open Strudel tab</a>
      <a href="/" target="_blank" rel="noreferrer">Open rig tab</a>
    </div>
  </header>
  <main class="shell">
    <section class="pane">
      <div class="pane-title"><span>Strudelussy Demo Project</span><span>strudel.ussyco.de</span></div>
      <iframe title="Shoedelussy Strudel demo" src="https://strudel.ussyco.de/?template=demo" allow="autoplay; clipboard-read; clipboard-write"></iframe>
    </section>
    <section class="pane">
      <div class="pane-title"><span>Fake DMX Rig</span><span>dmxdemo.ussyco.de</span></div>
      <iframe title="DMX fake rig" src="/" allow="autoplay"></iframe>
    </section>
  </main>
  <script>
    document.getElementById('blackout').addEventListener('click', () => {
      fetch('/control/blackout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    });
  </script>
</body>
</html>'''


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), DemoHandler)
    print(f"DMX demo serving on http://{HOST}:{PORT}")
    server.serve_forever()
