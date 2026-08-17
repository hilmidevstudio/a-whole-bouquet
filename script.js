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
// looping petal curves approximated as short turtle segments (like a rose curve).
// tipX/tipY is where the bloom ends up; the stem curves there from a shared
// "tied" base point so the whole set reads as one bouquet, not a scattered field.
function buildFlower(tieX, tieY, tipX, tipY, scale, colorSet, seed) {
  const segments = [];

  // stem: curve from the shared tie point up to the bloom position, with a
  // little organic sway rather than a straight line
  const stemSteps = 22;
  let prevX = tieX, prevY = tieY;
  const dx = tipX - tieX;
  const dy = tipY - tieY;
  for (let i = 1; i <= stemSteps; i++) {
    const t = i / stemSteps;
    // ease so the stem leaves the tie point tightly, then spreads toward the bloom
    const eased = t * t * (3 - 2 * t);
    const sway = Math.sin(t * Math.PI * 1.6 + seed) * 6 * scale * Math.sin(t * Math.PI);
    const perpX = -dy / Math.hypot(dx, dy) || 0;
    const x = tieX + dx * eased + sway * perpX;
    const y = tieY + dy * eased;
    segments.push({ x1: prevX, y1: prevY, x2: x, y2: y, color: stemColor, width: Math.max(2.2 * scale, 1.4) });
    prevX = x; prevY = y;
  }
  const bloomCenter = { x: tipX, y: tipY };

  // leaves: two small curved leaves partway up the stem, angled outward
  const leafAtT = 0.48;
  const leafEased = leafAtT * leafAtT * (3 - 2 * leafAtT);
  const leafBase = { x: tieX + dx * leafEased, y: tieY + dy * leafEased };
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
let plantedFlowers = []; // { tipX, tipY, scale, colorSet, seed, angle }
const MAX_FLOWERS = 6;

// bouquet fan-out: each new flower gets an angle spreading from the
// tie point, like stems gathered in a hand. Order plant order left-to-right
// across a fan so it always reads as one held bunch.
const FAN_ANGLES = [-38, -22, -7, 7, 22, 38]; // degrees from vertical, tip lands here
const FAN_ORDER = [2, 3, 1, 4, 0, 5]; // plant center-out for a natural build-up

function plantFlower() {
  if (plantedFlowers.length >= MAX_FLOWERS) return;

  const groundY = ch * 0.68; // matches the CSS gradient split
  const tieX = cw * 0.5;
  const tieY = groundY + ch * 0.03; // stems gather just below the soil line

  const index = plantedFlowers.length;
  const slot = FAN_ORDER[index];
  const angleDeg = FAN_ANGLES[slot];
  const angleRad = (angleDeg * Math.PI) / 180;

  const stemLength = (150 + Math.random() * 24) * (0.92 + Math.random() * 0.16);
  const tipX = tieX + Math.sin(angleRad) * stemLength * 0.62;
  const tipY = tieY - Math.cos(angleRad) * stemLength;

  const scale = 0.72 + Math.random() * 0.34;
  const colorSet = petalColors[Math.floor(Math.random() * petalColors.length)];
  const seed = index + Math.floor(Math.random() * 4);

  const flower = { tieX, tieY, tipX, tipY, scale, colorSet, seed };
  plantedFlowers.push(flower);

  animateFlower(flower);
  updateHintAndButton();
}

function animateFlower(flower) {
  const built = buildFlower(flower.tieX, flower.tieY, flower.tipX, flower.tipY, flower.scale, flower.colorSet, flower.seed);
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

  // draw a little ribbon knot at the tie point once at least one flower exists
  if (plantedFlowers.length > 0) {
    const tie = plantedFlowers[0];
    ctx.save();
    ctx.translate(tie.tieX, tie.tieY);
    ctx.fillStyle = '#FF9EB5';
    ctx.beginPath();
    ctx.ellipse(-10, 0, 13, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10, 0, 13, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#E8779A';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  plantedFlowers.forEach(f => {
    if (f.grown) {
      const built = buildFlower(f.tieX, f.tieY, f.tipX, f.tipY, f.scale, f.colorSet, f.seed);
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
