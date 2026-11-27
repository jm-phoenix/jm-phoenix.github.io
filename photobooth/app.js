'use strict';
/* PhotoBooth · Sara Sofía XV
   Cabina desatendida: PWA offline, cámara frontal, montaje 4x6.
   Guardado e impresión vía Apple Shortcuts (el montaje viaja por el
   portapapeles: el Shortcut lo guarda en Fotos y/o lo imprime).
   Regla de oro: NINGÚN camino descarta la foto — los tres botones guardan. */

const $ = (s) => document.querySelector(s);

const DEFAULTS = {
  event: { name: 'Sara Sofía', subtitle: 'Mis Quince Años', date: 'Abril 2027', monogram: 'XV' },
  palette: { deep: '#465A43', sage: '#808867', blush: '#DACDAC', gold: '#A08E6A', ink: '#2E332E', paper: '#FBF7F1', rose: '#D1968C', peach: '#EFD9C9' },
  audio: {
    ambient: 'assets/audio/01-ambiente.mp3', ambientIntervalSeconds: 30,
    intro: 'assets/audio/02-intro.mp3', countdown: 'assets/audio/03-countdown.mp3',
    transition: 'assets/audio/04-transicion.mp3', final: 'assets/audio/05-final.mp3',
    gain: { ambient: 1.46, countdown: 1.6, final: 1.84, intro: 1, transition: 1.58 }
  },
  camera: { facingMode: 'user', width: 1920, height: 1080 },
  print: { width: 1800, height: 1200, margin: 40, slotWidth: 640, slotHeight: 1080, slotY: 60, renderWidth: 4096, flowers: true },
  shortcuts: { savePrint: 'Imprimir PB', saveOnly: 'Compartir PB' },
  template: { logo: null },
  timing: { countdownSeconds: 5.6, poseSeconds: 4, transitionSeconds: 3, autoResetSeconds: 90, returnDelaySeconds: 5 },
  texts: {
    attractTitle: 'Sara Sofía', attractSubtitle: 'Mis Quince Años · Abril 2027',
    attractButton: '📸 Toma tus fotos', attractHint: 'Toca el botón y sonríe',
    capturing: 'Mírense en la pantalla…', secondReady: 'Prepárate para la segunda',
    resultTitle: '¡Quedó brutal!',
    resultHint: 'Toca Continuar y elige Imprimir PB o Compartir PB',
    btnContinue: 'Continuar'
  }
};

let CFG = DEFAULTS;
let stream = null;
let photo1 = null; // canvas 640x1080
let photo2 = null;
let compositeBlob = null;
let pendingReturn = false; // esperando el regreso tras abrir un Shortcut (plan B)
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

/* ---------- audio: WebAudio, la vía fiable en iOS ----------
   El <audio> de HTML en iOS solo suena dentro de la ventana corta tras
   el toque (por eso el intro sonaba y los demás no: llegan 5-20 s
   después, fuera de esa ventana). En cambio, un AudioContext retomado
   dentro del gesto queda corriendo y sus sonidos suenan cuando sea.
   Los mp3 se decodifican al cargar; si algo falla, cae al <audio>. */
let audioCtx = null;
const audioBuffers = {}; // key -> AudioBuffer decodificado
const audioCache = {};   // fallback: un <audio> por url
const activeSources = new Set(); // fuentes sonando: guardadas para que iOS no las descarte

