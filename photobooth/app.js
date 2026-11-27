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
  camera: { facingMode: 'user', width: 1920, height: 1080 },
  print: { width: 1800, height: 1200, margin: 40, slotWidth: 640, slotHeight: 1080, slotY: 60, renderWidth: 4096 },
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
  const v = $('#video-main');
  v.srcObject = stream;
  v.onloadedmetadata = updateCaptureZone;
  try { await v.play(); } catch (e) { /* reintento en el siguiente frame */ }
  updateCaptureZone();
  return stream;
}

function releaseCamera() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  const v = $('#video-main');
  v.srcObject = null;
  $('#capture-zone').hidden = true;
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
  const v = $('#video-main');
  const w = Math.round(CFG.print.slotWidth * RENDER.scale);
  const h = Math.round(CFG.print.slotHeight * RENDER.scale);
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

/* Posiciona el marco dorado sobre el recorte central que captura la foto.
   Se calcula con las dimensiones reales de la cámara, así que se adapta
   a cualquier aspecto de video (16:9, 4:3...). */
function updateCaptureZone() {
  const v = $('#video-main');
  const zone = $('#capture-zone');
  if (!v.videoWidth) { zone.hidden = true; return; }
  const vw = v.videoWidth, vh = v.videoHeight;
  const stage = document.querySelector('.stage');
  const sw = stage.clientWidth, sh = stage.clientHeight;
  const s = Math.max(sw / vw, sh / vh); // cover: lo que se ve del video
  const visW = sw / s, visH = sh / s;
  const visX0 = (vw - visW) / 2, visY0 = (vh - visH) / 2;
  const sc = Math.max(CFG.print.slotWidth / vw, CFG.print.slotHeight / vh);
  const cw = CFG.print.slotWidth / sc, ch = CFG.print.slotHeight / sc;
  const cx0 = (vw - cw) / 2, cy0 = (vh - ch) / 2;
  const left = Math.max(0, (cx0 - visX0) / visW * 100);
  const top = Math.max(0, (cy0 - visY0) / visH * 100);
  const width = Math.min(100 - left, cw / visW * 100);
  const height = Math.min(100 - top, ch / visH * 100);
  zone.style.left = left + '%';
  zone.style.top = top + '%';
  zone.style.width = width + '%';
  zone.style.height = height + '%';
  zone.hidden = false;
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
  const step = Math.max(2, basePx * 0.04);
  while (px > 20 && ctx.measureText(text).width > maxWidth) {
    px -= step;
    ctx.font = 'italic 600 ' + px + 'px ' + family;
  }
  return px;
}

/* Resolución de render: la composición sale a 4096×2730 (el techo del
   canvas en iOS: ~16.7 MP y 4096 px de lado). A 300 DPI eso es 13.6"×9.1",
   suficiente para imprimir más grande que 4x6. Si el iPad no lo aguanta,
   se baja solo a 1800×1200. */
let RENDER = { width: 1800, height: 1200, scale: 1 };

function canvasSizeSupported(w, h) {
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (!x) return false;
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 1, 1);
    return x.getImageData(0, 0, 1, 1).data[0] === 255;
  } catch (e) { return false; }
}

function computeRender() {
  const targetW = CFG.print.renderWidth || 4096;
  const targetH = Math.round(targetW * CFG.print.height / CFG.print.width);
  const ok = canvasSizeSupported(targetW, targetH);
  const W = ok ? targetW : CFG.print.width;
  const H = Math.round(W * CFG.print.height / CFG.print.width);
  RENDER = { width: W, height: H, scale: W / CFG.print.width };
}

function compose() {
  const P = CFG.print, pal = CFG.palette;
  const W = RENDER.width, H = RENDER.height, s = RENDER.scale;
  const S = (v) => v * s;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const serif = 'Georgia, "Times New Roman", serif';

  x.fillStyle = pal.blush;
  x.fillRect(0, 0, W, H);

  const y = S(P.slotY), sw = S(P.slotWidth), sh = S(P.slotHeight), m = S(P.margin);
  x.drawImage(photo1, m, y, sw, sh);
  x.drawImage(photo2, W - m - sw, y, sw, sh);
  x.strokeStyle = pal.gold;
  x.lineWidth = S(4);
  x.strokeRect(m, y, sw, sh);
  x.strokeRect(W - m - sw, y, sw, sh);

  const bx = m + sw;
  const bw = W - 2 * m - 2 * sw;
  x.fillStyle = pal.deep;
  x.fillRect(bx, y, bw, sh);
  x.strokeStyle = pal.gold;
  x.lineWidth = S(3);
  x.strokeRect(bx + S(8), y + S(8), bw - S(16), sh - S(16));

  const cx = bx + bw / 2;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = pal.gold;
  fitFont(x, CFG.event.monogram, bw - S(60), S(92), serif);
  x.fillText(CFG.event.monogram, cx, y + S(210));
  x.fillStyle = pal.paper;
  fitFont(x, CFG.event.name, bw - S(40), S(64), serif);
  x.fillText(CFG.event.name, cx, y + S(390));
  x.font = S(40) + 'px ' + serif;
  x.fillText(CFG.event.subtitle, cx, y + S(490));
  x.fillStyle = pal.gold;
  x.font = S(36) + 'px ' + serif;
  x.fillText(CFG.event.date, cx, y + S(570));
  x.fillRect(cx - S(90), y + S(650), S(180), S(3));
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
}

document.addEventListener('pointerdown', unlockAudio);
window.addEventListener('resize', () => { if (state === 'camera') updateCaptureZone(); });
$('#btn-start').addEventListener('click', () => { unlockAudio(); startSession(); });
$('#btn-save-print').addEventListener('click', () => openShortcut(CFG.shortcuts.savePrint, 'done'));
$('#btn-save-only').addEventListener('click', () => openShortcut(CFG.shortcuts.saveOnly, 'done'));
$('#btn-retake').addEventListener('click', () => openShortcut(CFG.shortcuts.saveOnly, 'retake'));

window.addEventListener('load', async () => {
  try {
    const res = await fetch('config.json');
    CFG = Object.assign({}, DEFAULTS, await res.json());
  } catch (e) { CFG = DEFAULTS; }
  computeRender();
  applyTexts();
  showAttract();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* sin PWA offline, la página igual funciona */ }
  }
});
