import WaveSurfer from "wavesurfer.js";

const PLAYER_CONFIG = {
  height: 32,
  barWidth: 2,
  barGap: 1,
  barRadius: 2,
  cursorWidth: 0,
  normalize: true,
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Build a wavesurfer player inside a data-audio-id container.
 * Returns the WaveSurfer instance for lifecycle management.
 */
export function createAudioPlayer(
  container: HTMLDivElement,
  blobUrl: string,
): WaveSurfer {
  container.setAttribute("contenteditable", "false");

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.setAttribute("data-audio-play", "");
  playBtn.setAttribute("contenteditable", "false");
  playBtn.textContent = "\u25B6";

  const waveformDiv = document.createElement("div");
  waveformDiv.setAttribute("data-audio-waveform", "");

  const durationSpan = document.createElement("span");
  durationSpan.setAttribute("data-audio-duration", "");
  durationSpan.textContent = "0:00";

  const controls = document.createElement("div");
  controls.setAttribute("data-audio-controls", "");
  controls.appendChild(playBtn);
  controls.appendChild(waveformDiv);
  controls.appendChild(durationSpan);
  container.appendChild(controls);

  const style = getComputedStyle(document.documentElement);
  const waveColor = style.getPropertyValue("--color-text-muted").trim() || "#94a3b8";
  const progressColor = style.getPropertyValue("--color-link").trim() || "#3b82f6";

  const ws = WaveSurfer.create({
    ...PLAYER_CONFIG,
    container: waveformDiv,
    url: blobUrl,
    waveColor,
    progressColor,
    interact: true,
  });

  ws.on("ready", () => {
    durationSpan.textContent = formatDuration(ws.getDuration());
  });

  ws.on("timeupdate", (time) => {
    durationSpan.textContent = formatDuration(time);
  });

  ws.on("play", () => {
    playBtn.textContent = "\u275A\u275A";
  });

  ws.on("pause", () => {
    playBtn.textContent = "\u25B6";
  });

  ws.on("finish", () => {
    playBtn.textContent = "\u25B6";
    durationSpan.textContent = formatDuration(ws.getDuration());
  });

  playBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    ws.playPause();
  });

  ws.on("interaction", () => {
    ws.play();
  });

  return ws;
}
