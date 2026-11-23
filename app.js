'use strict';

const intro = document.getElementById('intro');
const stage = document.getElementById('cameraStage');
const video = document.getElementById('camera');
const canvas = document.getElementById('effectsCanvas');
const start = document.getElementById('startButton');
const stop = document.getElementById('stopButton');
const retry = document.getElementById('retryButton');
const soundButton = document.getElementById('soundButton');
const statusLabel = document.getElementById('status');
const detailLabel = document.getElementById('detail');
let session;
let setEffects;
let engine;

function show(title, detail, action = '') {
  statusLabel.textContent = title;
  detailLabel.textContent = detail;
  retry.textContent = action;
  retry.hidden = !action;
}

// Resume in the same click as getUserMedia. Decode the chime asynchronously.
function soundLabel(current, label) {
  if (session !== current) return;
  soundButton.textContent = label;
  soundButton.setAttribute('aria-pressed', String(!!current.audio?.enabled));
}

function stopChime(current) {
  const audio = current.audio;
  if (!audio?.source) return;
  const source = audio.source;
  audio.source = null;
  source.stop();
  source.disconnect();
}

function playChime(current) {
  const audio = current.audio;
  if (!audio?.enabled || !audio.buffer || audio.context.state !== 'running' ||
      !current.tracking?.found || current.tracking.sounded || document.hidden) return;
  const source = audio.context.createBufferSource();
  source.buffer = audio.buffer;
  source.connect(audio.context.destination);
  audio.source = source;
  current.tracking.sounded = true;
  source.onended = () => {
    if (audio.source === source) {
      audio.source = null;
      source.disconnect();
    }
  };
  source.start();
}

function enableSound(current) {
  let audio = current.audio;
  try {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) {
      soundLabel(current, 'Звук недоступен');
      return;
    }
    if (!audio) {
      audio = current.audio = {context: new AudioEngine(), cancel: new AbortController()};
    }
    audio.enabled = true;
    const unlocked = audio.context.resume();
    if (!audio.loading) {
      audio.loading = fetch('./assets/chime.wav', {signal: audio.cancel.signal})
        .then(response => {
          if (!response.ok) throw Error('HTTP ' + response.status);
          return response.arrayBuffer();
        }).then(bytes => audio.context.decodeAudioData(bytes))
        .then(buffer => { audio.buffer = buffer; })
        .catch(error => { audio.loading = null; throw error; });
    }
    soundLabel(current, 'Выключить звук');
    Promise.all([unlocked, audio.loading]).then(() => {
      if (session === current) playChime(current);
    }).catch(() => {
      audio.enabled = false;
      soundLabel(current, 'Включить звук');
    });
  } catch {
    if (audio) audio.enabled = false;
    soundLabel(current, 'Включить звук');
  }
}

function stopTracking(current) {
  const attempt = current.tracking;
  if (!attempt) return;
  stopChime(current);
  current.tracking = null;
  attempt.cancel.abort();
  clearInterval(attempt.watchdog);
  if (attempt.controller) {
    attempt.controller.dispose();
    attempt.controller.worker.terminate();
  }
  setEffects?.(false);
}

function releaseCamera() {
  if (!session) return;
  const current = session;
  session = null;
  soundButton.hidden = true;
  stopTracking(current);
  if (current.audio) {
    current.audio.cancel.abort();
    current.audio.context.close().catch(() => {});
  }
  current.stream?.getTracks().forEach(track => track.stop());
  video.pause();
  video.srcObject = null;
}

function closeCamera() {
  releaseCamera();
  stage.hidden = true;
  intro.hidden = false;
  start.focus({preventScroll: true});
}

function cameraError(error) {
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Разрешите камеру для этого сайта в настройках браузера. Если ссылка открыта внутри другого приложения, откройте её в Safari или Chrome.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Браузер не нашёл доступную камеру. Проверьте, что камера включена в настройках устройства.';
    case 'NotReadableError':
    case 'AbortError':
      return 'Не удалось получить изображение с камеры. Закройте приложения, использующие камеру, и повторите попытку.';
    default:
      return error.message || 'Не удалось открыть камеру. Повторите попытку.';
  }
}

function timed(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}

