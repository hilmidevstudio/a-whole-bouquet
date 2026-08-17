// ============================================
// a little garden — turtle-style flower drawing
// ============================================

const canvas = document.getElementById('garden');
const ctx = canvas.getContext('2d');
const growBtn = document.getElementById('grow-btn');
const growBtnLabel = document.getElementById('grow-btn-label');
const resetBtn = document.getElementById('reset-btn');
const hint = document.getElementById('hint');

let cw, ch, dpr;

function resizeCanvas() {
  dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  cw = rect.width;
  ch = rect.height;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawAll();
}

// ---------- palette for flower heads ----------
const petalColors = [
  { petal: '#FF8577', center: '#FFC93C' }, // coral / sun
  { petal: '#FFC93C', center: '#FF8577' }, // sun / coral
  { petal: '#B78CDB', center: '#FFF4E0' }, // grape / cream
  { petal: '#7ED0E8', center: '#FFC93C' }, // sky-blue / sun
  { petal: '#FF9EB5', center: '#FFC93C' }, // pink / sun
];
const stemColor = '#6FAE5C';
const leafColor = '#8DC96F';

// ---------- turtle primitive ----------
// a minimal turtle: position (x,y), heading in degrees, pen state
class Turtle {
  constructor(x, y, heading = 0) {
    this.x = x;
    this.y = y;
    this.heading = heading; // 0 = pointing up (like classic turtle "north")
    this.path = []; // list of {x1,y1,x2,y2,color,width} segments in draw order
  }
  forward(dist, color, width) {
    const rad = (this.heading - 90) * Math.PI / 180;
    const nx = this.x + Math.cos(rad) * dist;
    const ny = this.y + Math.sin(rad) * dist;
    this.path.push({ x1: this.x, y1: this.y, x2: nx, y2: ny, color, width });
    this.x = nx;
    this.y = ny;
  }
  turn(deg) {
    this.heading += deg;
  }
  goto(x, y) {
    this.x = x;
    this.y = y;
  }
}

// ---------- build a flower's line-segment path ----------
// each flower = stem (bottom to top), a couple leaves, then a bloom made of
// looping petal curves approximated as short turtle segments (like a rose curve)
function buildFlower(baseX, baseY, scale, colorSet, seed) {
  const segments = [];
  const stemHeight = 150 * scale;
  const topX = baseX;
  const topY = baseY - stemHeight;

  // stem: gentle S-curve via a few short segments
  const stemSteps = 22;
  let prevX = baseX, prevY = baseY;
  for (let i = 1; i <= stemSteps; i++) {
    const t = i / stemSteps;
    const sway = Math.sin(t * Math.PI * 1.3 + seed) * 10 * scale * (1 - t * 0.4);
    const x = baseX + sway;
    const y = baseY - stemHeight * t;
    segments.push({ x1: prevX, y1: prevY, x2: x, y2: y, color: stemColor, width: Math.max(2.2 * scale, 1.4) });
    prevX = x; prevY = y;
  }
  const bloomCenter = { x: prevX, y: prevY };

  // leaves: two small curved leaves partway up the stem, angled outward
  // and away from the stem line so both sides read clearly
  const leafAtT = 0.42;
  const leafBase = { x: baseX + Math.sin(leafAtT * Math.PI * 1.3 + seed) * 10 * scale * (1 - leafAtT * 0.4), y: baseY - stemHeight * leafAtT };
  [-1, 1].forEach((side) => {
    const leafSteps = 10;
    let lx = leafBase.x, ly = leafBase.y;
    for (let i = 1; i <= leafSteps; i++) {
      const t = i / leafSteps;
      // outward bulge then taper back to a point — classic leaf silhouette
      const bulge = Math.sin(t * Math.PI);
      const spread = side * (26 * scale) * bulge;
      const rise = -t * 30 * scale;
      const nx = leafBase.x + spread;
      const ny = leafBase.y + rise;
      segments.push({ x1: lx, y1: ly, x2: nx, y2: ny, color: leafColor, width: Math.max(3 * scale * (1 - t * 0.4), 1) });
      lx = nx; ly = ny;
    }
  });

  // bloom: rose-curve petals (r = cos(k*theta)) traced as short segments,
  // drawn with a turtle-like incremental path so it can be animated stroke-by-stroke
  const petalCount = 5 + (seed % 2 === 0 ? 0 : 1); // 5 or 6 petals
  const R = 26 * scale;
  const steps = 140;
  let px = bloomCenter.x, py = bloomCenter.y;
  let first = true;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    const r = R * Math.cos(petalCount * theta / 2) * Math.cos(petalCount * theta / 2);
    const x = bloomCenter.x + r * Math.cos(theta);
    const y = bloomCenter.y + r * Math.sin(theta) - R * 0.15;
    if (!first) {
      segments.push({ x1: px, y1: py, x2: x, y2: y, color: colorSet.petal, width: Math.max(2.6 * scale, 1.6) });
    }
    px = x; py = y;
    first = false;
  }

  // center of the flower — small dot cluster
  const centerDot = { x: bloomCenter.x, y: bloomCenter.y - R * 0.15, r: Math.max(6 * scale, 3.5), color: colorSet.center };

  return { segments, centerDot };
}

