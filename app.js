'use strict';

const intro = document.getElementById('intro');
const introError = document.getElementById('introError');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
let session;

function closeCamera(message = '') {
  if (session) {
    const current = session;
    session = null;
    clearTimeout(current.timer);
    current.setVisible?.(false);
    if (current.ready) {
      try { current.system.stop(); }
      catch (error) { console.warn('MindAR stop', error); }
    }
    // Closing the frame also cancels a pending permission request or MindAR startup.
    for (const video of current.frame.contentDocument?.querySelectorAll('video') || []) {
      video.srcObject?.getTracks().forEach(track => track.stop());
    }
    current.frame.remove();
  }
  hud.hidden = true;
  intro.hidden = false;
  introError.textContent = message;
  startButton.focus({preventScroll: true});
}

function connectScene(current) {
  if (session !== current) return;
  const {frame} = current;
  const doc = frame.contentDocument;
  const scene = doc?.getElementById('arScene');
  if (!frame.contentWindow.AFRAME || !scene) {
    closeCamera('Не удалось загрузить сцену A-Frame. Проверьте интернет и повторите запуск.');
    return;
  }

  async function startTracking() {
    if (session !== current) return;
    const system = scene.systems['mindar-image-system'];
    if (!system) {
      closeCamera('Не удалось загрузить MindAR. Проверьте интернет и повторите запуск.');
      return;
    }
    try {
      current.system = system;
      const marker = await fetch('./targets.mind', {method: 'HEAD'});
      if (session !== current) return;
      const headUnsupported = marker.status === 405 || marker.status === 501;
      if (!headUnsupported && (!marker.ok || marker.headers.get('content-type')?.includes('text/html'))) {
        closeCamera('Не удалось загрузить targets.mind. Проверьте, что файл находится рядом с index.html.');
        return;
      }
      current.setVisible = createEffects(doc);
      const target = doc.getElementById('coverTarget');
      function track(visible) {
        if (session !== current || !current.ready) return;
        current.setVisible(visible);
        statusEl.textContent = visible ? 'Обложка обнаружена ✓' : 'Ищем обложку…';
      }
      target.addEventListener('targetFound', () => track(true));
      target.addEventListener('targetLost', () => track(false));
      // MindAR starts the video and its async initialization after start() returns.
      const onStartupRejection = () => {
        if (session === current) closeCamera('Не удалось подготовить распознавание. Проверьте файл targets.mind и поддержку WebGL в браузере.');
      };
      frame.contentWindow.addEventListener('unhandledrejection', onStartupRejection);
      scene.addEventListener('arReady', () => {
        if (session !== current) return;
        clearTimeout(current.timer);
        frame.contentWindow.removeEventListener('unhandledrejection', onStartupRejection);
        current.ready = true;
        statusEl.textContent = 'Ищем обложку…';
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
      system.start();
    } catch (error) {
      console.error('MindAR', error);
      if (session === current) closeCamera('Не удалось запустить распознавание. Проверьте доступ к камере и повторите запуск.');
    }
  }
  if (scene.hasLoaded) startTracking();
  else scene.addEventListener('loaded', startTracking, {once: true});
}

function openCamera() {
  if (session) return;
  if (!window.isSecureContext || location.protocol === 'file:') {
    closeCamera('Откройте сайт по HTTPS или через локальный сервер на localhost.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    closeCamera('Этот браузер не предоставляет доступ к камере. Откройте страницу в Safari или Chrome.');
    return;
  }
  const frame = document.createElement('iframe');
  frame.className = 'camera-frame';
  frame.title = 'Камера для распознавания обложки';
  frame.allow = 'camera';
  frame.src = './scene.html';
  const current = {frame, ready: false};
  session = current;
  introError.textContent = '';
  intro.hidden = true;
  hud.hidden = false;
  statusEl.textContent = 'Загружаем сцену…';
  stopButton.focus({preventScroll: true});
  current.timer = setTimeout(() => {
    if (session === current) closeCamera('Запуск занял слишком много времени. Проверьте доступ к камере, интернет и наличие targets.mind рядом с index.html.');
  }, 90000);
  frame.addEventListener('load', () => connectScene(current), {once: true});
  document.body.append(frame);
}

startButton.addEventListener('click', openCamera);
stopButton.addEventListener('click', () => closeCamera());
window.addEventListener('pagehide', () => { if (session) closeCamera(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && session) closeCamera();
});