function getAudioContext() {
  if (audioCtx) return audioCtx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

function getAudio(url) {
  if (audioCache[url]) return audioCache[url];
  const a = new Audio();
  a.preload = 'auto';
  a.src = url;
  a.volume = 1;
  audioCache[url] = a;
  return a;
}

function preloadAudio() {
  const ctx = getAudioContext();
  for (const key of Object.keys(CFG.audio || {})) {
    const v = CFG.audio[key];
    if (typeof v !== 'string') continue;
    const a = getAudio(v);
    if (a) a.load(); // fallback <audio>, precargado
    if (ctx) {
      fetch(v).then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((buf) => { audioBuffers[key] = buf; })
        .catch(() => {});
    }
  }
}

/* Suena un audio y resuelve cuando termina (nunca rechaza). La ganancia
   por audio está en CFG.audio.gain: los archivos no salieron todos al
   mismo nivel y así quedan parejos sin recortar. */
function playAudio(key) {
  const url = (CFG.audio && CFG.audio[key]) || key;
  const gain = (CFG.audio && CFG.audio.gain && CFG.audio.gain[key]) || 1;
  const buf = audioBuffers[key];
  if (buf && audioCtx) {
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const g = audioCtx.createGain();
      g.gain.value = gain;
      src.connect(g);
      g.connect(audioCtx.destination);
      src.start(0);
      activeSources.add(src);
      return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (done) return; done = true; activeSources.delete(src); resolve(); };
        src.onended = finish;
        setTimeout(finish, buf.duration * 1000 + 2000); // seguridad: nunca bloquear el flujo
      });
    } catch (e) { /* cae al fallback */ }
  }
  return new Promise((resolve) => {
    try {
      const a = getAudio(url);
      if (!a) { resolve(); return; }
      a.volume = Math.min(1, gain);
      try { a.currentTime = 0; } catch (e) { /* aún no cargado */ }
      const done = () => { a.removeEventListener('ended', done); resolve(); };
      a.addEventListener('ended', done);
      const p = a.play();
      if (p) p.catch(() => resolve());
      setTimeout(done, 12000); // seguridad
    } catch (e) { resolve(); }
  });
}

function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const ctx = getAudioContext();
  if (ctx) {
    try {
      // Blip silencioso dentro del gesto: retoma el contexto y desbloquea el audio.
      if (ctx.state === 'suspended') ctx.resume();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) { /* el <audio> igual intenta sonar */ }
  }
  startAmbientLoop(); // el primer toque desbloquea el audio en Safari
}

function startAmbientLoop() {
  if (ambientTimer) return;
  const play = () => { if (state === 'attract') playAudio('ambient'); };
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
  try { await v.play(); } catch (e) { /* reintento en el siguiente frame */ }
  return stream;
}

function releaseCamera() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  const v = $('#video-main');
  v.srcObject = null;
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

/* La cuenta regresiva va por temporizador (no por el audio): si Safari
   bloquea el audio, los números y la captura siguen en hora. El audio
   es el mismo para la foto 1 y la 2. */
async function runCountdown() {
  const total = (CFG.timing.countdownSeconds || 5.6) * 1000;
  const labels = ['3', '2', '1', '¡Sonríe!'];
  const cd = $('#countdown');
  playAudio('countdown');
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
  await Promise.all([playAudio('intro'), sleep((CFG.timing.poseSeconds || 4) * 1000)]);
  await runCountdown();
  photo1 = captureSlot();
  setStatus(CFG.texts.secondReady);
  await Promise.all([playAudio('transition'), sleep((CFG.timing.transitionSeconds || 3) * 1000)]);
  await runCountdown();
  photo2 = captureSlot();
  showResult();
  playAudio('final');
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

/* Borde de flores alrededor del marco de la composición: guirnalda
   dibujada en canvas (sin imágenes externas, funciona offline), con los
   colores de la paleta — rosa y melocotón para los pétalos, salvia para
   las hojas. Se apaga con print.flowers = false. */
function drawFlowerBorder(x, S) {
  const P = CFG.print, pal = CFG.palette;
  const W = P.width, H = P.height;
  const petalColors = [pal.rose || '#D1968C', pal.peach || '#EFD9C9', pal.gold, pal.paper];
  const r = 34, step = 150;
  let i = 0;
  const flower = (cx, cy, rr) => {
    const pc = petalColors[i % petalColors.length];
    const cc = (i % 2 === 0) ? pal.gold : pal.deep;
    i++;
    // hojas
    x.fillStyle = pal.sage;
    for (const a of [Math.PI * 0.25, Math.PI * 0.75]) {
      x.beginPath();
      x.ellipse(S(cx + Math.cos(a) * rr * 0.9), S(cy + Math.sin(a) * rr * 0.9), S(rr * 0.42), S(rr * 0.2), a, 0, Math.PI * 2);
      x.fill();
    }
    // pétalos (6 por flor)
    x.fillStyle = pc;
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2;
      x.beginPath();
      x.ellipse(S(cx + Math.cos(a) * rr * 0.55), S(cy + Math.sin(a) * rr * 0.55), S(rr * 0.45), S(rr * 0.28), a, 0, Math.PI * 2);
      x.fill();
    }
    // centro
    x.fillStyle = cc;
    x.beginPath();
    x.arc(S(cx), S(cy), S(rr * 0.3), 0, Math.PI * 2);
    x.fill();
  };
  // esquinas (más grandes)
  flower(r * 1.25, r * 1.25, r * 1.25);
  flower(W - r * 1.25, r * 1.25, r * 1.25);
  flower(r * 1.25, H - r * 1.25, r * 1.25);
  flower(W - r * 1.25, H - r * 1.25, r * 1.25);
  // bordes superior e inferior
  for (let cx = step; cx < W - step * 0.5; cx += step) {
    flower(cx, r, r);
    flower(cx, H - r, r);
  }
  // bordes laterales
  for (let cy = step; cy < H - step * 0.5; cy += step) {
    flower(r, cy, r);
    flower(W - r, cy, r);
  }
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
  if (P.flowers !== false) drawFlowerBorder(x, S);
  return c;
}