// ---------- garden state ----------
let plantedFlowers = []; // { baseX, baseY, scale, colorSet, seed }
const MAX_FLOWERS = 6;

function randomBaseX() {
  const margin = 0.12;
  const minGap = cw * 0.13;
  let attempt;
  let tries = 0;
  do {
    attempt = cw * (margin + Math.random() * (1 - margin * 2));
    tries++;
  } while (
    tries < 12 &&
    plantedFlowers.some(f => Math.abs(f.baseX - attempt) < minGap)
  );
  return attempt;
}

function plantFlower() {
  if (plantedFlowers.length >= MAX_FLOWERS) return;

  const groundY = ch * 0.72; // matches the CSS gradient split
  const baseX = randomBaseX();
  const scale = 0.75 + Math.random() * 0.55;
  const colorSet = petalColors[Math.floor(Math.random() * petalColors.length)];
  const seed = plantedFlowers.length + Math.floor(Math.random() * 4);

  const flower = { baseX, baseY: groundY, scale, colorSet, seed };
  plantedFlowers.push(flower);

  animateFlower(flower);
  updateHintAndButton();
}

function animateFlower(flower) {
  const built = buildFlower(flower.baseX, flower.baseY, flower.scale, flower.colorSet, flower.seed);
  const segs = built.segments;
  const total = segs.length;
  const durationMs = 1400;
  const start = performance.now();

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(1, elapsed / durationMs);
    const segsToShow = Math.floor(progress * total);

    redrawAll(); // redraw everything already planted, fully
    // then draw this flower's progressive segments on top
    drawSegments(segs.slice(0, segsToShow));

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      // finished — draw fully including center dot, then persist as "grown"
      flower.grown = true;
      redrawAll();
    }
  }
  requestAnimationFrame(step);
}

function drawSegments(segs) {
  segs.forEach(s => {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.stroke();
  });
}

function redrawAll() {
  ctx.clearRect(0, 0, cw, ch);
  plantedFlowers.forEach(f => {
    if (f.grown) {
      const built = buildFlower(f.baseX, f.baseY, f.scale, f.colorSet, f.seed);
      drawSegments(built.segments);
      ctx.beginPath();
      ctx.arc(built.centerDot.x, built.centerDot.y, built.centerDot.r, 0, Math.PI * 2);
      ctx.fillStyle = built.centerDot.color;
      ctx.fill();
    }
  });
}

function updateHintAndButton() {
  const count = plantedFlowers.length;
  if (count >= MAX_FLOWERS) {
    growBtn.disabled = true;
    growBtnLabel.textContent = 'garden is full';
    hint.textContent = 'a whole bouquet, just for u awa-!! 💐';
  } else if (count === 0) {
    growBtnLabel.textContent = 'plant a flower';
    hint.textContent = 'tap the button, watch something grow';
  } else {
    growBtnLabel.textContent = 'plant another';
    hint.textContent = `${count} flower${count > 1 ? 's' : ''} planted so far`;
  }
}

growBtn.addEventListener('click', plantFlower);

resetBtn.addEventListener('click', () => {
  plantedFlowers = [];
  redrawAll();
  updateHintAndButton();
});

window.addEventListener('resize', resizeCanvas);
window.addEventListener('DOMContentLoaded', resizeCanvas);
resizeCanvas();
