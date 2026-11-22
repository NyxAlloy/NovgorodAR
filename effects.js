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

  // Eyes and mouth sit on Ded Moroz's face; mitten is the outstretched red glove.
  const eyes = [
    {x: 0.475, y: 0.418},
    {x: 0.575, y: 0.412},
  ];
  const mouth = {x: 0.53, y: 0.455};
  const hand = {x: 0.42, y: 0.63};

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

  function drawFace(t) {
    const blink = !reduceMotion && (t % 3.6) > 3.35;
    for (const eye of eyes) {
      const x = eye.x * canvas.width;
      const y = eye.y * canvas.height;
      if (blink) {
        ctx.strokeStyle = 'rgba(60, 30, 20, 0.85)';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 10, y);
        ctx.lineTo(x + 10, y);
        ctx.stroke();
      } else {
        const spark = reduceMotion ? 0.9 : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4 + eye.x * 9));
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
        glow.addColorStop(0, `rgba(255,250,210,${spark})`);
        glow.addColorStop(1, 'rgba(255,220,120,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${spark})`;
        ctx.beginPath();
        ctx.arc(x - 2, y - 2, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const smile = reduceMotion ? 1 : 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.1));
    const mouthX = mouth.x * canvas.width;
    const mouthY = mouth.y * canvas.height;
    ctx.strokeStyle = `rgba(120, 35, 30, ${0.8 * smile})`;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(mouthX, mouthY - 2, 22 * smile, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 190, 170, ${0.45 * smile})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY - 1, 18 * smile, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();

    // Cheek flush so the smile reads on camera.
    for (const side of [-1, 1]) {
      const cx = mouthX + side * 34;
      const cy = mouthY + 4;
      const blush = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16);
      blush.addColorStop(0, `rgba(255, 110, 110, ${0.28 * smile})`);
      blush.addColorStop(1, 'rgba(255,110,110,0)');
      ctx.fillStyle = blush;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWave(t) {
    const angle = reduceMotion ? -0.35 : -0.95 + Math.sin(t * 5) * 1.05;
    const bob = reduceMotion ? 0 : Math.sin(t * 5) * 8;
    ctx.save();
    ctx.translate(hand.x * canvas.width, hand.y * canvas.height + bob);
    ctx.rotate(angle);

    // Soft glow behind the waving mitten so motion is obvious on the photo.
    const aura = ctx.createRadialGradient(0, -20, 4, 0, -20, 55);
    aura.addColorStop(0, 'rgba(255,230,160,0.45)');
    aura.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, -20, 55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d21f2b';
    ctx.strokeStyle = 'rgba(70, 20, 20, 0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -28, 28, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f4efe6';
    ctx.beginPath();
    ctx.ellipse(0, -2, 30, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = '#d21f2b';
      ctx.beginPath();
      ctx.ellipse(i * 14, -58, 9, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0, -30, 7, 0, Math.PI * 2);
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
    drawFace(t);
    drawWave(t);
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
  const sceneWindow = sceneDocument.defaultView;
  const canvas = sceneDocument.getElementById('treeCanvas');
  const ctx = canvas.getContext('2d', {alpha: true});
  const layer = sceneDocument.getElementById('treeLayer');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = false;
  let frame = 0;
  let lastDraw = -Infinity;

  const bulbs = [
    [0.50, 0.22], [0.42, 0.34], [0.58, 0.36], [0.36, 0.48],
    [0.50, 0.46], [0.64, 0.50], [0.32, 0.62], [0.46, 0.60],
    [0.60, 0.64], [0.70, 0.62], [0.40, 0.74], [0.56, 0.76],
  ];
  const colors = ['#ffe08a', '#ff5a62', '#7fd0ff', '#fff6d8'];

  function drawTree(ms) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = ms / 1000;
    const cx = canvas.width * 0.5;
    const top = canvas.height * 0.14;
    ctx.fillStyle = 'rgba(255, 248, 210, 0.45)';
    ctx.beginPath();
    ctx.arc(cx, canvas.height * 0.48, canvas.width * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6e7a2';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      const b = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a) * 18, top - 10 + Math.sin(a) * 18);
      ctx.lineTo(cx + Math.cos(b) * 8, top - 10 + Math.sin(b) * 8);
    }
    ctx.closePath();
    ctx.fill();
    for (let tier = 0; tier < 4; tier++) {
      const y = top + tier * canvas.height * 0.15;
      const half = 52 + tier * 38;
      const gradient = ctx.createLinearGradient(cx, y, cx, y + canvas.height * 0.22);
      gradient.addColorStop(0, '#2f9a52');
      gradient.addColorStop(1, '#14532d');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.lineTo(cx + half, y + canvas.height * 0.2);
      ctx.lineTo(cx - half, y + canvas.height * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#6b3a22';
    ctx.fillRect(cx - 16, canvas.height * 0.8, 32, canvas.height * 0.1);
    for (let i = 0; i < bulbs.length; i++) {
      const [xNorm, yNorm] = bulbs[i];
      const x = xNorm * canvas.width;
      const y = yNorm * canvas.height;
      const glow = reduceMotion ? 0.95 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.8 + i));
      const radius = 12;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.6);
      halo.addColorStop(0, colors[i % colors.length]);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = glow;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function animate(time) {
    if (!visible) return;
    if (time - lastDraw >= 60) {
      drawTree(time);
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
      lastDraw = -Infinity;
      drawTree(performance.now());
      touchCanvasTexture(layer, canvas, sceneWindow);
      animate(performance.now());
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      touchCanvasTexture(layer, canvas, sceneWindow);
    }
  };
}