function showResult() {
  const c = compose();
  $('#btn-continue').disabled = true;
  c.toBlob((blob) => {
    compositeBlob = blob;
    $('#result-img').src = URL.createObjectURL(blob);
    $('#btn-continue').disabled = false;
    $('#btn-continue').textContent = CFG.texts.btnContinue;
  }, 'image/png');
  showScreen('result');
}

/* ---------- Compartir: un solo botón Continuar ---------- */
/* Al tocar Continuar: (1) copia el montaje al portapapeles como respaldo
   (escribir no pide aviso), (2) abre el share sheet con el PNG — ahí el
   invitado elige "Imprimir PB" (guarda e imprime) o "Compartir PB" (solo
   guarda). La foto llega como entrada directa del Shortcut, sin los
   avisos de iOS. Tras compartir, espera 5 s y vuelve sola a la pantalla
   de inicio. Plan B (si Compartir no está disponible): portapapeles +
   shortcuts:// con "Imprimir PB". */
async function shareComposite() {
  clearResetTimer();
  if (!compositeBlob) return;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': compositeBlob })]);
  } catch (e) { /* sin portapapeles: sigue con Compartir */ }
  const file = new File([compositeBlob], 'sara-sofia-xv.png', { type: 'image/png' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      $('#btn-continue').disabled = true;
      $('#btn-continue').textContent = '¡Listo!';
      setTimeout(() => showAttract(), (CFG.timing.returnDelaySeconds || 5) * 1000);
    } catch (err) { /* el invitado cerró el share sheet: se queda en la pantalla de resultado */ }
    return;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': compositeBlob })]);
  } catch (e) {
    window.print();
    return;
  }
  pendingReturn = true;
  window.location.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(CFG.shortcuts.savePrint) + '&input=clipboard';
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && pendingReturn) {
    pendingReturn = false;
    showAttract();
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
  $('#result-hint').textContent = t.resultHint;
  $('#btn-continue').textContent = t.btnContinue;
}

document.addEventListener('pointerdown', unlockAudio);
$('#btn-start').addEventListener('click', () => { unlockAudio(); startSession(); });
$('#btn-continue').addEventListener('click', () => shareComposite());

window.addEventListener('load', async () => {
  try {
    const res = await fetch('config.json');
    CFG = Object.assign({}, DEFAULTS, await res.json());
  } catch (e) { CFG = DEFAULTS; }
  computeRender();
  preloadAudio();
  applyTexts();
  showAttract();
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { /* sin PWA offline, la página igual funciona */ }
  }
});
