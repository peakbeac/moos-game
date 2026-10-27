export interface Collider {
  id: string;
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  minY: number;
  maxY: number;
}

export interface Push {
  x: number;
  z: number;
  hit: boolean;
  /** Push direction (out of the obstacle), world space. */
  nx: number;
  nz: number;
}

const CELL = 36;

export class CollisionWorld {
  private cells = new Map<string, Collider[]>();
  dynamic: Collider[] = [];

  add(c: Collider) {
    const minX = c.x - c.hx - c.hz;
    const maxX = c.x + c.hx + c.hz;
    const minZ = c.z - c.hx - c.hz;
    const maxZ = c.z + c.hx + c.hz;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = `${gx},${gz}`;
        let list = this.cells.get(key);
        if (!list) {
          list = [];
          this.cells.set(key, list);
        }
        list.push(c);
      }
    }
  }

  resolve(
    px: number,
    pz: number,
    radius: number,
    feetY: number,
    height: number,
    ignore: string | null,
  ): Push {
    const head = feetY + height;
    let x = px;
    let z = pz;
    let hit = false;
    let nx = 0;
    let nz = 0;
    let best = 0;
    const seen = new Set<Collider>();
    const gx0 = Math.floor((px - radius) / CELL);
    const gx1 = Math.floor((px + radius) / CELL);
    const gz0 = Math.floor((pz - radius) / CELL);
    const gz1 = Math.floor((pz + radius) / CELL);
    const buckets: Collider[][] = [];
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const list = this.cells.get(`${gx},${gz}`);
        if (list) buckets.push(list);
      }
    }
    buckets.push(this.dynamic);
    for (let iter = 0; iter < 2; iter++) {
      for (const list of buckets) {
        for (const b of list) {
          if (iter === 0 && seen.has(b)) continue;
          if (b.id === ignore) continue;
          if (b.maxY < feetY + 0.25 || b.minY > head) continue;
          const res = pushCircle(x, z, radius, b);
          if (!res) continue;
          seen.add(b);
          const dx = res.x - x;
          const dz = res.z - z;
          const mag = Math.hypot(dx, dz);
          x = res.x;
          z = res.z;
          hit = true;
          if (mag > best) {
            best = mag;
            nx = res.nx;
            nz = res.nz;
          }
        }
      }
    }
    return { x, z, hit, nx, nz };
  }
}

function pushCircle(
  px: number,
  pz: number,
  radius: number,
  b: Collider,
): { x: number; z: number; nx: number; nz: number } | null {
  const dx = px - b.x;
  const dz = pz - b.z;
  const cos = Math.cos(b.rot);
  const sin = Math.sin(b.rot);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const clx = clamp(lx, -b.hx, b.hx);
  const clz = clamp(lz, -b.hz, b.hz);
  let ox = lx - clx;
  let oz = lz - clz;
  const d2 = ox * ox + oz * oz;
  if (d2 > radius * radius) return null;

  let lnx: number;
  let lnz: number;
  let pen: number;
  if (d2 < 1e-8) {
    const dex = b.hx - Math.abs(lx);
    const dez = b.hz - Math.abs(lz);
    if (dex < dez) {
      lnx = Math.sign(lx || 1);
      lnz = 0;
      pen = dex + radius;
    } else {
      lnx = 0;
      lnz = Math.sign(lz || 1);
      pen = dez + radius;
    }
  } else {
    const d = Math.sqrt(d2);
    lnx = ox / d;
    lnz = oz / d;
    pen = radius - d;
  }
  const nx = lnx * cos + lnz * sin;
  const nz = -lnx * sin + lnz * cos;
  return { x: px + nx * pen, z: pz + nz * pen, nx, nz };
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function killedSpeed(speed: number, yaw: number, push: Push): number {
  if (!push.hit) return speed;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const into = fx * push.nx + fz * push.nz;
  if (speed > 0 && into < 0) return speed * Math.max(0, 1 + into);
  if (speed < 0 && into > 0) return speed * Math.max(0, 1 - into);
  return speed;
}
