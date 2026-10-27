import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { killedSpeed, type Push } from "./collision";
import { boxGeo, cylGeo, labelSprite, plastic } from "./geom";

export interface Control {
  throttleAxis: number;
  steer: number;
  handbrake: boolean;
  boost: boolean;
  pitch: number;
  climb: number;
}

export interface WorldQuery {
  groundY(x: number, z: number, mode: "land" | "air"): number;
  collide(
    x: number,
    z: number,
    radius: number,
    feetY: number,
    height: number,
    ignore: string | null,
  ): Push;
  paved(x: number, z: number): boolean;
  waterDepth(x: number, z: number): number;
}

export interface CarTune {
  kind: "car";
  maxSpeed: number;
  accel: number;
  brake: number;
  handling: number;
  offroad: number;
  wheelBase: number;
  wheelR: number;
  electric?: boolean;
}

export interface PlaneTune {
  kind: "plane";
  maxSpeed: number;
  thrust: number;
  stall: number;
  lift: number;
  agility: number;
  gear: number;
}

export interface HeliTune {
  kind: "heli";
  climb: number;
  accel: number;
  maxSpeed: number;
  tilt: number;
  agility: number;
  gear: number;
}

export type Tune = CarTune | PlaneTune | HeliTune;

export interface WheelRig {
  pivot: THREE.Group;
  spin: THREE.Group;
  front: boolean;
}

export interface Vehicle {
  uid: string;
  catalogId: string;
  name: string;
  blurb: string;
  kind: Tune["kind"];
  tune: Tune;
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  vy: number;
  throttle: number;
  steerVis: number;
  travel: number;
  occupied: boolean;
  enterRadius: number;
  half: { w: number; l: number; h: number };
  home: { x: number; y: number; z: number; yaw: number };
  wheels: WheelRig[];
  prop?: THREE.Object3D;
  rotor?: THREE.Object3D;
  tailRotor?: THREE.Object3D;
  rotorBlur?: THREE.Mesh;
  brakeMats: THREE.MeshLambertMaterial[];
  headMats: THREE.MeshLambertMaterial[];
  label: THREE.Sprite;
  boost: number;
  boostMax: number;
  ai: null | {
    mode: "road" | "track";
    pts?: { x: number; z: number }[];
    index?: number;
    dir?: number;
    trackId?: string;
    s?: number;
  };
}

interface CarDef {
  id: string;
  name: string;
  blurb: string;
  paint: number;
  roof: number;
  accent: number;
  trim: number;
  glass: number;
  length: number;
  width: number;
  wheelR: number;
  wheelX: number;
  axleZ: number;
  cabin: { w: number; h: number; len: number; y: number; z: number };
  roofPitch: number;
  grille: "shield" | "slats" | "sport" | "none";
  convertible?: boolean;
  bed?: boolean;
  wing?: boolean;
  stripe?: number;
  taxi?: boolean;
  number?: string;
  electric?: boolean;
  tune: Omit<CarTune, "kind" | "wheelBase" | "wheelR">;
}

