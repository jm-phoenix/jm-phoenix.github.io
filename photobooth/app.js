'use strict';
/* PhotoBooth · Sara Sofía XV
   Cabina desatendida: PWA offline, cámara frontal, montaje 4x6.
   Guardado e impresión vía Apple Shortcuts (el montaje viaja por el
   portapapeles: el Shortcut lo guarda en Fotos y/o lo imprime).
   Regla de oro: NINGÚN camino descarta la foto — los tres botones guardan. */

const $ = (s) => document.querySelector(s);

const DEFAULTS = {
  event: { name: 'Sara Sofía', subtitle: 'Mis Quince Años', date: 'Abril 2027', monogram: 'XV' },
  palette: { deep: '#465A43', sage: '#808867', blush: '#DACDAC', gold: '#A08E6A', ink: '#2E332E', paper: '#FBF7F1' },
  audio: {
    ambient: 'assets/audio/01-ambiente.mp3', ambientIntervalSeconds: 30,
    intro: 'assets/audio/02-intro.mp3', countdown: 'assets/audio/03-countdown.mp3',
    transition: 'assets/audio/04-transicion.mp3', final: 'assets/audio/05-final.mp3'
  },
  camera: { facingMode: 'user', width: 1280, height: 720 },
  print: { width: 1800, height: 1200, margin: 40, slotWidth: 640, slotHeight: 1080, slotY: 60 },
  shortcuts: { savePrint: 'PhotoBooth', saveOnly: 'PhotoBooth Guardar' },
  template: { logo: null },
  timing: { countdownSeconds: 5.6, poseSeconds: 4, transitionSeconds: 3, autoResetSeconds: 90 },
  texts: {
    attractTitle: 'Sara Sofía', attractSubtitle: 'Mis Quince Años · Abril 2027',
    attractButton: '📸 Toma tus fotos', attractHint: 'Toca el botón y sonríe',
    capturing: 'Mírense en la pantalla…', secondReady: 'Prepárate para la segunda',
    resultTitle: '¡Quedó brutal!',
    btnSavePrint: 'Guardar e Imprimir', btnSaveOnly: 'Solo guardar', btnRetake: 'Volver a empezar'
  }
};

let CFG = DEFAULTS;
let stream = null;
let photo1 = null; // canvas 640x1080
let photo2 = null;
let compositeBlob = null;
let pendingReturn = null; // 'done' | 'retake'
let state = 'attract';
let ambientTimer = null;
let audioUnlocked = false;
let wakeLock = null;
let resetTimer = null;

const screens = {
  attract: $('#screen-attract'),
  camera: $('#screen-camera'),
  result: $('#screen-result')
};

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.classList.toggle('active', key === name);
  state = name;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function setStatus(t) { $('#camera-status').textContent = t; }

/* ---------- audio: best effort, nunca bloquea el flujo ---------- */
function playAudio(url) {
  try {
    const a = new Audio(url);
    a.preload = 'auto';
    const p = a.play();
    if (p) p.catch(() => {});
    return a;
  } catch (e) { return null; }
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  startAmbientLoop(); // el primer toque desbloquea el audio en Safari
}

function startAmbientLoop() {
  if (ambientTimer) return;
  const play = () => { if (state === 'attract') playAudio(CFG.audio.ambient); };
  play();
  ambientTimer = setInterval(play, (CFG.audio.ambientIntervalSeconds || 30) * 1000);
}
function stopAmbientLoop() {
  if (ambientTimer) { clearInterval(ambientTimer); ambientTimer = null; }
}

/* ---------- cámara ---------- */
async function ensureCamera() {
  if (stream) return stream;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: CFG.camera.facingMode || 'user',
      width: { ideal: CFG.camera.width || 1280 },
      height: { ideal: CFG.camera.height || 720 }
    }
  });
  for (const v of [$('#video-left'), $('#video-right')]) {
    v.srcObject = stream;
    try { await v.play(); } catch (e) { /* reintento en el siguiente frame */ }
  }
  return stream;
}

