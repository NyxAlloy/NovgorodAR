'use strict';

function touchCanvasTexture(layer, canvas, sceneWindow) {
  const mesh = layer.getObject3D('mesh');
  if (!mesh?.material) return;
  const THREE = sceneWindow.AFRAME?.THREE;
  if (!mesh.material.map && THREE) {
    const map = new THREE.CanvasTexture(canvas);
    if ('colorSpace' in map && THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
    else if ('encoding' in map && THREE.sRGBEncoding) map.encoding = THREE.sRGBEncoding;
    mesh.material.map = map;
    mesh.material.transparent = true;
    mesh.material.needsUpdate = true;
  }
  if (mesh.material.map) mesh.material.map.needsUpdate = true;
}

function createEffects(sceneDocument) {
  const sceneWindow = sceneDocument.defaultView;
  const canvas = sceneDocument.getElementById('effectsCanvas');
  const ctx = canvas.getContext('2d', {alpha: true});
  const layer = sceneDocument.getElementById('snowLayer');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = false;
  let frame = 0;
  let lastDraw = -Infinity;
  let shownAt = 0;

  const flakes = Array.from({length: 70}, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: 1.2 + Math.random() * 3.2,
    speed: 0.04 + Math.random() * 0.09,
    phase: Math.random() * 6.283,
  }));

  const lights = [
    [0.84, 0.27, 22], [0.90, 0.35, 18], [0.95, 0.42, 24],
    [0.79, 0.40, 14], [0.94, 0.51, 18], [0.82, 0.54, 16],
  ];

  const ornaments = [
    {x: 0.90, y: 0.25, r: 16, color: '#e8b423', cap: '#f6e7a8', delay: 0.05},
    {x: 0.78, y: 0.39, r: 14, color: '#c4252c', cap: '#f4d2a2', delay: 0.22},
    {x: 0.93, y: 0.48, r: 13, color: '#1f7a45', cap: '#dcecc4', delay: 0.4},
  ];

  function inHeadline(xNorm, yNorm) {
    return xNorm < 0.72 && yNorm > 0.15 && yNorm < 0.33;
  }

  function drawOrnament(ornament, t, appear) {
    const progress = Math.max(0, Math.min(1, (appear - ornament.delay) / 0.45));
    if (progress <= 0) return;
    const scale = reduceMotion ? 1 : 1 - Math.pow(1 - progress, 3);
    const x = ornament.x * canvas.width;
    const y = ornament.y * canvas.height + (reduceMotion ? 0 : Math.sin(t * 1.8 + ornament.x * 8) * 4);
    const radius = ornament.r * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,236,190,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -radius - 14);
    ctx.lineTo(0, -radius);
    ctx.stroke();
    ctx.fillStyle = ornament.cap;
    ctx.fillRect(-5 * scale, -radius - 4, 10 * scale, 5 * scale);
    const gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.1, 0, 0, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.35, ornament.color);
    gradient.addColorStop(1, ornament.color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEffects(ms) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = ms / 1000;
    const appear = reduceMotion ? 2 : (ms - shownAt) / 1000;
    if (!reduceMotion) {
      for (const flake of flakes) {
        const yNorm = (flake.y + t * flake.speed) % 1;
        const xNorm = flake.x + Math.sin(t * 0.9 + flake.phase) * 0.015;
        if (yNorm < 0.18 || yNorm > 0.88 || inHeadline(xNorm, yNorm)) continue;
        ctx.fillStyle = 'rgba(255,252,248,0.88)';
        ctx.beginPath();
        ctx.arc(xNorm * canvas.width, yNorm * canvas.height, flake.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const [xNorm, yNorm, radius] of lights) {
      const x = xNorm * canvas.width;
      const y = yNorm * canvas.height;
      const brightness = reduceMotion ? 0.7 : 0.4 + 0.35 * (1 + Math.sin(t * 2.6 + xNorm * 11));
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255,245,180,${brightness})`);
      gradient.addColorStop(0.3, `rgba(255,200,90,${brightness * 0.4})`);
      gradient.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (const ornament of ornaments) drawOrnament(ornament, t, appear);
  }

  function animate(time) {
    if (!visible) return;
    if (time - lastDraw >= 50) {
      drawEffects(time);
      touchCanvasTexture(layer, canvas, sceneWindow);
      lastDraw = time;
      if (reduceMotion) return;
    }
    frame = requestAnimationFrame(animate);
  }

  return function setVisible(next) {
    if (visible === next) return;
    visible = next;
    layer.setAttribute('visible', next);
    if (visible) {
      shownAt = performance.now();
      lastDraw = -Infinity;
      drawEffects(shownAt);
      touchCanvasTexture(layer, canvas, sceneWindow);
      animate(performance.now());
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      touchCanvasTexture(layer, canvas, sceneWindow);
    }
  };
}

function createTree(sceneDocument) {
  // Point the camera at the poem: a Christmas tree with many colored lights grows over it.
  const sceneWindow = sceneDocument.defaultView;
  const canvas = sceneDocument.getElementById('treeCanvas');
  const ctx = canvas.getContext('2d', {alpha: true});
  const layer = sceneDocument.getElementById('treeLayer');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = false;
  let frame = 0;
  let lastDraw = -Infinity;
  let shownAt = 0;

  const colors = ['#ffe08a', '#ff4d5a', '#6ecbff', '#fff6d8', '#ffb347', '#b4f07a', '#ff8ad8'];
  const bulbs = [
    [0.50, 0.14], [0.43, 0.21], [0.57, 0.22], [0.38, 0.29], [0.50, 0.28], [0.62, 0.30],
    [0.32, 0.37], [0.44, 0.36], [0.56, 0.38], [0.68, 0.37], [0.28, 0.45], [0.40, 0.44],
    [0.52, 0.46], [0.64, 0.45], [0.72, 0.44], [0.34, 0.52], [0.48, 0.53], [0.60, 0.52],
  ];

  function drawPoem(ms) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = ms / 1000;
    const appear = reduceMotion ? 2 : (ms - shownAt) / 1000;
    const grow = reduceMotion ? 1 : Math.min(1, appear / 0.85);
    const cx = canvas.width * 0.5;
    const top = canvas.height * 0.06;

    // Soft cream veil only over the printed tree, leave the verse readable below.
    ctx.fillStyle = `rgba(250, 244, 232, ${0.7 * grow})`;
    ctx.fillRect(canvas.width * 0.1, canvas.height * 0.04, canvas.width * 0.8, canvas.height * 0.54);

    ctx.save();
    ctx.translate(cx, top + canvas.height * 0.3);
    ctx.scale(grow, grow);
    ctx.translate(-cx, -(top + canvas.height * 0.3));

    // Star
    ctx.fillStyle = '#f6e7a2';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const b = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a) * 18, top + Math.sin(a) * 18);
      ctx.lineTo(cx + Math.cos(b) * 8, top + Math.sin(b) * 8);
    }
    ctx.closePath();
    ctx.fill();

    for (let tier = 0; tier < 4; tier++) {
      const y = top + 22 + tier * canvas.height * 0.1;
      const half = 52 + tier * 36;
      const gradient = ctx.createLinearGradient(cx, y, cx, y + canvas.height * 0.16);
      gradient.addColorStop(0, '#3bb86a');
      gradient.addColorStop(1, '#14532d');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + half, y + canvas.height * 0.15);
      ctx.lineTo(cx - half, y + canvas.height * 0.15);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#6b3a22';
    ctx.fillRect(cx - 16, canvas.height * 0.54, 32, canvas.height * 0.07);

    for (let i = 0; i < bulbs.length; i++) {
      const [xNorm, yNorm] = bulbs[i];
      const x = xNorm * canvas.width;
      const y = yNorm * canvas.height;
      const glow = reduceMotion ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 4.2 + i * 0.9));
      const radius = 10 + (i % 3);
      const color = colors[i % colors.length];
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 3);
      halo.addColorStop(0, color);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = glow;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, radius * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function animate(time) {
    if (!visible) return;
    if (time - lastDraw >= 50) {
      drawPoem(time);
      touchCanvasTexture(layer, canvas, sceneWindow);
      lastDraw = time;
      if (reduceMotion) return;
    }
    frame = requestAnimationFrame(animate);
  }

  return function setVisible(next) {
    if (visible === next) return;
    visible = next;
    layer.setAttribute('visible', next);
    if (visible) {
      shownAt = performance.now();
      lastDraw = -Infinity;
      drawPoem(shownAt);
      touchCanvasTexture(layer, canvas, sceneWindow);
      animate(performance.now());
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      touchCanvasTexture(layer, canvas, sceneWindow);
    }
  };
}