const CARS: CarDef[] = [
  {
    id: "lumen-ix",
    name: "Lumen iX",
    blurb: "Electric coupe-SUV in the spirit of a BMW iX — shield face, black roof, copper trace.",
    paint: 0x143e86,
    roof: 0x121212,
    accent: 0xc47a4a,
    trim: 0x161616,
    glass: 0x9fd0ea,
    length: 4.95,
    width: 2.02,
    wheelR: 0.36,
    wheelX: 0.84,
    axleZ: 1.5,
    cabin: { w: 0.88, h: 0.62, len: 0.52, y: 1.18, z: -0.22 },
    roofPitch: -0.06,
    grille: "shield",
    electric: true,
    tune: { maxSpeed: 52, accel: 9.4, brake: 16, handling: 0.94, offroad: 0.62, electric: true },
  },
  {
    id: "marina",
    name: "Marina Convertible",
    blurb: "Open-top beach cruiser. Happier on sand than the sports cars.",
    paint: 0xf3eee4,
    roof: 0xf3eee4,
    accent: 0xd4534a,
    trim: 0x2a2a2a,
    glass: 0xb7e2f2,
    length: 4.45,
    width: 1.84,
    wheelR: 0.33,
    wheelX: 0.78,
    axleZ: 1.28,
    cabin: { w: 0.8, h: 0.28, len: 0.34, y: 0.92, z: -0.05 },
    roofPitch: 0,
    grille: "slats",
    convertible: true,
    tune: { maxSpeed: 44, accel: 7.4, brake: 13, handling: 1.02, offroad: 0.74 },
  },
  {
    id: "pico",
    name: "Pico Hatch",
    blurb: "Short, eager, and easy to park on Ocean Avenue.",
    paint: 0xe23b48,
    roof: 0x2a2a2a,
    accent: 0xf2f2f2,
    trim: 0x222222,
    glass: 0x9fd0ea,
    length: 3.7,
    width: 1.68,
    wheelR: 0.3,
    wheelX: 0.7,
    axleZ: 1.12,
    cabin: { w: 0.9, h: 0.52, len: 0.48, y: 1.05, z: -0.05 },
    roofPitch: -0.08,
    grille: "slats",
    tune: { maxSpeed: 36, accel: 7.2, brake: 14, handling: 1.14, offroad: 0.6 },
  },
  {
    id: "dune",
    name: "Dune Pickup",
    blurb: "High clearance for the mesa and the mountain shoulders.",
    paint: 0xd4783a,
    roof: 0x2c241c,
    accent: 0x1d1d1d,
    trim: 0x1a1a1a,
    glass: 0x9fd0ea,
    length: 5.25,
    width: 2.0,
    wheelR: 0.42,
    wheelX: 0.84,
    axleZ: 1.62,
    cabin: { w: 0.86, h: 0.62, len: 0.34, y: 1.28, z: 0.35 },
    roofPitch: 0,
    grille: "slats",
    bed: true,
    tune: { maxSpeed: 40, accel: 6.4, brake: 12, handling: 0.78, offroad: 0.94 },
  },
  {
    id: "taxi",
    name: "Metro Taxi",
    blurb: "Checker stripe, roof lamp, and a driver who has seen every red light twice.",
    paint: 0xf0d34a,
    roof: 0xf0d34a,
    accent: 0x1a1a1a,
    trim: 0x222222,
    glass: 0x9fd0ea,
    length: 4.55,
    width: 1.82,
    wheelR: 0.33,
    wheelX: 0.76,
    axleZ: 1.35,
    cabin: { w: 0.88, h: 0.5, len: 0.46, y: 1.08, z: -0.08 },
    roofPitch: -0.04,
    grille: "slats",
    taxi: true,
    tune: { maxSpeed: 42, accel: 6.6, brake: 13, handling: 0.88, offroad: 0.55 },
  },
  {
    id: "aero",
    name: "Aero GT",
    blurb: "Low, pale, and loud. Leave it on pavement.",
    paint: 0xf4f4f4,
    roof: 0x1a1a1a,
    accent: 0xc81e1e,
    trim: 0x111111,
    glass: 0x8ec4dc,
    length: 4.5,
    width: 1.96,
    wheelR: 0.32,
    wheelX: 0.82,
    axleZ: 1.32,
    cabin: { w: 0.82, h: 0.36, len: 0.4, y: 0.86, z: -0.12 },
    roofPitch: -0.16,
    grille: "sport",
    stripe: 0xc81e1e,
    tune: { maxSpeed: 64, accel: 10.2, brake: 18, handling: 1.16, offroad: 0.42 },
  },
  {
    id: "palm-gt",
    name: "Palm GT",
    blurb: "Circuit car for the beach rectangle. Big wing, small patience for sand.",
    paint: 0xe10600,
    roof: 0x1a1a1a,
    accent: 0xf2f2f2,
    trim: 0x111111,
    glass: 0x222a33,
    length: 4.7,
    width: 2.02,
    wheelR: 0.32,
    wheelX: 0.86,
    axleZ: 1.38,
    cabin: { w: 0.7, h: 0.32, len: 0.34, y: 0.78, z: -0.05 },
    roofPitch: 0,
    grille: "sport",
    wing: true,
    number: "1",
    tune: { maxSpeed: 72, accel: 11, brake: 20, handling: 1.28, offroad: 0.38 },
  },
  {
    id: "mesa",
    name: "Mesa Stock",
    blurb: "Oval stock car. Number 27. Keep it pointed and it will sing.",
    paint: 0x1c1c1c,
    roof: 0xf2c14e,
    accent: 0xf2c14e,
    trim: 0x111111,
    glass: 0x243040,
    length: 5.05,
    width: 1.92,
    wheelR: 0.34,
    wheelX: 0.8,
    axleZ: 1.4,
    cabin: { w: 0.78, h: 0.38, len: 0.36, y: 0.9, z: -0.1 },
    roofPitch: -0.1,
    grille: "sport",
    stripe: 0xf2c14e,
    number: "27",
    tune: { maxSpeed: 66, accel: 8.6, brake: 16, handling: 0.98, offroad: 0.48 },
  },
  {
    id: "ridge",
    name: "Ridge Rally",
    blurb: "Raised, green, and happy when the asphalt runs out.",
    paint: 0x2f7d46,
    roof: 0xf4f4f4,
    accent: 0xf2c14e,
    trim: 0x1c1c1c,
    glass: 0x9fd0ea,
    length: 4.15,
    width: 1.82,
    wheelR: 0.36,
    wheelX: 0.76,
    axleZ: 1.22,
    cabin: { w: 0.86, h: 0.5, len: 0.42, y: 1.12, z: -0.02 },
    roofPitch: -0.06,
    grille: "slats",
    number: "5",
    tune: { maxSpeed: 50, accel: 8.1, brake: 14, handling: 1.08, offroad: 0.96 },
  },
];

interface AirDef {
  id: string;
  name: string;
  blurb: string;
  kind: "plane" | "heli";
  tune: PlaneTune | HeliTune;
}

const AIR: AirDef[] = [
  {
    id: "gull",
    name: "Gull Trainer",
    blurb: "Friendly prop plane. Lined up on runway 09. Rotate around 55 mph.",
    kind: "plane",
    tune: { kind: "plane", maxSpeed: 62, thrust: 16, stall: 24, lift: 0.012, agility: 0.9, gear: 1.35 },
  },
  {
    id: "sable",
    name: "Sable Jet",
    blurb: "Private jet. Faster, thirstier, and it stalls if you pull up early.",
    kind: "plane",
    tune: { kind: "plane", maxSpeed: 102, thrust: 24, stall: 36, lift: 0.0075, agility: 1.15, gear: 1.55 },
  },
  {
    id: "liner",
    name: "Coastliner",
    blurb: "Regional airliner. Heavy, stable, and it wants the whole runway.",
    kind: "plane",
    tune: { kind: "plane", maxSpeed: 84, thrust: 13, stall: 40, lift: 0.0065, agility: 0.62, gear: 2.15 },
  },
  {
    id: "skylark",
    name: "Skylark",
    blurb: "Light helicopter on the beach pad. Space climbs, C descends, W leans you forward.",
    kind: "heli",
    tune: { kind: "heli", climb: 14, accel: 18, maxSpeed: 38, tilt: 0.46, agility: 1.2, gear: 0.55 },
  },
  {
    id: "widehaul",
    name: "Widehaul",
    blurb: "Twin-rotor-free transport. Slower, steadier, parked on County General's roof.",
    kind: "heli",
    tune: { kind: "heli", climb: 8, accel: 10, maxSpeed: 32, tilt: 0.3, agility: 0.7, gear: 0.7 },
  },
  {
    id: "skycam",
    name: "SkyCam",
    blurb: "News helicopter. Quick to tip, quick to cross the county. Lives by the lodge.",
    kind: "heli",
    tune: { kind: "heli", climb: 12, accel: 22, maxSpeed: 46, tilt: 0.55, agility: 1.45, gear: 0.5 },
  },
];