function releaseCamera() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  for (const v of [$('#video-left'), $('#video-right')]) v.srcObject = null;
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { wakeLock = null; }
}
function releaseWakeLock() {
  try { if (wakeLock) wakeLock.release(); } catch (e) {}
  wakeLock = null;
}

/* Captura un cuadro en el aspecto exacto del hueco de la plantilla
   (640x1080), con el mismo recorte "cover" del preview y espejado,
   para que la foto impresa sea lo que el invitado vio. */
function captureSlot() {
  const v = $('#video-left');
  const w = CFG.print.slotWidth, h = CFG.print.slotHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const vw = v.videoWidth, vh = v.videoHeight;
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale, sh = h / scale;
  const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
  return c;
}

/* La cuenta regresiva va por temporizador (no por el audio): si Safari
   bloquea el audio, los números y la captura siguen en hora. El audio
   es el mismo para la foto 1 y la 2. */
async function runCountdown() {
  const total = (CFG.timing.countdownSeconds || 5.6) * 1000;
  const labels = ['3', '2', '1', '¡Sonríe!'];
  const cd = $('#countdown');
  playAudio(CFG.audio.countdown);
  cd.hidden = false;
  const start = performance.now();
  await new Promise((resolve) => {
    function tick(now) {
      const el = now - start;
      const idx = Math.min(labels.length - 1, Math.floor(el / (total / labels.length)));
      cd.textContent = labels[idx];
      if (el >= total) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  cd.hidden = true;
}

/* ---------- flujo de la sesión ---------- */
async function startSession() {
  clearResetTimer();
  stopAmbientLoop();
  showScreen('camera');
  setStatus(CFG.texts.capturing);
  try {
    await ensureCamera();
  } catch (e) {
    setStatus('No pude abrir la cámara. Revisa el permiso y toca de nuevo.');
    await sleep(2500);
    showAttract();
    return;
  }
  requestWakeLock();
  playAudio(CFG.audio.intro);
  await sleep((CFG.timing.poseSeconds || 4) * 1000);
  await runCountdown();
  photo1 = captureSlot();
  setStatus(CFG.texts.secondReady);
  playAudio(CFG.audio.transition);
  await sleep((CFG.timing.transitionSeconds || 3) * 1000);
  await runCountdown();
  photo2 = captureSlot();
  showResult();
  playAudio(CFG.audio.final);
  armResetTimer();
}

/* ---------- montaje 4x6 ---------- */
function fitFont(ctx, text, maxWidth, basePx, family) {
  let px = basePx;
  ctx.font = 'italic 600 ' + px + 'px ' + family;
  while (px > 20 && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = 'italic 600 ' + px + 'px ' + family;
  }
  return px;
}

function compose() {
  const P = CFG.print, pal = CFG.palette;
  const c = document.createElement('canvas');
  c.width = P.width; c.height = P.height;
  const x = c.getContext('2d');
  const serif = 'Georgia, "Times New Roman", serif';

  x.fillStyle = pal.blush;
  x.fillRect(0, 0, P.width, P.height);

  const y = P.slotY;
  x.drawImage(photo1, P.margin, y, P.slotWidth, P.slotHeight);
  x.drawImage(photo2, P.width - P.margin - P.slotWidth, y, P.slotWidth, P.slotHeight);
  x.strokeStyle = pal.gold;
  x.lineWidth = 4;
  x.strokeRect(P.margin, y, P.slotWidth, P.slotHeight);
  x.strokeRect(P.width - P.margin - P.slotWidth, y, P.slotWidth, P.slotHeight);

  const bx = P.margin + P.slotWidth;
  const bw = P.width - 2 * P.margin - 2 * P.slotWidth;
  x.fillStyle = pal.deep;
  x.fillRect(bx, y, bw, P.slotHeight);
  x.strokeStyle = pal.gold;
  x.lineWidth = 3;
  x.strokeRect(bx + 8, y + 8, bw - 16, P.slotHeight - 16);

  const cx = bx + bw / 2;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = pal.gold;
  fitFont(x, CFG.event.monogram, bw - 60, 92, serif);
  x.fillText(CFG.event.monogram, cx, y + 210);
  x.fillStyle = pal.paper;
  fitFont(x, CFG.event.name, bw - 40, 64, serif);
  x.fillText(CFG.event.name, cx, y + 390);
  x.font = '40px ' + serif;
  x.fillText(CFG.event.subtitle, cx, y + 490);
  x.fillStyle = pal.gold;
  x.font = '36px ' + serif;
  x.fillText(CFG.event.date, cx, y + 570);
  x.fillRect(cx - 90, y + 650, 180, 3);
  return c;
}

function showResult() {
  const c = compose();
  const btns = ['#btn-save-print', '#btn-save-only', '#btn-retake'];
  btns.forEach((s) => { $(s).disabled = true; });
  c.toBlob((blob) => {
    compositeBlob = blob;
    $('#result-img').src = URL.createObjectURL(blob);
    btns.forEach((s) => { $(s).disabled = false; });
  }, 'image/png');
  showScreen('result');
}

/* ---------- Shortcuts: el montaje viaja por el portapapeles ---------- */
async function openShortcut(name, pending) {
  clearResetTimer();
  if (!compositeBlob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': compositeBlob })]);
  } catch (e) {
    // Plan B: Compartir → el invitado elige el Shortcut (ya recibe imágenes)
    const file = new File([compositeBlob], 'sara-sofia-xv.png', { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch (err) { /* cancelado */ }
      afterShortcutReturn(pending);
      return;
    }
    window.print();
    return;
  }
  pendingReturn = pending;
  window.location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(name) + '&input=clipboard';
}

function afterShortcutReturn(pending) {
  if (pending === 'retake') startSession();
  else showAttract();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pendingReturn) {
    const p = pendingReturn;
    pendingReturn = null;
    afterShortcutReturn(p);
  }
});

/* ---------- reseteo y arranque ---------- */
function armResetTimer() {
  clearResetTimer();
  resetTimer = setTimeout(() => { showAttract(); }, (CFG.timing.autoResetSeconds || 90) * 1000);
}
function clearResetTimer() {
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
}

function showAttract() {
  releaseCamera();
  releaseWakeLock();
  showScreen('attract');
  startAmbientLoop();
}

function applyTexts() {
  const t = CFG.texts;
  $('#attract-title').textContent = CFG.event.name;
  $('#attract-subtitle').textContent = t.attractSubtitle;
  $('#btn-start').textContent = t.attractButton;
  $('#attract-hint').textContent = t.attractHint;
  $('#result-title').textContent = t.resultTitle;
  $('#btn-save-print').textContent = t.btnSavePrint;
  $('#btn-save-only').textContent = t.btnSaveOnly;
  $('#btn-retake').textContent = t.btnRetake;
  document.querySelector('.band-name').textContent = CFG.event.name;
  document.querySelector('.band-sub').textContent = CFG.event.subtitle;
  document.querySelector('.band-monogram').textContent = CFG.event.monogram;
}

document.addEventListener('pointerdown', unlockAudio);
$('#btn-start').addEventListener('click', () => { unlockAudio(); startSession(); });
$('#btn-save-print').addEventListener('click', () => openShortcut(CFG.shortcuts.savePrint, 'done'));
$('#btn-save-only').addEventListener('click', () => openShortcut(CFG.shortcuts.saveOnly, 'done'));
$('#btn-retake').addEventListener('click', () => openShortcut(CFG.shortcuts.saveOnly, 'retake'));

window.addEventListener('load', async () => {
  try {
    const res = await fetch('config.json');
    CFG = Object.assign({}, DEFAULTS, await res.json());
  } catch (e) { CFG = DEFAULTS; }
  applyTexts();
  showAttract();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* sin PWA offline, la página igual funciona */ }
  }
});
