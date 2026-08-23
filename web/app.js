const canvas = document.querySelector("#canvas");
const consoleNode = document.querySelector("#console");
const statusNode = document.querySelector("#status");
const trackedPlayerNode = document.querySelector("#tracked-player");
const overlay = document.querySelector("#progress-overlay");
const progress = document.querySelector("#progress");
const progressLabel = document.querySelector("#progress-label");
const startButton = document.querySelector("#start");
const cameraPrevButton = document.querySelector("#camera-prev");
const cameraNextButton = document.querySelector("#camera-next");
const pauseButton = document.querySelector("#pause");
const scoreboardButton = document.querySelector("#scoreboard");
const fullscreenButton = document.querySelector("#fullscreen");
const demoInput = document.querySelector("#demo-file");
const controls = document.querySelector(".controls");
const scoreboardPanel = document.querySelector("#scoreboard-panel");
const scoreboardBody = document.querySelector("#scoreboard-body");

let engine;
let started = false;
let paused = false;
let scoreboardVisible = false;
let animationFrame;

function log(message) {
  const line = String(message);
  consoleNode.textContent += `${line}\n`;
  consoleNode.scrollTop = consoleNode.scrollHeight;
  console.log(line);
}

function setStatus(text, state) {
  statusNode.textContent = text;
  statusNode.dataset.state = state;
}

function execute(command) {
  if (engine) engine.ccall("WebTF_ExecuteCommand", null, ["string"], [command]);
}

function engineText(exportName, slot) {
  const pointer = engine.ccall(exportName, "number", ["number"], [slot]);
  return pointer ? engine.UTF8ToString(pointer) : "";
}

