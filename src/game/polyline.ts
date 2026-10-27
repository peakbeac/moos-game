export interface Pt {
  x: number;
  z: number;
}

export interface Polyline {
  pts: Pt[];
  cum: number[];
  total: number;
  closed: boolean;
}

export interface Sample {
  x: number;
  z: number;
  yaw: number;
  /** Left of travel direction. */
  lx: number;
  lz: number;
  tx: number;
  tz: number;
}

export function buildPolyline(raw: Pt[], spacing: number, closed: boolean): Polyline {
  const ring = closed ? [...raw, raw[0]] : raw.slice();
  const pts: Pt[] = [];
  if (ring.length === 0) return { pts, cum: [], total: 0, closed };
  pts.push({ ...ring[0] });
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-4) continue;
    const steps = Math.max(1, Math.round(len / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      pts.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  if (!closed && pts.length) {
    const last = ring[ring.length - 1];
    const end = pts[pts.length - 1];
    if (Math.hypot(end.x - last.x, end.z - last.z) > 0.05) pts.push({ ...last });
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  return { pts, cum, total: cum[cum.length - 1] ?? 0, closed };
}

export function sample(poly: Polyline, s: number): Sample {
  const total = poly.total || 1;
  let d = s;
  if (poly.closed) {
    d = ((s % total) + total) % total;
  } else {
    d = Math.max(0, Math.min(total, s));
  }
  let i = 1;
  while (i < poly.cum.length - 1 && poly.cum[i] < d) i++;
  const a = poly.pts[i - 1];
  const b = poly.pts[i] ?? poly.pts[i - 1];
  const seg = (poly.cum[i] ?? 0) - (poly.cum[i - 1] ?? 0);
  const t = seg > 1e-5 ? (d - poly.cum[i - 1]) / seg : 0;
  const x = a.x + (b.x - a.x) * t;
  const z = a.z + (b.z - a.z) * t;
  let tx = b.x - a.x;
  let tz = b.z - a.z;
  const mag = Math.hypot(tx, tz) || 1;
  tx /= mag;
  tz /= mag;
  return {
    x,
    z,
    tx,
    tz,
    yaw: Math.atan2(tx, tz),
    lx: -tz,
    lz: tx,
  };
}

export function closestS(poly: Polyline, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  const step = Math.max(4, poly.total / 400);
  for (let s = 0; s <= poly.total; s += step) {
    const p = sample(poly, s);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

export function circDist(a: number, b: number, total: number): number {
  const d = Math.abs(a - b) % total;
  return Math.min(d, total - d);
}

export function offsetPolyline(poly: Polyline, dist: number, spacing: number): Polyline {
  const raw: Pt[] = [];
  const n = poly.closed ? poly.pts.length - 1 : poly.pts.length;
  for (let i = 0; i < n; i++) {
    const p = sample(poly, poly.cum[i] ?? 0);
    raw.push({ x: p.x + p.lx * dist, z: p.z + p.lz * dist });
  }
  return buildPolyline(raw, spacing, poly.closed);
}

export function distToPolyline(poly: Polyline, x: number, z: number): number {
  const s = closestS(poly, x, z);
  const p = sample(poly, s);
  return Math.hypot(p.x - x, p.z - z);
}
