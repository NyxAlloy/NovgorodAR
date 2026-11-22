'use strict';

function createEffects(sceneDocument) {
  const canvas = sceneDocument.getElementById('effectsCanvas');
  const ctx = canvas.getContext('2d');
  const layer = sceneDocument.getElementById('snowLayer');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = false;
  let frame = 0;
  let lastDraw = -Infinity;
  let shownAt = 0;

  const flakes = Array.from({length: 54}, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: 0.65 + Math.random() * 2.1,
    speed: 0.03 + Math.random() * 0.07,
    phase: Math.random() * 6.283,
  }));

  const lights = [
    [0.84, 0.27, 15], [0.90, 0.35, 12], [0.95, 0.42, 17],
    [0.79, 0.40, 9], [0.94, 0.51, 12], [0.82, 0.54, 10],
  ];

  // Toys grow onto the branches beside the bauble and star already painted on the cover.
  const ornaments = [
    {x: 0.90, y: 0.25, r: 11, color: '#e8b423', cap: '#f6e7a8', delay: 0.05},
    {x: 0.78, y: 0.39, r: 9, color: '#c4252c', cap: '#f4d2a2', delay: 0.28},
    {x: 0.93, y: 0.48, r: 8, color: '#1f7a45', cap: '#dcecc4', delay: 0.5},
  ];

  const eyes = [
    {x: 0.475, y: 0.418},
    {x: 0.575, y: 0.412},
  ];

  function inHeadline(xNorm, yNorm) {
    return xNorm < 0.72 && yNorm > 0.15 && yNorm < 0.33;
  }

  function drawOrnament(ornament, t, appear) {
    const progress = Math.max(0, Math.min(1, (appear - ornament.delay) / 0.55));
    if (progress <= 0) return;
    const scale = reduceMotion ? 1 : 1 - Math.pow(1 - progress, 3);
    const x = ornament.x * canvas.width;
    const y = ornament.y * canvas.height + (reduceMotion ? 0 : Math.sin(t * 1.5 + ornament.x * 8) * 2.5);
    const radius = ornament.r * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,236,190,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -radius - 10);
    ctx.lineTo(0, -radius);
    ctx.stroke();
    ctx.fillStyle = ornament.cap;
    ctx.fillRect(-3.5 * scale, -radius - 3, 7 * scale, 4 * scale);
    const gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.35, radius * 0.1, 0, 0, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(0.35, ornament.color);
    gradient.addColorStop(1, ornament.color);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFace(t) {
    const blink = !reduceMotion && (t % 4.2) > 4.02;
    for (const eye of eyes) {
      const x = eye.x * canvas.width;
      const y = eye.y * canvas.height;
      if (blink) {
        ctx.strokeStyle = 'rgba(90, 48, 36, 0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x + 7, y);
        ctx.stroke();
      } else {
        const spark = reduceMotion ? 0.7 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3 + eye.x));
        ctx.fillStyle = `rgba(255,248,220,${spark})`;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const smile = reduceMotion ? 1 : 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7));
    const mouthX = 0.53 * canvas.width;
    const mouthY = 0.458 * canvas.height;
    ctx.strokeStyle = `rgba(150, 52, 42, ${0.55 * smile})`;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(mouthX, mouthY - 4 * smile, 18, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 210, 190, ${0.25 * smile})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(mouthX, mouthY - 3 * smile, 16, 0.22 * Math.PI, 0.78 * Math.PI);
    ctx.stroke();
  }

  function drawEffects(ms) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = ms / 1000;
    const appear = reduceMotion ? 2 : (ms - shownAt) / 1000;
    if (!reduceMotion) {
      for (const flake of flakes) {
        const yNorm = (flake.y + t * flake.speed) % 1;
        const xNorm = flake.x + Math.sin(t * 0.8 + flake.phase) * 0.01;
        if (yNorm < 0.2 || yNorm > 0.84 || inHeadline(xNorm, yNorm)) continue;
        ctx.fillStyle = 'rgba(255,250,244,0.72)';
        ctx.beginPath();
        ctx.arc(xNorm * canvas.width, yNorm * canvas.height, flake.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const [xNorm, yNorm, radius] of lights) {
      const x = xNorm * canvas.width;
      const y = yNorm * canvas.height;
      const brightness = reduceMotion ? 0.55 : 0.32 + 0.25 * (1 + Math.sin(t * 2.3 + xNorm * 11));
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255,240,170,${brightness})`);
      gradient.addColorStop(0.25, `rgba(255,205,110,${brightness * .35})`);
      gradient.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (const ornament of ornaments) drawOrnament(ornament, t, appear);
    drawFace(t);
    drawWave(t);
  }

  function drawWave(t) {
    const angle = reduceMotion ? -0.4 : -1.05 + Math.sin(t * 4.2) * 0.9;
    ctx.save();
    ctx.translate(0.34 * canvas.width, 0.70 * canvas.height);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(243, 226, 204, 0.95)';
    ctx.strokeStyle = 'rgba(90, 48, 36, 0.65)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, -34, 18, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b4232c';
    ctx.fillRect(-16, -12, 32, 12);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(i * 10, -52, 6, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(243, 226, 204, 0.95)';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function animate(time) {
    if (!visible) return;
    if (time - lastDraw >= 60) {
      drawEffects(time);
      const texture = layer.getObject3D('mesh')?.material?.map;
      if (texture) texture.needsUpdate = true;
      lastDraw = time;
      if (reduceMotion && texture) return;
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
      animate(performance.now());
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const texture = layer.getObject3D('mesh')?.material?.map;
      if (texture) texture.needsUpdate = true;
    }
  };
}

function createTree(sceneDocument) {
  const canvas = sceneDocument.getElementById('treeCanvas');
  const ctx = canvas.getContext('2d');
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
    ctx.fillStyle = 'rgba(255, 248, 210, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, canvas.height * 0.48, canvas.width * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6e7a2';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
      const b = a + Math.PI / 5;
      ctx.lineTo(cx + Math.cos(a) * 16, top - 10 + Math.sin(a) * 16);
      ctx.lineTo(cx + Math.cos(b) * 7, top - 10 + Math.sin(b) * 7);
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
      const glow = reduceMotion ? 0.9 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3.4 + i));
      const radius = 10;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.4);
      halo.addColorStop(0, colors[i % colors.length]);
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = glow;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
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
    if (time - lastDraw >= 80) {
      drawTree(time);
      const texture = layer.getObject3D('mesh')?.material?.map;
      if (texture) texture.needsUpdate = true;
      lastDraw = time;
      if (reduceMotion && texture) return;
    }
    frame = requestAnimationFrame(animate);
  }

  return function setVisible(next) {
    if (visible === next) return;
    visible = next;
    layer.setAttribute('visible', next);
    if (visible) {
      lastDraw = -Infinity;
      animate(performance.now());
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const texture = layer.getObject3D('mesh')?.material?.map;
      if (texture) texture.needsUpdate = true;
    }
  };
}
