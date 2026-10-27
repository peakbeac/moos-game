import * as THREE from "three";
import type { CollisionWorld } from "./collision";
import { boxGeo, plastic } from "./geom";
import { LIGHTS } from "./layout";
import { type Control, type Vehicle, type WorldQuery, stepCar } from "./vehicles";

const GREEN = 8.6;
const YELLOW = 2.3;
const CYCLE = (GREEN + YELLOW) * 2;

export type Phase = "nsG" | "nsY" | "ewG" | "ewY";

export interface Bulb {
  mesh: THREE.Mesh;
  color: "r" | "y" | "g";
  axis: "ns" | "ew";
}

export interface Signal {
  x: number;
  z: number;
  offset: number;
  half: number;
  bulbs: Bulb[];
}

const onMat = {
  r: new THREE.MeshLambertMaterial({ color: 0xff2d2d, emissive: new THREE.Color(0xff2d2d), emissiveIntensity: 1 }),
  y: new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: new THREE.Color(0xffd23a), emissiveIntensity: 1 }),
  g: new THREE.MeshLambertMaterial({ color: 0x3dff6a, emissive: new THREE.Color(0x3dff6a), emissiveIntensity: 1 }),
};
const offMat = {
  r: new THREE.MeshLambertMaterial({ color: 0x3a1414, emissive: new THREE.Color(0x000000), emissiveIntensity: 0 }),
  y: new THREE.MeshLambertMaterial({ color: 0x3a3414, emissive: new THREE.Color(0x000000), emissiveIntensity: 0 }),
  g: new THREE.MeshLambertMaterial({ color: 0x14301c, emissive: new THREE.Color(0x000000), emissiveIntensity: 0 }),
};

export function phaseAt(time: number, offset: number): Phase {
  const u = (((time + offset) % CYCLE) + CYCLE) % CYCLE;
  if (u < GREEN) return "nsG";
  if (u < GREEN + YELLOW) return "nsY";
  if (u < GREEN * 2 + YELLOW) return "ewG";
  return "ewY";
}

export function axisAllows(phase: Phase, axis: "ns" | "ew"): boolean {
  return axis === "ns" ? phase === "nsG" : phase === "ewG";
}

export function buildSignals(scene: THREE.Scene, collision: CollisionWorld): Signal[] {
  const housing = plastic(0x1a1a1a);
  const poleMat = plastic(0x2c3138);
  const signals: Signal[] = [];
  for (const spot of LIGHTS) {
    const bulbs: Bulb[] = [];
    const half = spot.w / 2;
    const approaches: { x: number; z: number; yaw: number; axis: "ns" | "ew" }[] = [
      { x: spot.x + 3.2, z: spot.z - half - 1.3, yaw: Math.PI, axis: "ns" },
      { x: spot.x - 3.2, z: spot.z + half + 1.3, yaw: 0, axis: "ns" },
      { x: spot.x - half - 1.3, z: spot.z - 3.2, yaw: -Math.PI / 2, axis: "ew" },
      { x: spot.x + half + 1.3, z: spot.z + 3.2, yaw: Math.PI / 2, axis: "ew" },
    ];
    for (const a of approaches) {
      const pole = new THREE.Mesh(boxGeo(0.22, 4.3, 0.22), poleMat);
      pole.position.set(a.x, 2.15, a.z);
      pole.castShadow = true;
      scene.add(pole);
      collision.add({
        id: `light-${spot.x}-${a.axis}-${a.x}`,
        x: a.x,
        z: a.z,
        hx: 0.28,
        hz: 0.28,
        rot: 0,
        minY: 0,
        maxY: 4.4,
      });
      const head = new THREE.Group();
      head.position.set(a.x, 4.55, a.z);
      head.rotation.y = a.yaw;
      const box = new THREE.Mesh(boxGeo(0.42, 0.95, 0.28), housing);
      head.add(box);
      const colors: ("r" | "y" | "g")[] = ["r", "y", "g"];
      colors.forEach((color, i) => {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), offMat[color]);
        mesh.position.set(0, 0.28 - i * 0.28, 0.12);
        head.add(mesh);
        bulbs.push({ mesh, color, axis: a.axis });
      });
      scene.add(head);
    }
    signals.push({ x: spot.x, z: spot.z, offset: spot.offset, half, bulbs });
  }
  return signals;
}

export function updateSignals(signals: Signal[], time: number) {
  for (const s of signals) {
    const phase = phaseAt(time, s.offset);
    for (const b of s.bulbs) {
      const yellow = (b.axis === "ns" && phase === "nsY") || (b.axis === "ew" && phase === "ewY");
      const green = axisAllows(phase, b.axis);
      let lit = false;
      if (b.color === "g") lit = green;
      else if (b.color === "y") lit = yellow;
      else lit = !green && !yellow;
      b.mesh.material = lit ? onMat[b.color] : offMat[b.color];
    }
  }
}

export function travelAxis(yaw: number): "ns" | "ew" {
  const fx = Math.abs(Math.sin(yaw));
  const fz = Math.abs(Math.cos(yaw));
  return fx > fz ? "ew" : "ns";
}

