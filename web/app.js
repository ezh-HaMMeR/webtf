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
const fullscreenButton = document.querySelector("#fullscreen");
const demoInput = document.querySelector("#demo-file");
const controls = document.querySelector(".controls");

let engine;
let started = false;
let paused = false;
let animationFrame;
let initialTrackTimer;

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

function setPlaybackControls(enabled) {
  for (const control of [cameraPrevButton, cameraNextButton, pauseButton]) {
    control.disabled = !enabled;
  }
}

function applyViewerOverrides() {
  for (const command of [
    "mvd_autotrack 0",
    "demo_autotrack 0",
    "cl_hightrack 0",
    "scr_autoid 1",
    "hud_teammates_show 0",
    "show_teammates_status 0",
    "scr_teaminfo 0",
  ]) execute(command);
}

function trackRelative(direction) {
  if (!engine) return;
  applyViewerOverrides();
  engine.ccall("WebTF_TrackRelative", null, ["number"], [direction]);
  canvas.focus({ preventScroll: true });
}

function resetToggles() {
  paused = false;
  pauseButton.textContent = "ПАУЗА";
  pauseButton.setAttribute("aria-pressed", "false");
  execute("cl_demospeed 1");
}

function play(path) {
  if (!engine) return;
  resetToggles();
  execute(`playdemo "${path}"`);
  window.clearInterval(initialTrackTimer);
  let attempts = 0;
  initialTrackTimer = window.setInterval(() => {
    attempts += 1;
    engine.ccall("WebTF_CloseMenus", null, [], []);
    applyViewerOverrides();
    if (engine.ccall("WebTF_DemoPlayback", "number", [], [])
      && engine.ccall("WebTF_TrackNum", "number", [], []) < 0) {
      engine.ccall("WebTF_TrackRelative", null, ["number"], [1]);
    }
    if (engine.ccall("WebTF_TrackNum", "number", [], []) >= 0 || attempts >= 40) {
      window.clearInterval(initialTrackTimer);
    }
  }, 500);
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
    const { default: createWebTF } = await import("./build/ezquake.js?v=127");
    engine = await createWebTF({
      canvas,
      arguments: [
        "-basedir", "/webtf", "-nohome", "-noatlas", "-nomtex", "-window", "-width", "1280", "-height", "720",
        "-game", "fortress", "+vid_fullscreen", "0",
        "+vid_win_width", "1280", "+vid_win_height", "720",
        "+vid_conscale", "1",
        "+gl_program_aliasmodels", "0", "+gl_vbo_clientmemory", "1",
      ],
      locateFile(path) {
        const url = new URL(`./build/${path}`, import.meta.url);
        url.searchParams.set("v", "127");
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
  trackRelative(-1);
});

cameraNextButton.addEventListener("click", () => {
  trackRelative(1);
});

pauseButton.addEventListener("click", () => {
  paused = !paused;
  execute(`cl_demospeed ${paused ? 0 : 1}`);
  pauseButton.textContent = paused ? "ПРОДОЛЖИТЬ" : "ПАУЗА";
  pauseButton.setAttribute("aria-pressed", String(paused));
  updatePlaybackStatus();
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
