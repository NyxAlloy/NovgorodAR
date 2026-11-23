'use strict';

const intro = document.getElementById('intro');
const stage = document.getElementById('cameraStage');
const video = document.getElementById('camera');
const plane = document.getElementById('portraitPlane');
const filmURL = './assets/ded-moroz-b0b59858.mp4';
const start = document.getElementById('startButton');
const stop = document.getElementById('stopButton');
const retry = document.getElementById('retryButton');
const soundButton = document.getElementById('soundButton');
const statusLabel = document.getElementById('status');
const detailLabel = document.getElementById('detail');
let session;
let engine;

function show(title, detail, action = '') {
  statusLabel.textContent = title;
  detailLabel.textContent = detail;
  retry.textContent = action;
  retry.hidden = !action;
}

function onCover(current) {
  return session === current && !!current.tracking?.found && !document.hidden;
}

function refreshSound(current) {
  if (session !== current) return;
  const enabled = current.soundEnabled;
  soundButton.textContent = enabled ? 'Выключить звук' : 'Включить звук';
  soundButton.setAttribute('aria-pressed', String(enabled));
  const audible = enabled && onCover(current);
  if (current.audio?.gain) current.audio.gain.gain.value = audible ? 1 : 0;
  else current.clip.muted = !audible;
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
  const tracking = current.tracking;
  if (!onCover(current) || !current.soundEnabled || !audio?.buffer ||
      audio.context.state !== 'running' || tracking.sounded || current.clip.paused) return;
  const source = audio.context.createBufferSource();
  source.buffer = audio.buffer;
  source.connect(audio.chimeGain);
  audio.source = source;
  tracking.sounded = true;
  source.onended = () => {
    if (audio.source === source) {
      audio.source = null;
      source.disconnect();
    }
  };
  source.start();
}

function prepareMedia(current) {
  const clip = current.clip = document.createElement('video');
  clip.width = clip.height = 512;
  clip.playsInline = true;
  clip.setAttribute('webkit-playsinline', '');
  clip.disablePictureInPicture = clip.disableRemotePlayback = true;
  clip.loop = true;
  clip.preload = 'auto';
  clip.crossOrigin = 'anonymous';
  clip.src = filmURL;
  plane.replaceChildren(clip);
  current.soundEnabled = true;
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (AudioEngine) {
    try {
      const context = new AudioEngine();
      const audio = current.audio = {context, cancel: new AbortController()};
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      context.createMediaElementSource(clip).connect(gain);
      audio.gain = gain;
      audio.chimeGain = context.createGain();
      audio.chimeGain.gain.value = 0.45;
      audio.chimeGain.connect(gain);
      context.resume().catch(() => {
        if (session !== current) return;
        current.soundEnabled = false;
        refreshSound(current);
      });
      fetch('./assets/chime.wav', {signal: audio.cancel.signal})
        .then(r => { if (!r.ok) throw Error(r.status); return r.arrayBuffer(); })
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => { audio.buffer = buffer; playChime(current); })
        .catch(() => {}); // The film has its own soundtrack.
    } catch (error) {
      console.warn('Звук обложки', error);
    }
  }
  refreshSound(current);
  clip.addEventListener('playing', () => {
    if (!onCover(current)) return;
    plane.classList.add('playing');
    playChime(current);
  });
  clip.addEventListener('error', () => {
    if (onCover(current)) filmError(current);
  });
  // Start on the user's tap. The closed audio gate keeps preparation silent.
  clip.play().then(() => {
    if (session === current && !onCover(current)) {
      clip.pause();
      clip.currentTime = 0;
    }
  }).catch(() => {}); // A device may defer playback until the target is visible.
}

function hideFilm(current) {
  plane.hidden = true;
  plane.classList.remove('playing');
  if (current.audio?.gain) current.audio.gain.gain.value = 0;
  else current.clip.muted = true;
  stopChime(current);
  current.clip.pause();
  if (current.clip.readyState) current.clip.currentTime = 0;
}

function filmError(current) {
  if (!onCover(current)) return;
  current.tracking.filmFailed = true;
  hideFilm(current);
  show('Обложка обнаружена', 'Не удалось воспроизвести ролик на обложке.', 'Запустить ролик');
}

async function playFilm(current) {
  if (!onCover(current)) return;
  const attempt = current.tracking;
  const run = ++current.playbackRun;
  const active = () => run === current.playbackRun && current.tracking === attempt && onCover(current);
  const clip = current.clip;
  attempt.filmFailed = false;
  plane.hidden = false;
  refreshSound(current);
  try {
    await clip.play();
  } catch (error) {
    if (!active()) return;
    if (error.name !== 'NotAllowedError' || clip.muted) { filmError(current); return; }
    current.soundEnabled = false;
    clip.muted = true;
    refreshSound(current);
    try { await clip.play(); } catch { if (active()) filmError(current); return; }
  }
  if (!active()) return;
  plane.classList.add('playing');
  playChime(current);
}

