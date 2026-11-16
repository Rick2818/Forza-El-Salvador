// Solve two straight lengths so the straights+arcs centreline closes exactly.
const BASE = [
  { straight: 300 },
  { turn: 90, radius: 62, dir: 1 },
  { straight: 120 },
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

const VAR_A = 0; // main straight
const VAR_B = 2; // first 90-degree leg

function trace(segs) {
  let x = 0, z = 0, h = 0, L = 0;
  for (const s of segs) {
    if (s.straight !== undefined) {
      x += Math.cos(h) * s.straight;
      z += Math.sin(h) * s.straight;
      L += s.straight;
    } else {
      const a = (s.turn * Math.PI) / 180;
      const d = s.dir ?? 1;
      const steps = Math.max(2, Math.ceil((Math.abs(a) * s.radius) / 3));
      const dA = a / steps;
      for (let i = 0; i < steps; i++) {
        h += dA * d;
        x += Math.cos(h) * s.radius * Math.abs(dA);
        z += Math.sin(h) * s.radius * Math.abs(dA);
      }
      L += Math.abs(a) * s.radius;
    }
  }
  return { x, z, h, L };
}

let a = BASE[VAR_A].straight;
let b = BASE[VAR_B].straight;

for (let iter = 0; iter < 40; iter++) {
  const segs = BASE.map((s, i) =>
    i === VAR_A ? { straight: a } : i === VAR_B ? { straight: b } : s
  );
  const r = trace(segs);
  const err = Math.hypot(r.x, r.z);
  if (iter % 5 === 0) {
    console.log(`iter ${iter} a=${a.toFixed(2)} b=${b.toFixed(2)} err=${err.toFixed(4)} len=${r.L.toFixed(1)}`);
  }
  if (err < 0.01) break;
  const h = 0.5;
  const r1 = trace(segs.map((s, i) => (i === VAR_A ? { straight: a + h } : s)));
  const r2 = trace(segs.map((s, i) => (i === VAR_B ? { straight: b + h } : s)));
  const j11 = (r1.x - r.x) / h, j21 = (r1.z - r.z) / h;
  const j12 = (r2.x - r.x) / h, j22 = (r2.z - r.z) / h;
  const det = j11 * j22 - j12 * j21;
  const da = (-r.x * j22 + r.z * j12) / det;
  const db = (-r.z * j11 + r.x * j21) / det;
  a += Math.max(-40, Math.min(40, da));
  b += Math.max(-40, Math.min(40, db));
  if (a < 60 || b < 40) {
    console.log("straight hit lower bound, stopping");
    break;
  }
}

const final = BASE.map((s, i) => (i === VAR_A ? { straight: +a.toFixed(2) } : i === VAR_B ? { straight: +b.toFixed(2) } : s));
const res = trace(final);
console.log("FINAL", JSON.stringify(final));
console.log("end", res.x.toFixed(3), res.z.toFixed(3), "heading", ((res.h * 180) / Math.PI).toFixed(3), "length", res.L.toFixed(1));

