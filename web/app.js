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
const muteButton = document.querySelector("#mute");
const volumeInput = document.querySelector("#volume");
const seekBackButton = document.querySelector("#seek-back");
const seekForwardButton = document.querySelector("#seek-forward");
const playbackRateInput = document.querySelector("#playback-rate");
const currentTimeNode = document.querySelector("#current-time");
const durationNode = document.querySelector("#duration");
const timeline = document.querySelector("#timeline");
const fullscreenButton = document.querySelector("#fullscreen");
const demoInput = document.querySelector("#demo-file");
const controls = document.querySelector(".controls");
const utilityControls = document.querySelector(".utility-controls");
const player = document.querySelector("#player");
const viewport = document.querySelector(".viewport");

let engine;
let started = false;
let paused = false;
let muted = false;
let previousVolume = 0.7;
let timelineDragging = false;
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
  for (const control of [
    cameraPrevButton,
    cameraNextButton,
    pauseButton,
    seekBackButton,
    seekForwardButton,
    playbackRateInput,
    timeline,
  ]) {
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
    "cl_sbar 0",
    "viewsize 100",
  ]) execute(command);
}

function normalizeCanvasBackingSize() {
  if (canvas.width !== 1280) canvas.width = 1280;
  if (canvas.height !== 720) canvas.height = 720;
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await player.requestFullscreen({ navigationUI: "hide" });
    }
  } catch (error) {
    log(`Fullscreen: ${error?.message || error}`);
  }
}

function trackRelative(direction) {
  if (!engine) return;
  applyViewerOverrides();
  engine.ccall("WebTF_TrackRelative", null, ["number"], [direction]);
  canvas.focus({ preventScroll: true });
}

function resetToggles() {
  paused = false;
  pauseButton.setAttribute("aria-pressed", "false");
  pauseButton.setAttribute("aria-label", "Пауза");
  pauseButton.title = "Пауза";
  playbackRateInput.value = "1";
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

function updateTimeNode(node, seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  node.textContent = formatTime(value);
  node.dateTime = `PT${Math.floor(value)}S`;
}

function seekTo(seconds) {
  if (!engine) return;
  const duration = Number(timeline.max) || 0;
  const target = Math.max(0, Math.min(duration, Number(seconds) || 0));
  engine.ccall("WebTF_DemoSeek", null, ["number"], [target]);
  timeline.value = String(target);
  updateTimeNode(currentTimeNode, target);
}

function seekBy(seconds) {
  const time = engine?.ccall("WebTF_DemoTime", "number", [], []) || 0;
  seekTo(time + seconds);
}

function setMutedState(value) {
  muted = value;
  muteButton.classList.toggle("is-muted", muted);
  muteButton.setAttribute("aria-label", muted ? "Включить звук" : "Выключить звук");
  muteButton.title = muted ? "Включить звук" : "Выключить звук";
}

function applyVolume(value) {
  const volume = Math.max(0, Math.min(1, Number(value) || 0));
  execute(`volume ${volume.toFixed(2)}`);
  setMutedState(volume === 0);
}

function updatePlaybackStatus() {
  if (!engine) return;
  const active = engine.ccall("WebTF_DemoPlayback", "number", [], []);
  const time = engine.ccall("WebTF_DemoTime", "number", [], []);
  const length = engine.ccall("WebTF_DemoLength", "number", [], []);
  const track = engine.ccall("WebTF_TrackNum", "number", [], []);
  const namePointer = engine.ccall("WebTF_TrackedName", "number", [], []);
  const name = namePointer ? engine.UTF8ToString(namePointer) : "";

  if (active) {
    execute("cl_sbar 0");
    execute("viewsize 100");
  }

  statusNode.dataset.demo = String(active);
  statusNode.dataset.track = String(track);
  trackedPlayerNode.textContent = name || "СВОБОДНАЯ КАМЕРА";
  timeline.max = String(Math.max(1, length));
  if (!timelineDragging) timeline.value = String(Math.min(Math.max(0, time), Math.max(1, length)));
  updateTimeNode(currentTimeNode, time);
  updateTimeNode(durationNode, length);
  setStatus(active ? `MVD • ${formatTime(time)} / ${formatTime(length)}${paused ? " • ПАУЗА" : ""}` : "ДЕМКА НЕ ЗАПУЩЕНА", active ? "playing" : (started ? "error" : "ready"));
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
    const { default: createWebTF } = await import("./build/ezquake.js?v=130");
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
        url.searchParams.set("v", "130");
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
    muteButton.disabled = false;
    volumeInput.disabled = false;
    const initialVolume = engine.ccall("WebTF_Volume", "number", [], []);
    previousVolume = Math.max(0.01, Math.min(1, Number(initialVolume) || 0.7));
    volumeInput.value = String(Math.max(0, Math.min(1, Number(initialVolume) || 0)));
    setMutedState(initialVolume <= 0);
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
  execute(`cl_demospeed ${paused ? 0 : Number(playbackRateInput.value) || 1}`);
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.setAttribute("aria-label", paused ? "Продолжить" : "Пауза");
  pauseButton.title = paused ? "Продолжить" : "Пауза";
  updatePlaybackStatus();
});

seekBackButton.addEventListener("click", () => seekBy(-5));
seekForwardButton.addEventListener("click", () => seekBy(5));

playbackRateInput.addEventListener("change", () => {
  paused = false;
  pauseButton.setAttribute("aria-pressed", "false");
  pauseButton.setAttribute("aria-label", "Пауза");
  pauseButton.title = "Пауза";
  execute(`cl_demospeed ${Number(playbackRateInput.value) || 1}`);
});

timeline.addEventListener("pointerdown", () => {
  timelineDragging = true;
});

timeline.addEventListener("input", () => {
  updateTimeNode(currentTimeNode, timeline.value);
});

timeline.addEventListener("change", () => {
  seekTo(timeline.value);
  timelineDragging = false;
});

muteButton.addEventListener("click", () => {
  if (muted) {
    volumeInput.value = String(previousVolume);
    applyVolume(previousVolume);
  } else {
    previousVolume = Math.max(0.01, Number(volumeInput.value) || 0.7);
    applyVolume(0);
  }
});

volumeInput.addEventListener("input", () => {
  const value = Number(volumeInput.value);
  if (value > 0) previousVolume = value;
  applyVolume(value);
});

fullscreenButton.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", active ? "Выйти из полноэкранного режима" : "Полный экран");
  fullscreenButton.title = active ? "Выйти из полноэкранного режима" : "Полный экран";
  normalizeCanvasBackingSize();
  window.setTimeout(normalizeCanvasBackingSize, 0);
});

// SDL listens for mouse input on the document. Keep player UI clicks from also
// becoming fire/camera commands inside ezquake-tf.
for (const container of [controls, utilityControls]) {
  for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "wheel"]) {
    container.addEventListener(eventName, (event) => event.stopPropagation());
  }
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