const CATALOG = new Map<string, CarDef | AirDef>();
for (const c of CARS) CATALOG.set(c.id, c);
for (const a of AIR) CATALOG.set(a.id, a);

export function catalogBlurb(id: string): string {
  const base = id.replace(/-show$/, "");
  return CATALOG.get(base)?.blurb ?? "";
}

export function spawnVehicle(
  catalogId: string,
  uid: string,
  pose: { x: number; y?: number; z: number; yaw: number },
): Vehicle {
  const baseId = catalogId.replace(/-show$/, "");
  const def = CATALOG.get(baseId);
  if (!def) throw new Error(`Unknown vehicle ${catalogId}`);
  if ("length" in def) return finishCar(def, uid, pose);
  if (def.kind === "plane") return finishPlane(def, uid, pose);
  return finishHeli(def, uid, pose);
}

function finishCar(def: CarDef, uid: string, pose: { x: number; y?: number; z: number; yaw: number }): Vehicle {
  const built = buildCar(def);
  const tune: CarTune = {
    kind: "car",
    ...def.tune,
    wheelBase: def.axleZ * 2,
    wheelR: def.wheelR,
  };
  const y = pose.y ?? 0;
  const v = makeVehicle({
    uid,
    catalogId: def.id,
    name: def.name,
    blurb: def.blurb,
    kind: "car",
    tune,
    group: built.group,
    x: pose.x,
    y,
    z: pose.z,
    yaw: pose.yaw,
    half: { w: def.width / 2, l: def.length / 2, h: 1.7 },
    wheels: built.wheels,
    brakeMats: built.brakeMats,
    headMats: built.headMats,
    enterRadius: Math.max(6.2, def.length * 0.9),
    boostMax: def.electric ? 2.1 : 1.5,
    labelY: 2.8,
  });
  place(v);
  return v;
}

function finishPlane(def: AirDef, uid: string, pose: { x: number; y?: number; z: number; yaw: number }): Vehicle {
  const built = buildPlane(def.id);
  const tune = def.tune as PlaneTune;
  const v = makeVehicle({
    uid,
    catalogId: def.id,
    name: def.name,
    blurb: def.blurb,
    kind: "plane",
    tune,
    group: built.group,
    x: pose.x,
    y: pose.y ?? tune.gear,
    z: pose.z,
    yaw: pose.yaw,
    half: built.half,
    wheels: built.wheels,
    prop: built.prop,
    brakeMats: [],
    headMats: built.headMats,
    enterRadius: 8,
    boostMax: 1,
    labelY: built.half.h + 1.6,
  });
  place(v);
  return v;
}

function finishHeli(def: AirDef, uid: string, pose: { x: number; y?: number; z: number; yaw: number }): Vehicle {
  const built = buildHeli(def.id);
  const tune = def.tune as HeliTune;
  const v = makeVehicle({
    uid,
    catalogId: def.id,
    name: def.name,
    blurb: def.blurb,
    kind: "heli",
    tune,
    group: built.group,
    x: pose.x,
    y: pose.y ?? tune.gear,
    z: pose.z,
    yaw: pose.yaw,
    half: built.half,
    wheels: [],
    rotor: built.rotor,
    tailRotor: built.tailRotor,
    rotorBlur: built.blur,
    brakeMats: [],
    headMats: [],
    enterRadius: 7,
    boostMax: 1,
    labelY: built.half.h + 1.4,
  });
  place(v);
  return v;
}

function makeVehicle(p: {
  uid: string;
  catalogId: string;
  name: string;
  blurb: string;
  kind: Tune["kind"];
  tune: Tune;
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  yaw: number;
  half: { w: number; l: number; h: number };
  wheels: WheelRig[];
  brakeMats?: THREE.MeshLambertMaterial[];
  headMats?: THREE.MeshLambertMaterial[];
  prop?: THREE.Object3D;
  rotor?: THREE.Object3D;
  tailRotor?: THREE.Object3D;
  rotorBlur?: THREE.Mesh;
  enterRadius: number;
  boostMax: number;
  labelY: number;
}): Vehicle {
  const sub =
    p.kind === "car" ? "F to drive" : p.kind === "plane" ? "F to fly" : "F to lift off";
  const label = labelSprite(p.name, sub, p.catalogId === "lumen-ix" ? "#7eb6ff" : "#ffb703");
  label.position.y = p.labelY;
  p.group.add(label);
  return {
    uid: p.uid,
    catalogId: p.catalogId,
    name: p.name,
    blurb: p.blurb,
    kind: p.kind,
    tune: p.tune,
    group: p.group,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: 0,
    roll: 0,
    speed: 0,
    vy: 0,
    throttle: 0,
    steerVis: 0,
    travel: 0,
    occupied: false,
    enterRadius: p.enterRadius,
    half: p.half,
    home: { x: p.x, y: p.y, z: p.z, yaw: p.yaw },
    wheels: p.wheels,
    prop: p.prop,
    rotor: p.rotor,
    tailRotor: p.tailRotor,
    rotorBlur: p.rotorBlur,
    brakeMats: p.brakeMats ?? [],
    headMats: p.headMats ?? [],
    label,
    boost: p.boostMax,
    boostMax: p.boostMax,
    ai: null,
  };
}

export function place(v: Vehicle) {
  v.group.position.set(v.x, v.y, v.z);
  v.group.rotation.order = "YXZ";
  v.group.rotation.y = v.yaw;
  v.group.rotation.x = -v.pitch;
  v.group.rotation.z = v.roll;
}