function loseCover(current) {
  current.playbackRun++;
  if (current.tracking) {
    current.tracking.found = false;
    current.tracking.sounded = false;
    current.tracking.filmFailed = false;
  }
  hideFilm(current);
}

function stopTracking(current) {
  const attempt = current.tracking;
  if (!attempt) return;
  loseCover(current);
  current.tracking = null;
  attempt.cancel.abort();
  clearInterval(attempt.watchdog);
  if (attempt.controller) {
    attempt.controller.dispose();
    attempt.controller.worker.terminate();
  }
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
  current.clip.pause();
  current.clip.removeAttribute('src');
  current.clip.load();
  plane.hidden = true;
  plane.replaceChildren();
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

// MindAR measures marker coordinates from the bottom left. The video plane starts
// at the top left. Apply the same centred crop as the camera's object-fit:cover.
function placeOverlay(tracking, worldMatrix) {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const fit = Math.max(width / video.videoWidth, height / video.videoHeight);
  const viewport = new DOMMatrix().translate(width / 2, height / 2)
    .scale(video.videoWidth * fit / 2, -video.videoHeight * fit / 2, 1);
  const matrix = viewport.multiply(tracking.projection)
    .multiply(new DOMMatrix(worldMatrix)).multiply(tracking.planeToMarker);
  // Use a planar projective transform. An independent Z axis keeps the CSS
  // matrix invertible so browsers paint the video at every valid pose.
  matrix.m13 = matrix.m23 = matrix.m43 = 0;
  matrix.m31 = matrix.m32 = matrix.m34 = 0;
  matrix.m33 = 1;
  plane.style.transform = matrix.toString();
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
    video.width = video.videoWidth;
    video.height = video.videoHeight;
    const controller = new Controller({
      inputWidth: video.width, inputHeight: video.height, maxTrack: 1,
      warmupTolerance: 3, missTolerance: 2,
      onUpdate(data) {
        if (!active()) return;
        attempt.lastFrame = performance.now();
        if (data.type !== 'updateMatrix' || data.targetIndex !== 0) return;
        if (document.hidden || video.srcObject?.getVideoTracks()[0]?.muted) return;
        const found = Boolean(data.worldMatrix);
        if (found) placeOverlay(attempt, data.worldMatrix);
        if (found === attempt.found) return;
        if (found) {
          attempt.found = true;
          playFilm(current);
        } else {
          loseCover(current);
        }
        show(found ? 'Обложка обнаружена ✓' : 'Ищем обложку…',
          found ? 'Держите портрет в кадре.' : 'Наведите камеру на портрет Деда Мороза.');
      }
    });
    attempt.controller = controller;
    controller.worker.addEventListener('error', () => fail('Распознавание прервалось. Запустите его ещё раз.'));
    const {dimensions} = controller.addImageTargetsFromBuffer(bytes);
    const [w, h] = dimensions[0];
    attempt.projection = new DOMMatrix(controller.getProjectionMatrix());
    attempt.planeToMarker = new DOMMatrix().translate(0, h).scale(w / current.clip.width, -h / current.clip.height, 1);
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
  const current = {playbackRun: 0};
  session = current;
  intro.hidden = true;
  stage.hidden = false;
  show('Включаем камеру…', 'Ожидаем изображение.');
  stop.focus({preventScroll: true});
  soundButton.hidden = false;
  try {
    prepareMedia(current);
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
    track.addEventListener('mute', () => {
      if (session === current && current.tracking) {
        loseCover(current);
        show('Ищем обложку…', 'Наведите камеру на портрет Деда Мороза.');
      }
    });
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
    current.soundEnabled = !current.soundEnabled;
    if (current.soundEnabled) {
      current.clip.muted = false;
      current.audio?.context.resume().then(() => playChime(current)).catch(() => {
        if (session === current) { current.soundEnabled = false; refreshSound(current); }
      });
    } else stopChime(current);
    refreshSound(current);
    if (onCover(current) && current.clip.paused) playFilm(current);
  });
  document.addEventListener('visibilitychange', () => {
    if (session?.tracking && document.hidden) {
      loseCover(session);
      show('Ищем обложку…', 'Наведите камеру на портрет Деда Мороза.');
    }
  });
  retry.addEventListener('click', () => {
    if (session?.tracking?.filmFailed && onCover(session)) {
      if (session.clip.error) session.clip.load();
      show('Обложка обнаружена ✓', 'Держите портрет в кадре.');
      playFilm(session);
    } else if (session?.stream) startTracking(session);
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