/** True when a driver should stop for this signal. */
export function mustStop(s: Signal, x: number, z: number, yaw: number, time: number): boolean {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const dx = s.x - x;
  const dz = s.z - z;
  const dist = Math.hypot(dx, dz);
  if (dist > s.half + 18 || dist < s.half * 0.45) return false;
  const dot = (dx / dist) * fx + (dz / dist) * fz;
  if (dot < 0.55) return false;
  const phase = phaseAt(time, s.offset);
  return !axisAllows(phase, travelAxis(yaw));
}

export function inIntersection(s: Signal, x: number, z: number): boolean {
  return Math.abs(x - s.x) < s.half && Math.abs(z - s.z) < s.half;
}

export interface TrafficSpawn {
  catalog: string;
  uid: string;
  x: number;
  z: number;
  yaw: number;
  mode: "road" | "track";
  pts?: { x: number; z: number }[];
  index?: number;
  dir?: number;
  trackId?: string;
  s?: number;
}

function line(x1: number, z1: number, x2: number, z2: number, step: number) {
  const pts: { x: number; z: number }[] = [];
  const len = Math.hypot(x2 - x1, z2 - z1);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x1 + (x2 - x1) * t, z: z1 + (z2 - z1) * t });
  }
  return pts;
}

export function trafficSpawns(): TrafficSpawn[] {
  const avenueNorth = line(146, -380, 146, 420, 28);
  const avenueSouth = line(154, 400, 154, -340, 28);
  const shoreEast = line(-380, -236, 400, -236, 32);
  const shoreWest = line(360, -244, -360, -244, 32);
  const loopA = [
    ...line(150, 150, 290, 150, 24),
    ...line(290, 170, 290, 270, 24),
    ...line(270, 270, 150, 270, 24),
    ...line(150, 250, 150, 170, 24),
  ];
  return [
    { catalog: "pico", uid: "ai-ave-n", x: 146, z: -340, yaw: 0, mode: "road", pts: avenueNorth, index: 0, dir: 1 },
    { catalog: "taxi", uid: "ai-ave-s", x: 154, z: 280, yaw: Math.PI, mode: "road", pts: avenueSouth, index: 0, dir: 1 },
    { catalog: "marina", uid: "ai-shore-e", x: -200, z: -236, yaw: Math.PI / 2, mode: "road", pts: shoreEast, index: 0, dir: 1 },
    { catalog: "dune", uid: "ai-shore-w", x: 180, z: -244, yaw: -Math.PI / 2, mode: "road", pts: shoreWest, index: 0, dir: 1 },
    { catalog: "aero", uid: "ai-loop", x: 200, z: 150, yaw: Math.PI / 2, mode: "road", pts: loopA, index: 0, dir: 1 },
    { catalog: "palm-gt", uid: "ai-palm", x: 330, z: -420, yaw: Math.PI / 2, mode: "track", trackId: "palm", s: 20 },
    { catalog: "mesa", uid: "ai-mesa", x: -180, z: -78, yaw: 0, mode: "track", trackId: "mesa", s: 30 },
    { catalog: "ridge", uid: "ai-ridge", x: -210, z: 250, yaw: 0, mode: "track", trackId: "ridge", s: 12 },
  ];
}

export function stepTraffic(
  vehicles: Vehicle[],
  dt: number,
  world: WorldQuery & { sampleTrack(id: string, s: number): { x: number; z: number; yaw: number } | null },
  signals: Signal[],
  time: number,
) {
  for (const v of vehicles) {
    if (!v.ai || v.occupied) continue;
    if (v.ai.mode === "track" && v.ai.trackId) {
      const speed = v.catalogId === "palm-gt" ? 26 : v.catalogId === "mesa" ? 30 : 22;
      v.ai.s = (v.ai.s ?? 0) + speed * dt;
      const p = world.sampleTrack(v.ai.trackId, v.ai.s);
      if (!p) continue;
      v.x = p.x;
      v.z = p.z;
      v.yaw = p.yaw;
      v.y = world.groundY(v.x, v.z, "land");
      v.speed = speed;
      v.travel += speed * dt;
      const tune = v.tune.kind === "car" ? v.tune : null;
      const wr = tune ? tune.wheelR : 0.34;
      for (const w of v.wheels) w.spin.rotation.x = -v.travel / wr;
      continue;
    }
    const pts = v.ai.pts;
    if (!pts?.length) continue;
    let index = v.ai.index ?? 0;
    const dir = v.ai.dir ?? 1;
    const wp = pts[index];
    const dx = wp.x - v.x;
    const dz = wp.z - v.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4.5) {
      index += dir;
      if (index >= pts.length) index = 0;
      if (index < 0) index = pts.length - 1;
      v.ai.index = index;
    }
    const desired = Math.atan2(dx, dz);
    const diff = Math.atan2(Math.sin(desired - v.yaw), Math.cos(desired - v.yaw));
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    let stop = false;
    for (const s of signals) {
      if (mustStop(s, v.x, v.z, v.yaw, time)) stop = true;
    }
    const target = v.ai.pts && Math.abs(v.x) < 30 ? 18 : 15;
    const control: Control = {
      throttleAxis: stop ? -1 : v.speed < target ? 1 : 0,
      steer,
      handbrake: false,
      boost: false,
      pitch: 0,
      climb: 0,
    };
    const result = stepCar(v, control, dt, world);
    if (result !== "ok") {
      v.speed = 0;
      v.x = wp.x;
      v.z = wp.z;
      v.y = 0;
    }
  }
}