export function resetVehicle(v: Vehicle) {
  v.x = v.home.x;
  v.y = v.home.y;
  v.z = v.home.z;
  v.yaw = v.home.yaw;
  v.pitch = 0;
  v.roll = 0;
  v.speed = 0;
  v.vy = 0;
  v.throttle = 0;
  place(v);
}

function localMerge(group: THREE.Group) {
  const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
  return {
    add(w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rotX = 0, rotY = 0, rotZ = 0) {
      const g = boxGeo(w, h, d).clone();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, "YXZ"));
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
      let list = bins.get(mat);
      if (!list) {
        list = [];
        bins.set(mat, list);
      }
      list.push(g);
    },
    addGeo(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rotX = 0, rotY = 0, rotZ = 0) {
      const g = geo.clone();
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, "YXZ"));
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
      let list = bins.get(mat);
      if (!list) {
        list = [];
        bins.set(mat, list);
      }
      list.push(g);
    },
    finish(cast = true) {
      for (const [mat, geos] of bins) {
        const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    },
  };
}

function buildCar(def: CarDef): { group: THREE.Group; wheels: WheelRig[]; brakeMats: THREE.MeshLambertMaterial[]; headMats: THREE.MeshLambertMaterial[] } {
  const group = new THREE.Group();
  const M = localMerge(group);
  const paint = plastic(def.paint);
  const roof = plastic(def.roof);
  const accent = plastic(def.accent);
  const trim = plastic(def.trim);
  const glassMat = new THREE.MeshLambertMaterial({
    color: def.glass,
    transparent: true,
    opacity: 0.45,
  });
  const L = def.length;
  const W = def.width;
  const cab = def.cabin;

  M.add(W * 0.98, 0.32, L * 0.94, 0, def.wheelR * 0.55, 0, trim);
  M.add(W * 0.92, 0.4, L * 0.88, 0, def.wheelR * 0.55 + 0.34, 0.02, paint);
  // Arches
  for (const s of [-1, 1]) {
    for (const z of [-def.axleZ, def.axleZ]) {
      M.add(0.16, def.wheelR * 1.15, def.wheelR * 1.7, s * (def.wheelX + 0.08), def.wheelR * 0.95, z, trim);
    }
  }

  if (!def.convertible) {
    M.add(W * cab.w, cab.h, L * cab.len, 0, cab.y, cab.z * L * 0.34, paint);
    const roofLen = L * cab.len * 0.92;
    M.add(W * cab.w * 0.94, 0.08, roofLen, 0, cab.y + cab.h / 2 + 0.02, cab.z * L * 0.34 - 0.05, roof, def.roofPitch);
  }

  if (def.bed) {
    M.add(W * 0.9, 0.28, L * 0.34, 0, def.wheelR + 0.45, -L * 0.28, paint);
    M.add(W * 0.92, 0.36, 0.08, 0, def.wheelR + 0.7, -L * 0.44, trim);
  }

  // Hood
  M.add(W * 0.78, 0.1, L * 0.28, 0, def.wheelR + 0.62, L * 0.26, paint, 0.06);

  // Copper or accent belt on the iX, stripe on others
  if (def.grille === "shield") {
    M.add(0.06, 0.05, L * 0.62, W * 0.46, def.wheelR + 0.58, 0.1, accent);
    M.add(0.06, 0.05, L * 0.62, -W * 0.46, def.wheelR + 0.58, 0.1, accent);
  }
  if (def.stripe !== undefined) {
    const stripe = plastic(def.stripe);
    M.add(0.12, 0.1, L * 0.72, 0, def.wheelR + 0.72, 0, stripe);
  }

  // Grille
  const gz = L * 0.5 - 0.02;
  if (def.grille === "shield") {
    const chrome = plastic(0xd5d8dc);
    M.add(0.86, 0.62, 0.08, 0, def.wheelR + 0.28, gz, chrome);
    M.add(0.7, 0.48, 0.09, 0, def.wheelR + 0.28, gz + 0.02, trim);
    M.add(0.06, 0.42, 0.1, 0, def.wheelR + 0.28, gz + 0.04, accent);
  } else if (def.grille === "sport") {
    M.add(W * 0.55, 0.16, 0.08, 0, def.wheelR + 0.22, gz, trim);
  } else if (def.grille === "slats") {
    M.add(W * 0.46, 0.22, 0.08, 0, def.wheelR + 0.32, gz, trim);
    M.add(W * 0.4, 0.03, 0.09, 0, def.wheelR + 0.38, gz + 0.02, accent);
    M.add(W * 0.4, 0.03, 0.09, 0, def.wheelR + 0.28, gz + 0.02, accent);
  }

  if (def.wing) {
    M.add(0.08, 0.28, 0.28, -0.55, def.wheelR + 0.85, -L * 0.42, trim);
    M.add(0.08, 0.28, 0.28, 0.55, def.wheelR + 0.85, -L * 0.42, trim);
    M.add(W * 0.95, 0.06, 0.42, 0, def.wheelR + 1.05, -L * 0.42, trim);
  }

  M.finish(true);

  // Glass
  if (def.convertible) {
    const wind = new THREE.Mesh(boxGeo(W * 0.78, 0.36, 0.06), glassMat);
    wind.position.set(0, def.wheelR + 0.85, L * 0.12);
    wind.rotation.x = -0.55;
    group.add(wind);
  } else {
    const g = new THREE.Mesh(boxGeo(W * cab.w * 0.88, cab.h * 0.72, L * cab.len * 0.82), glassMat);
    g.position.set(0, cab.y + 0.04, cab.z * L * 0.34);
    group.add(g);
  }

  const headMats: THREE.MeshLambertMaterial[] = [];
  const brakeMats: THREE.MeshLambertMaterial[] = [];
  const headMatL = new THREE.MeshLambertMaterial({ color: 0xfff6e4, emissive: new THREE.Color(0xfff1cc), emissiveIntensity: 0.35 });
  const headMatR = headMatL.clone();
  headMats.push(headMatL, headMatR);
  for (const [mat, side] of [[headMatL, -1], [headMatR, 1]] as const) {
    const m = new THREE.Mesh(boxGeo(def.grille === "shield" ? 0.42 : 0.28, 0.08, 0.06), mat);
    m.position.set(side * (def.grille === "shield" ? 0.62 : W * 0.32), def.wheelR + (def.grille === "shield" ? 0.62 : 0.48), gz + 0.04);
    group.add(m);
  }
  const brake = new THREE.MeshLambertMaterial({ color: 0xff2a2a, emissive: new THREE.Color(0xff1a1a), emissiveIntensity: 0.15 });
  brakeMats.push(brake);
  const tail = new THREE.Mesh(boxGeo(W * 0.78, 0.08, 0.06), brake);
  tail.position.set(0, def.wheelR + 0.55, -L * 0.5);
  group.add(tail);

  if (def.taxi) {
    const sign = new THREE.Mesh(
      boxGeo(0.7, 0.16, 0.28),
      new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: new THREE.Color(0xf2c14e), emissiveIntensity: 0.7 }),
    );
    sign.position.set(0, cab.y + cab.h / 2 + 0.28, cab.z);
    group.add(sign);
    const checkers = plastic(0x1a1a1a);
    for (let i = 0; i < 6; i++) {
      const bit = new THREE.Mesh(boxGeo(0.22, 0.12, L * 0.1), i % 2 ? checkers : plastic(0xf7f7f7));
      bit.position.set(W * 0.47, def.wheelR + 0.45, -L * 0.28 + i * L * 0.1);
      group.add(bit);
    }
  }

  if (def.number) {
    const tex = document.createElement("canvas");
    tex.width = 128;
    tex.height = 128;
    const g = tex.getContext("2d")!;
    g.fillStyle = "#f4f4f4";
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#161616";
    g.font = "800 72px Nunito, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(def.number, 64, 70);
    const map = new THREE.CanvasTexture(tex);
    map.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshLambertMaterial({ map }),
    );
    badge.position.set(-W * 0.47 - 0.01, def.wheelR + 0.55, 0.2);
    badge.rotation.y = -Math.PI / 2;
    group.add(badge);
  }

  const wheels: WheelRig[] = [];
  const tireGeo = cylGeo(def.wheelR, def.wheelR, 0.24, 14).clone();
  tireGeo.rotateZ(Math.PI / 2);
  const hubGeo = cylGeo(def.wheelR * 0.52, def.wheelR * 0.52, 0.26, 10).clone();
  hubGeo.rotateZ(Math.PI / 2);
  const tireMat = plastic(0x1a1a1a);
  const hubMat = plastic(0xd0d4da);
  for (const side of [-1, 1]) {
    for (const [z, front] of [[def.axleZ, true], [-def.axleZ, false]] as const) {
      const pivot = new THREE.Group();
      pivot.position.set(side * def.wheelX, def.wheelR, z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, hubMat);
      spin.add(tire, hub);
      pivot.add(spin);
      group.add(pivot);
      wheels.push({ pivot, spin, front });
    }
  }

  return { group, wheels, brakeMats, headMats };
}