function updateScoreboard() {
  if (!engine || !scoreboardVisible) return;

  const players = [];
  const maxClients = engine.ccall("WebTF_MaxClients", "number", [], []);
  for (let slot = 0; slot < maxClients; slot += 1) {
    if (!engine.ccall("WebTF_PlayerActive", "number", ["number"], [slot])) continue;
    const spectator = Boolean(engine.ccall("WebTF_PlayerSpectator", "number", ["number"], [slot]));
    players.push({
      spectator,
      team: spectator ? "SPEC" : (engineText("WebTF_PlayerTeam", slot) || "—"),
      name: engineText("WebTF_PlayerName", slot),
      frags: engine.ccall("WebTF_PlayerFrags", "number", ["number"], [slot]),
      ping: engine.ccall("WebTF_PlayerPing", "number", ["number"], [slot]),
    });
  }

  players.sort((a, b) => Number(a.spectator) - Number(b.spectator)
    || a.team.localeCompare(b.team)
    || b.frags - a.frags
    || a.name.localeCompare(b.name));
  scoreboardBody.replaceChildren(...players.map((player) => {
    const row = document.createElement("tr");
    if (player.spectator) row.className = "spectator";
    for (const value of [player.team, player.name, player.frags, player.ping]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    return row;
  }));
}

function setPlaybackControls(enabled) {
  for (const control of [cameraPrevButton, cameraNextButton, pauseButton, scoreboardButton]) {
    control.disabled = !enabled;
  }
}

function resetToggles() {
  paused = false;
  pauseButton.textContent = "ПАУЗА";
  pauseButton.setAttribute("aria-pressed", "false");
  scoreboardVisible = false;
  scoreboardButton.setAttribute("aria-pressed", "false");
  scoreboardPanel.hidden = true;
  execute("cl_demospeed 1");
}

function play(path) {
  if (!engine) return;
  resetToggles();
  execute(`playdemo "${path}"`);
  window.setTimeout(() => {
    engine.ccall("WebTF_CloseMenus", null, [], []);
    execute("mvd_autotrack 4");
    execute("mvd_autotrack_instant 1");
    engine.ccall("WebTF_TrackRelative", null, ["number"], [1]);
  }, 800);
  canvas.focus({ preventScroll: true });
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function updatePlaybackStatus() {
  if (!engine) return;
  const active = engine.ccall("WebTF_DemoPlayback", "number", [], []);
  const time = engine.ccall("WebTF_DemoTime", "number", [], []);
  const track = engine.ccall("WebTF_TrackNum", "number", [], []);
  const namePointer = engine.ccall("WebTF_TrackedName", "number", [], []);
  const name = namePointer ? engine.UTF8ToString(namePointer) : "";

  statusNode.dataset.demo = String(active);
  statusNode.dataset.track = String(track);
  trackedPlayerNode.textContent = `КАМЕРА: ${name || "СВОБОДНАЯ"}`;
  setStatus(active ? `MVD • ${formatTime(time)}${paused ? " • ПАУЗА" : ""}` : "ДЕМКА НЕ ЗАПУЩЕНА", active ? "playing" : (started ? "error" : "ready"));
}

function runFrame() {
  try {
    engine.ccall("WebTF_Frame", null, [], []);
    animationFrame = window.requestAnimationFrame(runFrame);
  } catch (error) {
    window.cancelAnimationFrame(animationFrame);
    log(error?.stack || error);
    setStatus("ОШИБКА КАДРА", "error");
  }
}

async function boot() {
  try {
    const { default: createWebTF } = await import("./build/ezquake.js?v=104");
    engine = await createWebTF({
      canvas,
      arguments: ["-basedir", "/webtf", "-nohome", "-noatlas", "-nomtex", "-game", "fortress"],
      locateFile(path) {
        const url = new URL(`./build/${path}`, import.meta.url);
        url.searchParams.set("v", "104");
        return url.href;
      },
      print: log,
      printErr: log,
      setStatus(message) {
        progressLabel.textContent = message || "Загрузка…";
      },
      monitorRunDependencies(left) {
        progress.value = left ? Math.max(5, 100 - left * 8) : 100;
      },
    });

    startButton.disabled = false;
    fullscreenButton.disabled = false;
    demoInput.disabled = false;
    overlay.hidden = true;
    setStatus("ДВИЖОК ГОТОВ", "ready");
    animationFrame = window.requestAnimationFrame(runFrame);
    window.setInterval(updatePlaybackStatus, 400);
    window.setInterval(updateScoreboard, 800);
  } catch (error) {
    log(error?.stack || error);
    progressLabel.textContent = "Ошибка запуска. Подробности в консоли движка.";
    setStatus("ОШИБКА", "error");
  }
}

startButton.addEventListener("click", () => {
  started = true;
  setPlaybackControls(true);
  play("/webtf/demos/demo.mvd");
  startButton.textContent = "ПЕРЕЗАПУСТИТЬ ДЕМКУ";
  window.setTimeout(updatePlaybackStatus, 250);
});

cameraPrevButton.addEventListener("click", () => {
  engine?.ccall("WebTF_TrackRelative", null, ["number"], [-1]);
  canvas.focus({ preventScroll: true });
});

cameraNextButton.addEventListener("click", () => {
  engine?.ccall("WebTF_TrackRelative", null, ["number"], [1]);
  canvas.focus({ preventScroll: true });
});

pauseButton.addEventListener("click", () => {
  paused = !paused;
  execute(`cl_demospeed ${paused ? 0 : 1}`);
  pauseButton.textContent = paused ? "ПРОДОЛЖИТЬ" : "ПАУЗА";
  pauseButton.setAttribute("aria-pressed", String(paused));
  updatePlaybackStatus();
});

scoreboardButton.addEventListener("click", () => {
  scoreboardVisible = !scoreboardVisible;
  scoreboardPanel.hidden = !scoreboardVisible;
  updateScoreboard();
  scoreboardButton.setAttribute("aria-pressed", String(scoreboardVisible));
  canvas.focus({ preventScroll: true });
});

fullscreenButton.addEventListener("click", () => engine?.requestFullscreen(true, true));

// SDL listens for mouse input on the document. Keep player UI clicks from also
// becoming fire/camera commands inside ezquake-tf.
for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "wheel"]) {
  controls.addEventListener(eventName, (event) => event.stopPropagation());
}

demoInput.addEventListener("change", async () => {
  const file = demoInput.files?.[0];
  if (!file || !engine) return;
  const target = `/tmp/${file.name.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  engine.FS.writeFile(target, new Uint8Array(await file.arrayBuffer()));
  started = true;
  setPlaybackControls(true);
  play(target);
  startButton.textContent = "ЗАПУСТИТЬ ВСТРОЕННУЮ ДЕМКУ";
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  setStatus("WEBGL-КОНТЕКСТ ПОТЕРЯН", "error");
});

boot();
