'use strict';

function createEffects(canvas) {
  const ctx = canvas.getContext('2d');
  let visible = false;
  let frame = 0;
  let lastDraw = -Infinity;

  const flakes = Array.from({length: 68}, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: 0.65 + Math.random() * 2.1,
    speed: 10 + Math.random() * 32,
    phase: Math.random() * 6.283,
  }));

  // The art occupies most of the front page. Twinkles sit around the trees.
  const lights = [
    [0.886, 0.111, 14], [0.930, 0.205, 10], [0.980, 0.257, 8],
    [0.943, 0.356, 18], [0.843, 0.188, 7], [0.929, 0.002, 6],
  ];

  function drawEffects(ms) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = ms / 1000;
    // Particles stay in roughly the same part of the printed newspaper.
    for (const flake of flakes) {
      const drift = Math.sin(t * 0.8 + flake.phase) * 5;
      const x = flake.x + drift;
      const y = (flake.y + t * flake.speed) % canvas.height;
      ctx.fillStyle = 'rgba(255,250,244,0.72)';
      ctx.beginPath();
      ctx.arc(x, y, flake.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [xNorm, yNorm, radius] of lights) {
      const x = xNorm * canvas.width;
      const y = yNorm * canvas.height;
      const brightness = 0.32 + 0.25 * (1 + Math.sin(t * 2.3 + xNorm * 11));
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(255,240,170,${brightness})`);
      g.addColorStop(0.25, `rgba(255,205,110,${brightness * .35})`);
      g.addColorStop(1, 'rgba(255,170,70,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x-radius, y-radius, radius*2, radius*2);
    }
  }

  function animate(time) {
    if (!visible) return;
    if (time - lastDraw >= 60) {
      drawEffects(time);
      lastDraw = time;
    }
    frame = requestAnimationFrame(animate);
  }

  return function setVisible(next) {
    if (visible === next) return;
    visible = next;
    canvas.hidden = !next;
    if (visible) {
      lastDraw = -Infinity;
      animate(performance.now());
    } else {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
}