function buildPlane(id: string): { group: THREE.Group; wheels: WheelRig[]; prop?: THREE.Object3D; headMats: THREE.MeshLambertMaterial[]; half: { w: number; l: number; h: number } } {
  const group = new THREE.Group();
  const M = localMerge(group);
  const wheels: WheelRig[] = [];
  let prop: THREE.Object3D | undefined;
  const headMats: THREE.MeshLambertMaterial[] = [];

  if (id === "gull") {
    const body = plastic(0xf2f4f2);
    const wing = plastic(0xf2c14e);
    const dark = plastic(0x243044);
    M.add(1.05, 1.15, 7.2, 0, 1.15, 0.2, body);
    M.add(0.7, 0.55, 1.5, 0, 1.55, 1.5, plastic(0x87c7e0));
    M.add(11.2, 0.12, 1.45, 0, 1.7, 0.3, wing);
    M.add(3.1, 0.08, 0.7, 0, 1.55, -3.15, wing);
    M.add(0.1, 1.3, 0.85, 0, 2.05, -3.2, body);
    M.add(0.55, 0.5, 0.7, 0, 1.05, 3.55, dark);
    M.finish(true);
    prop = new THREE.Group();
    prop.position.set(0, 1.15, 3.95);
    const bladeMat = plastic(0x2a2a2a);
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(boxGeo(0.14, 1.55, 0.06), bladeMat);
      blade.position.y = 0.55;
      blade.rotation.z = i * Math.PI;
      const wrap = new THREE.Group();
      wrap.rotation.z = i * Math.PI;
      wrap.add(blade);
      prop.add(wrap);
    }
    // simpler 2-blade
    prop.clear();
    const b1 = new THREE.Mesh(boxGeo(0.16, 1.7, 0.05), bladeMat);
    const b2 = new THREE.Mesh(boxGeo(1.7, 0.16, 0.05), bladeMat);
    prop.add(b1, b2);
    group.add(prop);
    addGear(group, wheels, 1.15, 0.28, 1.3, 0.9);
    const hm = lampMat();
    headMats.push(hm);
    const nose = new THREE.Mesh(boxGeo(0.2, 0.12, 0.08), hm);
    nose.position.set(0, 1.15, 3.7);
    group.add(nose);
    return { group, wheels, prop, headMats, half: { w: 5.6, l: 3.8, h: 2.4 } };
  }

  if (id === "sable") {
    const body = plastic(0xf7f7f5);
    const dark = plastic(0x1c2430);
    const accent = plastic(0x1f4e89);
    M.add(1.35, 1.35, 11.5, 0, 1.45, 0, body);
    M.add(0.9, 0.55, 2.4, 0, 1.85, 1.4, plastic(0x8ecae6));
    M.add(4.6, 0.1, 1.8, -2.2, 1.35, -0.2, dark, 0, 0.45, 0);
    M.add(4.6, 0.1, 1.8, 2.2, 1.35, -0.2, dark, 0, -0.45, 0);
    M.add(3.4, 0.08, 0.85, 0, 1.7, -5.2, dark);
    M.add(0.12, 1.8, 1.1, 0, 2.4, -5.1, body);
    M.add(0.7, 0.7, 1.4, -0.55, 1.55, -4.3, accent);
    M.add(0.7, 0.7, 1.4, 0.55, 1.55, -4.3, accent);
    M.finish(true);
    addGear(group, wheels, 1.15, 0.3, 2.4, 1.5);
    const hm = lampMat();
    headMats.push(hm);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(boxGeo(0.28, 0.1, 0.08), hm);
      m.position.set(s * 0.4, 1.45, 5.7);
      group.add(m);
    }
    return { group, wheels, headMats, half: { w: 6.2, l: 6, h: 2.8 } };
  }

  // Coastliner
  const body = plastic(0xf4f7fb);
  const belly = plastic(0x1f4e89);
  const wing = plastic(0xdfe7ef);
  M.add(1.8, 1.8, 16.5, 0, 2.05, 0, body);
  M.add(1.7, 0.45, 14, 0, 1.25, 0, belly);
  M.add(16.5, 0.16, 2.4, 0, 1.85, -0.4, wing);
  M.add(5.2, 0.1, 1.3, 0, 2.15, -7.6, wing);
  M.add(0.14, 2.6, 1.6, 0, 3.3, -7.5, belly);
  M.add(0.85, 0.85, 1.8, -3.2, 1.35, -0.5, plastic(0x2a3140));
  M.add(0.85, 0.85, 1.8, 3.2, 1.35, -0.5, plastic(0x2a3140));
  M.finish(true);
  // windows
  const win = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 0.36),
    new THREE.MeshLambertMaterial({ color: 0x8ecae6, emissive: new THREE.Color(0x8ecae6), emissiveIntensity: 0.15 }),
  );
  win.position.set(0.92, 2.25, 0);
  win.rotation.y = Math.PI / 2;
  group.add(win);
  addGear(group, wheels, 1.7, 0.38, 4.2, 2.2);
  const hm = lampMat();
  headMats.push(hm);
  const nose = new THREE.Mesh(boxGeo(0.5, 0.16, 0.1), hm);
  nose.position.set(0, 1.9, 8.2);
  group.add(nose);
  return { group, wheels, headMats, half: { w: 8.4, l: 8.6, h: 3.6 } };
}

