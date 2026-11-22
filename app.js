'use strict';

const intro = document.getElementById('intro');
const introError = document.getElementById('introError');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const sceneAudio = document.getElementById('sceneAudio');
const AudioCtl = (() => {
  let ctx;
  let gain;
  let source;
  let buffer;
  let heard = false;

  async function unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      sceneAudio.loop = true;
      sceneAudio.volume = 0.001;
      await sceneAudio.play().catch(() => {});
      return;
    }
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (!buffer) {
      const response = await fetch(sceneAudio.currentSrc || sceneAudio.src);
      buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    }
    if (!gain) {
      gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
    }
    if (!source) {
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(0);
    }
    setHeard(heard);
  }

  function setHeard(next) {
    heard = next;
    if (gain && ctx) {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(next ? 0.85 : 0.0001, now, 0.04);
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    sceneAudio.volume = next ? 1 : 0.001;
    if (next) sceneAudio.play().catch(() => {});
    else {
      sceneAudio.pause();
      sceneAudio.currentTime = 0;
    }
  }

  function stop() {
    heard = false;
    if (source) {
      try { source.stop(); } catch (error) { /* already stopped */ }
      source.disconnect();
      source = null;
    }
    if (gain && ctx) {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.value = 0.0001;
    }
    if (ctx && ctx.state !== 'closed') ctx.suspend().catch(() => {});
    sceneAudio.pause();
    sceneAudio.currentTime = 0;
    sceneAudio.volume = 0.001;
  }

  return {unlock, setHeard, stop};
})();
let session;

function closeCamera(message = '') {
  if (session) {
    const current = session;
    session = null;
    clearTimeout(current.timer);
    clearTimeout(current.scriptWait);
    current.targetRequest?.abort();
    current.setVisible?.(false);
    current.setTreeVisible?.(false);
    AudioCtl.stop();
    if (current.ready) {
      try { current.system.stop(); }
      catch (error) { console.warn('MindAR stop', error); }
    }
    // Closing the frame also cancels a pending permission request or MindAR startup.
    current.preview?.getTracks().forEach(track => track.stop());
    for (const video of current.frame.contentDocument?.querySelectorAll('video') || []) {
      video.srcObject?.getTracks().forEach(track => track.stop());
    }
    const sceneWindow = current.frame.contentWindow;
    if (current.onStartupRejection) {
      sceneWindow?.removeEventListener('unhandledrejection', current.onStartupRejection);
    }
    // The blob URL belongs to the scene frame. Revoke it before that document is discarded.
    if (current.targetURL && sceneWindow) sceneWindow.URL.revokeObjectURL(current.targetURL);
    current.frame.remove();
  }
  hud.hidden = true;
  intro.hidden = false;
  introError.textContent = message;
  startButton.focus({preventScroll: true});
}

async function loadCoverTarget(current, system) {
  const frame = current.frame.contentWindow;
  const source = new URL(system.imageTargetSrc, current.frame.contentDocument.baseURI);
  // The file next to the page is the one this build was published with. GitHub is only a
  // fallback: raw.githubusercontent.com often stalls on a phone, and each attempt waits 20s.
  const sources = [{url: source.href}];
  const project = /^\/NyxAlloy\/NovgorodAR\/([^/]+)\/targets\.mind$/i.exec(source.pathname);
  if (project && ['raw.githack.com', 'rawcdn.githack.com'].includes(source.hostname)) {
    sources.push(
      {url: 'https://raw.githubusercontent.com' + source.pathname},
      {
        url: 'https://api.github.com/repos/NyxAlloy/NovgorodAR/contents/targets.mind?ref=' + project[1],
        headers: {Accept: 'application/vnd.github.raw+json'}
      }
    );
  }

  for (const {url, headers} of sources) {
    const request = new AbortController();
    current.targetRequest = request;
    const timeout = setTimeout(() => request.abort(), 20000);
    try {
      const response = await fetch(url, {headers, signal: request.signal});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      if (session !== current) return false;
      // Decode with the same MindAR reader that will start tracking this cover.
      const targets = new frame.MINDAR.IMAGE.Compiler().importData(bytes);
      if (targets.length < 2 || targets.some(item => !item.matchingData?.length || !item.trackingData?.length)) {
        throw new Error('Файл не содержит данных обоих рисунков');
      }
      const blob = new frame.Blob([bytes], {type: 'application/octet-stream'});
      current.targetURL = frame.URL.createObjectURL(blob);
      system.imageTargetSrc = current.targetURL;
      return true;
    } catch (error) {
      if (session !== current) return false;
      console.warn('Загрузка данных обложки', url, error);
    } finally {
      clearTimeout(timeout);
      current.targetRequest = null;
    }
  }
  closeCamera('Не удалось скачать данные обложки. Проверьте подключение к интернету и нажмите «Включить камеру» ещё раз.');
  return false;
}

