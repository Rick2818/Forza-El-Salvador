// Validate the solved circuit: closure, bounds, and clearance between
// non-adjacent sections (guards against a self-intersecting centreline).
const SEG = [
  { straight: 456.6 },
  { turn: 90, radius: 62, dir: 1 },
  { straight: 45.8 },
  { turn: 48, radius: 55, dir: -1 },
  { turn: 48, radius: 55, dir: 1 },
  { straight: 140 },
  { turn: 90, radius: 48, dir: 1 },
  { straight: 200 },
  { turn: 65, radius: 75, dir: -1 },
  { turn: 65, radius: 75, dir: 1 },
  { straight: 110 },
  { turn: 90, radius: 85, dir: 1 },
  { straight: 160 },
  { turn: 40, radius: 60, dir: -1 },
  { turn: 40, radius: 60, dir: 1 },
  { straight: 90 },
  { turn: 90, radius: 52, dir: 1 }
];

let x = 0, z = 0, h = 0, L = 0;
const pts = [];
function push() {
  const last = pts[pts.length - 1];
  if (!last || Math.hypot(last[0] - x, last[1] - z) > 0.5) pts.push([x, z]);
}
push();
for (const s of SEG) {
  if (s.straight !== undefined) {
    const steps = Math.max(1, Math.ceil(s.straight / 2));
    for (let i = 0; i < steps; i++) {
      x += Math.cos(h) * (s.straight / steps);
      z += Math.sin(h) * (s.straight / steps);
      push();
    }
    L += s.straight;
  } else {
    const a = (s.turn * Math.PI) / 180;
    const d = s.dir ?? 1;
    const steps = Math.max(2, Math.ceil((Math.abs(a) * s.radius) / 2));
    const dA = a / steps;
    for (let i = 0; i < steps; i++) {
      h += dA * d;
      x += Math.cos(h) * s.radius * Math.abs(dA);
      z += Math.sin(h) * s.radius * Math.abs(dA);
      push();
    }
    L += Math.abs(a) * s.radius;
  }
}
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
for (const p of pts) {
  minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
  minZ = Math.min(minZ, p[1]); maxZ = Math.max(maxZ, p[1]);
}
console.log("closure", x.toFixed(2), z.toFixed(2), "length", L.toFixed(1));
console.log("bounds", minX.toFixed(0), maxX.toFixed(0), minZ.toFixed(0), maxZ.toFixed(0));

let minClear = Infinity;
let worst = null;
const separation = 90; // metres of arc length that count as "far apart"
for (let i = 0; i < pts.length; i += 2) {
  for (let j = i + 1; j < pts.length; j += 2) {
    const arc = Math.min(j - i, pts.length - (j - i));
    if (arc * 2 < separation) continue;
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
    if (d < minClear) {
      minClear = d;
      worst = [pts[i], pts[j]];
    }
  }
}
console.log("min clearance between distant sections", minClear.toFixed(1), "m", worst);