function lampMat() {
  return new THREE.MeshLambertMaterial({
    color: 0xfff4d2,
    emissive: new THREE.Color(0xfff4d2),
    emissiveIntensity: 0.8,
  });
}

function addGear(group: THREE.Group, wheels: WheelRig[], y: number, r: number, zNose: number, xMain: number) {
  const geo = cylGeo(r, r, 0.18, 10).clone();
  geo.rotateZ(Math.PI / 2);
  const mat = plastic(0x222222);
  const spots: [number, number, boolean][] = [
    [0, zNose, true],
    [-xMain, -0.2, false],
    [xMain, -0.2, false],
  ];
  for (const [x, z, front] of spots) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(geo, mat);
    tire.castShadow = true;
    spin.add(tire);
    pivot.add(spin);
    group.add(pivot);
    // strut
    const strut = new THREE.Mesh(boxGeo(0.08, y - r, 0.08), plastic(0x889099));
    strut.position.set(x, (y + r) / 2, z);
    group.add(strut);
    wheels.push({ pivot, spin, front });
  }
}

function buildHeli(id: string): {
  group: THREE.Group;
  rotor: THREE.Object3D;
  tailRotor: THREE.Object3D;
  blur: THREE.Mesh;
  half: { w: number; l: number; h: number };
} {
  const group = new THREE.Group();
  const M = localMerge(group);
  const scale = id === "widehaul" ? 1.35 : id === "skycam" ? 0.95 : 1;
  const bodyCol = id === "skycam" ? 0xd84a3a : id === "widehaul" ? 0x3d4f63 : 0xf2f4ef;
  const accent = id === "skycam" ? 0xf4f4f4 : id === "widehaul" ? 0xd4783a : 0x1f6b4a;
  M.add(1.35 * scale, 1.25 * scale, 2.1 * scale, 0, 1.15 * scale, 0.1, plastic(bodyCol));
  M.add(0.45 * scale, 0.42 * scale, 3.4 * scale, 0, 1.15 * scale, -2.0 * scale, plastic(bodyCol));
  M.add(0.12 * scale, 0.7 * scale, 0.45 * scale, 0, 1.45 * scale, -3.5 * scale, plastic(accent));
  M.add(1.5 * scale, 0.08 * scale, 0.12 * scale, 0, 0.35 * scale, 0.15, plastic(0x2a2a2a));
  M.add(0.12 * scale, 0.08 * scale, 1.5 * scale, 0, 0.35 * scale, 0.15, plastic(0x2a2a2a));
  if (id === "skycam") {
    M.addGeo(new THREE.SphereGeometry(0.22, 10, 8), plastic(0x111111), 0, 0.7 * scale, 1.15 * scale);
  }
  M.finish(true);

  const glass = new THREE.Mesh(
    boxGeo(1.2 * scale, 0.8 * scale, 1.3 * scale),
    new THREE.MeshLambertMaterial({ color: 0x9fd4ee, transparent: true, opacity: 0.45 }),
  );
  glass.position.set(0, 1.35 * scale, 0.55 * scale);
  group.add(glass);

  const rotor = new THREE.Group();
  rotor.position.set(0, 1.85 * scale, 0);
  const bladeMat = plastic(0x2a2a2a);
  const span = 5.2 * scale;
  rotor.add(new THREE.Mesh(boxGeo(span, 0.06, 0.18), bladeMat));
  rotor.add(new THREE.Mesh(boxGeo(0.18, 0.06, span), bladeMat));
  if (id === "widehaul") {
    const extra = new THREE.Mesh(boxGeo(span, 0.06, 0.18), bladeMat);
    extra.rotation.y = Math.PI / 4;
    rotor.add(extra);
  }
  group.add(rotor);
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(span * 0.48, 24),
    new THREE.MeshLambertMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  blur.rotation.x = -Math.PI / 2;
  blur.position.y = 0.02;
  rotor.add(blur);

  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.2 * scale, 1.45 * scale, -3.55 * scale);
  tailRotor.add(new THREE.Mesh(boxGeo(0.05, 1.1 * scale, 0.12), bladeMat));
  tailRotor.add(new THREE.Mesh(boxGeo(0.05, 0.12, 1.1 * scale), bladeMat));
  group.add(tailRotor);

  return {
    group,
    rotor,
    tailRotor,
    blur,
    half: { w: 1.2 * scale, l: 3.2 * scale, h: 2.1 * scale },
  };
}