function stopStream(stream) {
  const tracks = stream?.getTracks() || [];
  const ended = tracks.map(track => track.readyState === 'ended'
    ? Promise.resolve()
    : new Promise(resolve => track.addEventListener('ended', resolve, {once: true})));
  tracks.forEach(track => track.stop());
  return Promise.race([
    Promise.all(ended),
    new Promise(resolve => setTimeout(resolve, 800))
  ]);
}

function allowCameraRetry(win) {
  const devices = win.navigator.mediaDevices;
  if (!devices?.getUserMedia || devices.__cameraRetry) return;
  const native = devices.getUserMedia.bind(devices);
  devices.__cameraRetry = true;
  devices.getUserMedia = async function(constraints) {
    let error;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await native(constraints);
      } catch (failure) {
        error = failure;
        const busy = failure?.name === 'NotReadableError' || failure?.name === 'TrackStartError' || failure?.name === 'AbortError';
        if (!busy) throw failure;
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    throw error;
  };
}

function connectScene(current) {
  if (session !== current || current.connected) return;
  const {frame} = current;
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  // The first load is often about:blank, or the new address is already set while the
  // scene document and its scripts are not ready. Closing here cancelled the real load.
  if (!win || !doc) return;
  let href = '';
  try { href = win.location.href; } catch (error) { return; }
  if (!href || href === 'about:blank') return;
  const scene = doc.getElementById('arScene');
  if (!scene) return;
  if (!win.AFRAME) {
    if (win.__scriptError) {
      closeCamera('Не удалось загрузить библиотеку сцены (' + win.__scriptError + '). Обновите страницу и повторите запуск.');
      return;
    }
    current.scriptTries = (current.scriptTries || 0) + 1;
    if (current.scriptTries < 8) {
      clearTimeout(current.scriptWait);
      current.scriptWait = setTimeout(() => connectScene(current), 500);
      return;
    }
    closeCamera('Не удалось загрузить сцену A-Frame. Обновите страницу и повторите запуск.');
    return;
  }
  clearTimeout(current.scriptWait);
  current.scriptWait = null;
  current.connected = true;

  async function startTracking() {
    if (session !== current) return;
    const system = scene.systems['mindar-image-system'];
    if (!system) {
      closeCamera('Не удалось загрузить MindAR. Проверьте интернет и повторите запуск.');
      return;
    }
    try {
      current.system = system;
      statusEl.textContent = 'Загружаем данные рисунков…';
      if (!await loadCoverTarget(current, system) || session !== current) return;
      current.setVisible = createEffects(doc);
      current.setTreeVisible = createTree(doc);
      current.coverVisible = false;
      current.poemVisible = false;
      function showStatus() {
        if (current.coverVisible && current.poemVisible) statusEl.textContent = 'Оба рисунка в кадре ✓';
        else if (current.coverVisible) statusEl.textContent = 'Дед Мороз ожил ✓';
        else if (current.poemVisible) statusEl.textContent = 'Ёлка зажглась ✓';
        else statusEl.textContent = 'Ищем рисунок…';
        AudioCtl.setHeard(current.coverVisible || current.poemVisible);
      }
      function watch(element, key, show) {
        element.addEventListener('targetFound', () => {
          if (session !== current || !current.ready) return;
          current[key] = true;
          show(true);
          showStatus();
        });
        element.addEventListener('targetLost', () => {
          if (session !== current || !current.ready) return;
          current[key] = false;
          show(false);
          showStatus();
        });
      }
      watch(doc.getElementById('coverTarget'), 'coverVisible', current.setVisible);
      watch(doc.getElementById('poemTarget'), 'poemVisible', current.setTreeVisible);
      // MindAR starts the video and its async initialization after start() returns.
      const onStartupRejection = (event) => {
        if (session !== current) return;
        const reason = event.reason;
        const detail = (reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '')
          .replace(/\s+/g, ' ').trim().slice(0, 180);
        event.preventDefault();
        closeCamera(detail
          ? 'Не удалось подготовить распознавание. ' + detail
          : 'Не удалось подготовить распознавание. Проверьте файл targets.mind и поддержку WebGL в браузере.');
      };
      current.onStartupRejection = onStartupRejection;
      frame.contentWindow.addEventListener('unhandledrejection', onStartupRejection);
      scene.addEventListener('arReady', () => {
        if (session !== current) return;
        clearTimeout(current.timer);
        frame.contentWindow.removeEventListener('unhandledrejection', onStartupRejection);
        current.ready = true;
        statusEl.textContent = 'Ищем рисунок…';
        const cameraTrack = system.video?.srcObject?.getVideoTracks()[0];
        const onCameraEnded = () => {
          if (session === current) closeCamera('Видеопоток прервался. Включите камеру ещё раз.');
        };
        if (cameraTrack?.readyState === 'ended') onCameraEnded();
        else cameraTrack?.addEventListener('ended', onCameraEnded, {once: true});
      }, {once: true});
      scene.addEventListener('arError', () => {
        if (session === current) closeCamera('Камера недоступна. Проверьте разрешение браузера и закройте приложения, которые используют камеру.');
      });
      statusEl.textContent = 'Разрешите доступ к камере…';
      await stopStream(current.preview);
      current.preview = null;
      if (session !== current) return;
      allowCameraRetry(frame.contentWindow);
      system.start();
    } catch (error) {
      console.error('MindAR', error);
      if (session === current) closeCamera('Не удалось запустить распознавание. Проверьте доступ к камере и повторите запуск.');
    }
  }
  if (scene.hasLoaded) startTracking();
  else scene.addEventListener('loaded', startTracking, {once: true});
}