async function loadEngine() {
  const path = 'mind-ar@1.2.5/dist/mindar-image.prod.js';
  for (const host of ['https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/']) {
    try {
      return await timed(import(host + path), 25000, 'Превышено время загрузки MindAR.');
    } catch (error) {
      console.warn('MindAR', host, error);
    }
  }
  throw new Error('Не удалось загрузить модуль распознавания. Проверьте подключение к интернету.');
}

async function loadTarget(Compiler, signal) {
  const source = new URL('./assets/winter-portrait.mind', location.href);
  const sources = [{url: source.href}];
  const project = /^\/NyxAlloy\/NovgorodAR\/([^/]+)\/assets\/winter-portrait\.mind$/i.exec(source.pathname);
  if (project && ['raw.githack.com', 'rawcdn.githack.com'].includes(source.hostname)) {
    sources.unshift(
      {url: 'https://raw.githubusercontent.com' + source.pathname + source.search},
      {url: 'https://api.github.com/repos/NyxAlloy/NovgorodAR/contents/assets/winter-portrait.mind?ref=' + project[1], headers: {Accept: 'application/vnd.github.raw+json'}}
    );
  }
  for (const {url, headers} of sources) {
    if (signal.aborted) throw new DOMException('Отменено', 'AbortError');
    const request = new AbortController();
    const cancel = () => request.abort();
    signal.addEventListener('abort', cancel, {once: true});
    const timer = setTimeout(cancel, 15000);
    try {
      const response = await fetch(url, {signal: request.signal, headers});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      const data = new Compiler().importData(bytes);
      if (data[0]?.matchingData?.length && data[0]?.trackingData?.length) return bytes;
    } catch (error) {
      console.warn('Данные обложки', error);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }
  throw new Error('Не удалось загрузить данные обложки. Проверьте интернет и повторите распознавание.');
}

// MindAR measures marker coordinates from the bottom left. The canvas starts
// at the top left. Apply the same centred crop as the camera's object-fit:cover.
function placeOverlay(tracking, worldMatrix) {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const fit = Math.max(width / video.videoWidth, height / video.videoHeight);
  const viewport = new DOMMatrix().translate(width / 2, height / 2)
    .scale(video.videoWidth * fit / 2, -video.videoHeight * fit / 2, 1);
  const matrix = viewport.multiply(tracking.projection)
    .multiply(new DOMMatrix(worldMatrix)).multiply(tracking.canvasToMarker);
  // Use a planar projective transform. An independent Z axis keeps the CSS
  // matrix invertible so browsers paint the canvas at every valid pose.
  matrix.m13 = matrix.m23 = matrix.m43 = 0;
  matrix.m31 = matrix.m32 = matrix.m34 = 0;
  matrix.m33 = 1;
  canvas.style.transform = matrix.toString();
}

async function startTracking(current) {
  stopTracking(current);
  const attempt = {cancel: new AbortController()};
  current.tracking = attempt;
  const active = () => session === current && current.tracking === attempt;
  const fail = message => {
    if (!active()) return;
    stopTracking(current);
    show('Камера включена', message, 'Повторить распознавание');
  };
  show('Камера включена', 'Загружаем распознавание обложки…');
  try {
    if (!engine) engine = loadEngine().catch(error => { engine = null; throw error; });
    const {Controller, Compiler} = await engine;
    if (!active()) return;
    const bytes = current.target || await loadTarget(Compiler, attempt.cancel.signal);
    if (!active()) return;
    current.target = bytes;
    setEffects ||= createEffects(canvas);
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    const controller = new Controller({
      inputWidth: video.width, inputHeight: video.height, maxTrack: 1,
      warmupTolerance: 3, missTolerance: 2,
      onUpdate(data) {
        if (!active()) return;
        attempt.lastFrame = performance.now();
        if (data.type !== 'updateMatrix' || data.targetIndex !== 0) return;
        const found = Boolean(data.worldMatrix);
        if (found) placeOverlay(attempt, data.worldMatrix);
        setEffects(found);
        if (found === attempt.found) return;
        attempt.found = found;
        attempt.sounded = false;
        if (found) playChime(current);
        else stopChime(current);
        show(found ? 'Обложка обнаружена ✓' : 'Ищем обложку…',
          found ? 'Держите портрет в кадре.' : 'Наведите камеру на портрет Деда Мороза.');
      }
    });
    attempt.controller = controller;
    controller.worker.addEventListener('error', () => fail('Распознавание прервалось. Запустите его ещё раз.'));
    const {dimensions} = controller.addImageTargetsFromBuffer(bytes);
    const [w, h] = dimensions[0];
    attempt.projection = new DOMMatrix(controller.getProjectionMatrix());
    attempt.canvasToMarker = new DOMMatrix().translate(0, h).scale(w / canvas.width, -h / canvas.height, 1);
    await controller.dummyRun(video);
    if (!active()) return;
    attempt.lastFrame = performance.now();
    attempt.watchdog = setInterval(() => {
      if (document.hidden || video.paused || video.srcObject?.getVideoTracks()[0]?.muted) {
        attempt.lastFrame = performance.now();
      } else if (performance.now() - attempt.lastFrame > 30000) {
        fail('Обработка изображения остановилась. Запустите распознавание ещё раз.');
      }
    }, 5000);
    show('Ищем обложку…', 'Наведите камеру на портрет Деда Мороза.');
    controller.processVideo(video);
  } catch (error) {
    console.warn('Распознавание', error);
    fail(/загрузить|интернет/i.test(error.message) ? error.message :
      'Браузер не смог запустить обработку изображения. Повторите попытку или откройте страницу в Safari или Chrome.');
  }
}

async function openCamera() {
  releaseCamera();
  const current = {};
  session = current;
  intro.hidden = true;
  stage.hidden = false;
  show('Включаем камеру…', 'Ожидаем изображение.');
  stop.focus({preventScroll: true});
  soundButton.hidden = false;
  enableSound(current);
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Откройте HTTPS-ссылку в Safari на iPhone или Chrome на Android.');
    }
    // Request directly during the button click, before loading any AR code.
    const request = navigator.mediaDevices.getUserMedia({
      audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 640}, height: {ideal: 480}}
    });
    // The browser owns the permission dialog. Show help only if it is waiting
    // for a decision, and never delay capture to query a permission.
    if (navigator.permissions) {
      navigator.permissions.query({name: 'camera'}).then(permission => {
        if (session === current && !current.stream && permission.state === 'prompt') {
          detailLabel.textContent = 'Если браузер попросит доступ, нажмите «Разрешить».';
        }
      }).catch(() => {});
    }
    const stream = await request;
    if (session !== current) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    current.stream = stream;
    const track = stream.getVideoTracks()[0];
    const ended = () => {
      if (session !== current) return;
      releaseCamera();
      show('Камера остановлена', 'Видеопоток прервался. Включите камеру снова.', 'Включить камеру');
    };
    track.addEventListener('ended', ended, {once: true});
    if (track.readyState === 'ended') { ended(); return; }
    video.muted = true;
    video.srcObject = stream;
    show('Включаем камеру…', 'Ждём первый кадр.');
    await timed(video.play(), 20000, 'Камера не показала первый кадр. Повторите попытку.');
    if (session === current) await startTracking(current);
  } catch (error) {
    if (session !== current) return;
    releaseCamera();
    show('Камера недоступна', cameraError(error), 'Повторить запрос камеры');
  }
}

if (stage) {
  start.addEventListener('click', openCamera);
  stop.addEventListener('click', closeCamera);
  soundButton.addEventListener('click', () => {
    const current = session;
    if (!current) return;
    if (current.audio?.enabled && current.audio.context.state === 'running') {
      current.audio.enabled = false;
      stopChime(current);
      soundLabel(current, 'Включить звук');
    } else {
      if (current.tracking) current.tracking.sounded = false;
      enableSound(current);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (session && document.hidden) stopChime(session);
  });
  retry.addEventListener('click', () => {
    if (session?.stream) startTracking(session);
    else openCamera();
  });
  video.addEventListener('resize', () => {
    const controller = session?.tracking?.controller;
    if (controller && video.videoWidth && video.videoHeight &&
        (video.videoWidth !== controller.inputWidth || video.videoHeight !== controller.inputHeight)) startTracking(session);
  });
  window.addEventListener('pagehide', closeCamera);
} else if (start) {
  // A cached copy of the former landing page can still load this script.
  start.addEventListener('click', () => location.assign('./ar.html'));
}