function damp(current: number, target: number, rate: number, dt: number) {
  const k = 1 - Math.exp(-rate * dt);
  return current + (target - current) * k;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export type StepResult = "ok" | "drown" | "crash";

export function stepCar(v: Vehicle, c: Control, dt: number, world: WorldQuery): StepResult {
  const tune = v.tune as CarTune;
  const paved = world.paved(v.x, v.z);
  const grip = paved ? 1 : 0.45 + 0.55 * tune.offroad;
  let accel = tune.accel * (paved ? 1 : 0.75 + 0.25 * tune.offroad);
  if (c.boost && v.boost > 0.05) {
    accel *= tune.electric ? 1.65 : 1.45;
    v.boost = Math.max(0, v.boost - dt);
  } else {
    v.boost = Math.min(v.boostMax, v.boost + dt * (tune.electric ? 0.28 : 0.18));
  }
  const max = tune.maxSpeed * (paved ? 1 : grip);
  if (c.throttleAxis > 0) v.speed += accel * (1 - Math.max(0, v.speed) / max) * dt * c.throttleAxis;
  if (c.throttleAxis < 0) {
    if (v.speed > 0.8) v.speed -= tune.brake * dt;
    else v.speed -= accel * 0.45 * dt;
  }
  if (c.handbrake && v.speed !== 0) v.speed -= Math.sign(v.speed) * tune.brake * 1.15 * dt;
  if (c.throttleAxis === 0 && !c.handbrake) {
    const drag = 1.8 + v.speed * v.speed * 0.0016;
    const drop = Math.min(Math.abs(v.speed), drag * dt);
    v.speed -= Math.sign(v.speed) * drop;
  }
  v.speed = clamp(v.speed, -max * 0.32, max);

  const steerAngle = c.steer * 0.46 * tune.handling * (0.55 + 0.45 / (1 + Math.abs(v.speed) / 18));
  v.steerVis = steerAngle;
  if (Math.abs(v.speed) > 0.35) {
    v.yaw += (v.speed / tune.wheelBase) * Math.tan(steerAngle) * dt;
  }
  if (c.handbrake && Math.abs(v.speed) > 7) v.yaw += c.steer * 1.7 * dt * Math.sign(v.speed);

  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  v.x += fx * v.speed * dt;
  v.z += fz * v.speed * dt;
  v.travel += v.speed * dt;

  const axle = tune.wheelBase * 0.5;
  const radius = Math.max(0.7, v.half.w * 0.78);
  const rearInX = v.x - fx * axle;
  const rearInZ = v.z - fz * axle;
  const rear = world.collide(rearInX, rearInZ, radius, v.y, 1.5, v.uid);
  v.x += rear.x - rearInX;
  v.z += rear.z - rearInZ;
  const fx2 = Math.sin(v.yaw);
  const fz2 = Math.cos(v.yaw);
  const frontInX = v.x + fx2 * axle;
  const frontInZ = v.z + fz2 * axle;
  const front = world.collide(frontInX, frontInZ, radius, v.y, 1.5, v.uid);
  v.x += front.x - frontInX;
  v.z += front.z - frontInZ;
  const push = front.hit ? front : rear;
  v.speed = killedSpeed(v.speed, v.yaw, push);

  const gy = world.groundY(v.x, v.z, "land");
  if (gy < v.y - 0.5) {
    v.vy -= 24 * dt;
    v.y += v.vy * dt;
    if (v.y < gy) {
      v.y = gy;
      v.vy = 0;
    }
  } else {
    v.y = gy;
    v.vy = 0;
  }
  if (!paved) v.y += Math.sin(v.travel * 1.6) * 0.03;

  const ahead = world.groundY(v.x + fx * 1.8, v.z + fz * 1.8, "land");
  const behind = world.groundY(v.x - fx * 1.8, v.z - fz * 1.8, "land");
  const rx = Math.cos(v.yaw);
  const rz = -Math.sin(v.yaw);
  const left = world.groundY(v.x - rx, v.z - rz, "land");
  const right = world.groundY(v.x + rx, v.z + rz, "land");
  v.pitch = clamp(Math.atan2(ahead - behind, 3.6), -0.4, 0.4);
  v.roll = clamp(Math.atan2(right - left, 2) * 0.8 - steerAngle * 0.35, -0.35, 0.35);

  for (const w of v.wheels) {
    if (w.front) w.pivot.rotation.y = steerAngle;
    w.spin.rotation.x = -v.travel / tune.wheelR;
  }
  const braking = c.throttleAxis < 0 || c.handbrake;
  for (const m of v.brakeMats) m.emissiveIntensity = braking ? 0.9 : 0.12;

  if (v.y < -1.35 || (world.waterDepth(v.x, v.z) > 12 && v.y < 0.2)) return "drown";
  return "ok";
}

export function stepPlane(v: Vehicle, c: Control, dt: number, world: WorldQuery): StepResult {
  const tune = v.tune as PlaneTune;
  v.throttle = clamp(v.throttle + c.throttleAxis * dt * 0.42, 0, 1);
  const gy = world.groundY(v.x, v.z, "air");
  const grounded = v.y <= gy + tune.gear + 0.18 && v.vy <= 1.2;

  const thrust = tune.thrust * v.throttle;
  const drag = 0.012 * v.speed * v.speed + (grounded ? 1.4 : 0.3);
  v.speed += (thrust - drag) * dt;
  v.speed = clamp(v.speed, grounded ? -4 : 0, tune.maxSpeed);
  if (grounded && c.throttleAxis < 0) v.speed -= 10 * dt;

  if (grounded && v.speed < tune.stall * 0.85) {
    v.yaw += c.steer * (0.7 + Math.abs(v.speed) * 0.03) * dt;
    v.pitch = damp(v.pitch, 0, 4, dt);
    v.roll = damp(v.roll, 0, 4, dt);
  } else {
    v.pitch = clamp(v.pitch + c.pitch * tune.agility * 0.7 * dt, -0.7, 0.75);
    v.roll = clamp(v.roll + c.steer * tune.agility * 1.3 * dt, -1.05, 1.05);
    if (Math.abs(c.pitch) < 0.1) v.pitch = damp(v.pitch, 0.02, 0.6, dt);
    if (Math.abs(c.steer) < 0.1) v.roll = damp(v.roll, 0, 1.6, dt);
    v.yaw += Math.sin(v.roll) * (0.35 + v.speed * 0.012) * tune.agility * dt;
  }

  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  v.x += fx * v.speed * dt;
  v.z += fz * v.speed * dt;
  v.travel += v.speed * dt;

  const lift = v.speed * v.speed * tune.lift;
  const airborneLift = grounded ? 0 : lift - 11;
  const targetVy = Math.sin(v.pitch) * v.speed * 0.85 + airborneLift;
  if (grounded && v.pitch < 0.12) {
    v.vy = Math.max(0, v.vy);
    v.y = gy + tune.gear;
    if (lift > 12 && v.pitch > 0.08 && v.speed > tune.stall) {
      v.vy = 2;
      v.y += 0.05;
    }
  } else {
    v.vy = damp(v.vy, targetVy, 1.6, dt);
    v.y += v.vy * dt;
    if (v.y <= gy + tune.gear && v.vy < 0) {
      if (v.vy < -13) return "crash";
      v.y = gy + tune.gear;
      v.vy = 0;
      v.pitch = Math.max(0, v.pitch);
    }
  }

  // Building bump when low
  if (v.y < gy + tune.gear + 2.2) {
    const hit = world.collide(v.x, v.z, 1.4, v.y, 1.2, v.uid);
    if (hit.hit && v.speed > 18) return "crash";
    v.x = hit.x;
    v.z = hit.z;
  }

  for (const w of v.wheels) w.spin.rotation.x = grounded ? -v.travel / 0.35 : 0;
  if (v.prop) v.prop.rotation.z += (12 + v.throttle * 40) * dt;
  for (const m of v.headMats) m.emissiveIntensity = 0.4 + v.throttle * 0.6;

  if (world.waterDepth(v.x, v.z) > 6 && v.y < tune.gear + 0.4) return "drown";
  return "ok";
}

export function stepHeli(v: Vehicle, c: Control, dt: number, world: WorldQuery): StepResult {
  const tune = v.tune as HeliTune;
  const gy = world.groundY(v.x, v.z, "air");
  v.pitch = damp(v.pitch, c.pitch * tune.tilt, 3 * tune.agility, dt);
  v.roll = damp(v.roll, -c.steer * tune.tilt * 0.35, 3, dt);
  v.yaw += c.steer * 1.1 * tune.agility * dt;

  const climb = c.climb * tune.climb;
  if (Math.abs(c.climb) > 0.1) v.vy += climb * dt;
  else v.vy = damp(v.vy, 0, 3.2, dt);

  const fx = Math.sin(v.yaw);
  const fz = Math.cos(v.yaw);
  const forwardA = Math.sin(v.pitch) * tune.accel;
  v.speed = damp(v.speed, 0, 0.4, dt);
  v.speed += forwardA * dt;
  v.speed = clamp(v.speed, -tune.maxSpeed * 0.4, tune.maxSpeed);
  // lateral from a little roll
  const side = Math.sin(v.roll) * tune.accel * 0.4;
  v.x += (fx * v.speed + Math.cos(v.yaw) * side) * dt;
  v.z += (fz * v.speed - Math.sin(v.yaw) * side) * dt;
  v.y += v.vy * dt;

  if (v.y <= gy + tune.gear && v.vy <= 0.4) {
    if (v.vy < -10) return "crash";
    v.y = gy + tune.gear;
    v.vy = 0;
    v.speed = damp(v.speed, 0, 2.5, dt);
  }

  if (v.y < gy + tune.gear + 1.5) {
    const hit = world.collide(v.x, v.z, 1.1, gy, tune.gear + 1, v.uid);
    v.x = hit.x;
    v.z = hit.z;
  }

  const spin = 8 + Math.abs(v.vy) * 0.4 + Math.abs(v.speed) * 0.15 + 6;
  if (v.rotor) v.rotor.rotation.y += spin * dt;
  if (v.tailRotor) v.tailRotor.rotation.x += spin * 1.6 * dt;
  if (v.rotorBlur) {
    const mat = v.rotorBlur.material as THREE.MeshLambertMaterial;
    mat.opacity = clamp(spin / 28, 0.05, 0.28);
  }
  if (world.waterDepth(v.x, v.z) > 8 && v.y < tune.gear + 0.3) return "drown";
  return "ok";
}

export function updateVehiclePose(v: Vehicle) {
  place(v);
}

export function mph(mps: number) {
  return Math.abs(mps) * 2.23694;
}