let opening = false;

async function openCamera() {
  if (session || opening) return;
  if (!window.isSecureContext || location.protocol === 'file:') {
    closeCamera('Откройте сайт по HTTPS или через локальный сервер на localhost.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    closeCamera('Этот браузер не предоставляет доступ к камере. Откройте страницу в Safari или Chrome.');
    return;
  }
  opening = true;
  startButton.disabled = true;
  const unlockAudio = AudioCtl.unlock().catch((error) => console.warn('Звук', error));
  let preview;
  try {
    // The prompt must come from this click. MindAR asks again later, inside the scene.
    preview = await navigator.mediaDevices.getUserMedia({
      video: {facingMode: {ideal: 'environment'}},
      audio: false
    });
    await unlockAudio;
  } catch (error) {
    opening = false;
    startButton.disabled = false;
    AudioCtl.stop();
    const denied = error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
    closeCamera(denied
      ? 'Камера недоступна. Разрешите доступ к камере в браузере и нажмите «Включить камеру» ещё раз.'
      : 'Камера недоступна. Проверьте разрешение браузера и закройте приложения, которые используют камеру.');
    return;
  }
  const frame = document.createElement('iframe');
  frame.className = 'camera-frame';
  frame.title = 'Камера для распознавания обложки';
  frame.allow = 'camera';
  const current = {frame, preview, ready: false, connected: false};
  session = current;
  opening = false;
  startButton.disabled = false;
  introError.textContent = '';
  intro.hidden = true;
  hud.hidden = false;
  statusEl.textContent = 'Загружаем сцену…';
  stopButton.focus({preventScroll: true});
  current.timer = setTimeout(() => {
    if (session === current) closeCamera('Запуск занял слишком много времени. Проверьте доступ к камере и повторите попытку.');
  }, 90000);
  frame.addEventListener('load', () => connectScene(current));
  document.body.append(frame);
  frame.src = './scene.html?v=11';
}

startButton.addEventListener('click', openCamera);
stopButton.addEventListener('click', () => closeCamera());
window.addEventListener('pagehide', () => { if (session) closeCamera(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session?.ready) closeCamera();
});
