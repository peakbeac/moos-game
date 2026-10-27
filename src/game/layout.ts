/** Coordinate system: +X east, +Z north, +Y up. Yaw 0 faces north (+Z). */

export const WORLD_MIN = -560;
export const WORLD_MAX = 560;
export const WATER_Z = -520;
export const WATER_X = 520;

export const SPAWN = { x: 178.6, y: 0, z: -466, yaw: Math.PI };

export const INTRO_CAM = {
  x: 208,
  y: 5.1,
  z: -448,
  lookX: 182,
  lookY: 1.15,
  lookZ: -470,
};

export interface RoadSeg {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  w: number;
  kind: "highway" | "city" | "spur";
}

export interface Poi {
  id: string;
  name: string;
  x: number;
  z: number;
  title: string;
  body: string;
  radius: number;
}

export const ROADS: RoadSeg[] = [
  // County Line (north-south spine), split by the central roundabout.
  { x1: 0, z1: 30, x2: 0, z2: 450, w: 18, kind: "highway" },
  { x1: 0, z1: -30, x2: 0, z2: -420, w: 18, kind: "highway" },
  // Midline (east-west spine).
  { x1: 30, z1: 0, x2: 500, z2: 0, w: 18, kind: "highway" },
  { x1: -30, z1: 0, x2: -500, z2: 0, w: 18, kind: "highway" },
  // Shore Highway along the coast.
  { x1: -440, z1: -240, x2: 440, z2: -240, w: 18, kind: "highway" },
  // Ocean Avenue, beach terminus through downtown.
  { x1: 150, z1: -500, x2: 150, z2: 450, w: 16, kind: "city" },
  // City grid.
  { x1: 290, z1: 0, x2: 290, z2: 450, w: 14, kind: "city" },
  { x1: 420, z1: 0, x2: 420, z2: 450, w: 14, kind: "city" },
  { x1: 0, z1: 130, x2: 450, z2: 130, w: 14, kind: "city" },
  { x1: 0, z1: 270, x2: 500, z2: 270, w: 14, kind: "city" },
  { x1: 0, z1: 400, x2: 450, z2: 400, w: 14, kind: "city" },
  // Mountain ridge road.
  { x1: 0, z1: 200, x2: -160, z2: 200, w: 12, kind: "spur" },
  { x1: -160, z1: 200, x2: -160, z2: 330, w: 12, kind: "spur" },
  { x1: -160, z1: 330, x2: -330, z2: 330, w: 12, kind: "spur" },
  { x1: -330, z1: 330, x2: -330, z2: 160, w: 12, kind: "spur" },
  { x1: -330, z1: 160, x2: -180, z2: 80, w: 12, kind: "spur" },
  { x1: -180, z1: 80, x2: 0, z2: 80, w: 12, kind: "spur" },
  // Lodge and Highridge station driveway.
  { x1: -330, z1: 330, x2: -400, z2: 390, w: 10, kind: "spur" },
  { x1: -330, z1: 330, x2: -475, z2: 330, w: 10, kind: "spur" },
  // Desert oval + airport connectors.
  { x1: -300, z1: -240, x2: -300, z2: -118, w: 12, kind: "spur" },
  { x1: -250, z1: -240, x2: -250, z2: -320, w: 14, kind: "spur" },
  { x1: -250, z1: -320, x2: -250, z2: -380, w: 16, kind: "spur" },
  // Palm Circuit entrance off Ocean Avenue.
  { x1: 150, z1: -365, x2: 252, z2: -365, w: 12, kind: "spur" },
  // Ridge Loop entrance.
  { x1: -160, z1: 245, x2: -210, z2: 245, w: 12, kind: "spur" },
];

export interface LightSpot {
  x: number;
  z: number;
  w: number;
  offset: number;
}

export const LIGHTS: LightSpot[] = [
  { x: 150, z: -240, w: 17, offset: 0 },
  { x: 0, z: -240, w: 18, offset: 6 },
  { x: 150, z: 0, w: 17, offset: 13 },
  { x: -250, z: -240, w: 16, offset: 4 },
  { x: 290, z: 0, w: 16, offset: 8 },
  { x: 420, z: 0, w: 16, offset: 3 },
  { x: 0, z: 130, w: 16, offset: 11 },
  { x: 0, z: 270, w: 16, offset: 2 },
  { x: 0, z: 400, w: 16, offset: 15 },
  { x: 150, z: 130, w: 15, offset: 5 },
  { x: 150, z: 270, w: 15, offset: 9 },
  { x: 150, z: 400, w: 15, offset: 1 },
  { x: 290, z: 130, w: 14, offset: 7 },
  { x: 290, z: 270, w: 14, offset: 12 },
  { x: 290, z: 400, w: 14, offset: 16 },
  { x: 420, z: 130, w: 14, offset: 10 },
  { x: 420, z: 270, w: 14, offset: 18 },
  { x: 420, z: 400, w: 14, offset: 4.5 },
];

export interface Crossing {
  x: number;
  z: number;
  roadYaw: number;
  roadHalf: number;
}

/** roadYaw is the direction of the road (0 = road runs north-south). */
export const CROSSINGS: Crossing[] = [
  { x: 150, z: -155, roadYaw: 0, roadHalf: 8 },
  { x: 0, z: -155, roadYaw: 0, roadHalf: 9 },
  { x: -475, z: 0, roadYaw: Math.PI / 2, roadHalf: 9 },
  { x: 475, z: 0, roadYaw: Math.PI / 2, roadHalf: 9 },
  { x: -475, z: 330, roadYaw: Math.PI / 2, roadHalf: 6 },
  { x: 475, z: 270, roadYaw: Math.PI / 2, roadHalf: 7 },
  { x: -300, z: -155, roadYaw: 0, roadHalf: 6 },
];

export const ROUNDABOUT = { x: 0, z: 0, inner: 12, outer: 28 };

export const RUNWAY = { x: -235, z: -380, len: 390, w: 32, yaw: Math.PI / 2 };

export interface Parked {
  id: string;
  x: number;
  z: number;
  yaw: number;
  y?: number;
}

export const PARKED: Parked[] = [
  { id: "lumen-ix", x: 184, z: -466, yaw: 0 },
  { id: "marina", x: 202, z: -466, yaw: 0 },
  { id: "pico", x: 218, z: -466, yaw: 0 },
  { id: "dune", x: 238, z: -466, yaw: 0 },
  { id: "taxi", x: 176, z: -36, yaw: Math.PI },
  { id: "aero", x: 194, z: -36, yaw: Math.PI },
  { id: "palm-gt", x: 200, z: -348, yaw: Math.PI / 2 },
  { id: "mesa", x: -324, z: -208, yaw: 0 },
  { id: "ridge", x: -176, z: 258, yaw: -Math.PI / 2 },
];

export const AIRCRAFT: Parked[] = [
  { id: "gull", x: -400, z: -380, yaw: Math.PI / 2 },
  { id: "sable", x: -210, z: -332, yaw: Math.PI / 2 },
  { id: "liner", x: -280, z: -332, yaw: Math.PI / 2 },
  { id: "skylark", x: 112, z: -470, yaw: Math.PI / 4 },
  { id: "widehaul", x: 220, z: 336, yaw: 0.4, y: 23.1 },
  { id: "skycam", x: -376, z: 414, yaw: -0.8 },
  { id: "skylark-show", x: -150, z: -332, yaw: Math.PI / 2 },
  { id: "widehaul-show", x: -132, z: -332, yaw: Math.PI / 2 },
  { id: "skycam-show", x: -114, z: -332, yaw: Math.PI / 2 },
];

export const HELIPADS = [
  { x: 112, z: -470, y: 0.05 },
  { x: 220, z: 336, y: 22.2 },
  { x: -376, z: 414, y: 0.05 },
  { x: -150, z: -332, y: 0.05 },
  { x: -132, z: -332, y: 0.05 },
  { x: -114, z: -332, y: 0.05 },
];

export interface TrackDef {
  id: string;
  name: string;
  width: number;
  points: { x: number; z: number }[];
  gap: { x: number; z: number; len: number };
  pitNote: string;
}

export const TRACKS: TrackDef[] = [
  {
    id: "palm",
    name: "Palm Circuit",
    width: 14,
    points: [
      { x: 250, z: -420 },
      { x: 410, z: -420 },
      { x: 410, z: -310 },
      { x: 250, z: -310 },
    ],
    gap: { x: 250, z: -365, len: 22 },
    pitNote: "A long beach rectangle. Stay between the barriers and cross the striped line to start a lap.",
  },
  {
    id: "mesa",
    name: "Mesa Oval",
    width: 16,
    points: ovalPoints(-300, -78, 120, 42, 24),
    gap: { x: -300, z: -120, len: 18 },
    pitNote: "Desert oval. The stock car likes the banking-free straights — build speed before the apron.",
  },
  {
    id: "ridge",
    name: "Ridge Loop",
    width: 13,
    points: [
      { x: -210, z: 200 },
      { x: -210, z: 290 },
      { x: -300, z: 290 },
      { x: -300, z: 200 },
    ],
    gap: { x: -210, z: 245, len: 18 },
    pitNote: "Tight mountain loop between the ridge road and the peaks. The rally car grips the dirt shoulders.",
  },
];

function ovalPoints(cx: number, cz: number, rx: number, ry: number, n: number) {
  const pts: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, z: cz + Math.sin(a) * ry });
  }
  return pts;
}

export const TUNNEL = { x: -160, z: 258, len: 48, w: 14 };

export const POIS: Poi[] = [
  {
    id: "pinfall",
    name: "Pinfall",
    x: 78,
    z: 70,
    radius: 16,
    title: "Pinfall Bowling & Arcade",
    body: "Twelve lanes, a cabinet row that still takes tokens, and a roof full of studs. Shoe rental is under the pink sign. League night is Thursdays — the parking row out front fills first.",
  },
  {
    id: "starlight",
    name: "Starlight",
    x: 352,
    z: 300,
    radius: 16,
    title: "Starlight Cinema",
    body: "Tonight on the marquee: Tide House (sunset drama), Dune Run (a chase through Red Mesa), and Last Train to Ridge. Seats recline. The vertical sign is visible from the midline.",
  },
  {
    id: "hospital",
    name: "County General",
    x: 220,
    z: 308,
    radius: 14,
    title: "County General",
    body: "The roof pad is marked with an H. Widehaul, the heavy helicopter, is parked up top — fly the Skylark from the beach if you want the scenic approach.",
  },
  {
    id: "airport",
    name: "Red Mesa Field",
    x: -250,
    z: -300,
    radius: 18,
    title: "Red Mesa Field",
    body: "Runway 09 faces east. The Gull Trainer is lined up on the threshold: hold W, stay on the centerline, then ease the nose up once the speed ticks past the stall marker. Jets need more runway.",
  },
  {
    id: "lodge",
    name: "Ridge Lodge",
    x: -400,
    z: 400,
    radius: 12,
    title: "Ridge Lodge",
    body: "Hot drinks, a cold deck, and the SkyCam helicopter on the pad beside the pines. The driveway leaves the ridge road at the northwest corner.",
  },
  {
    id: "pier",
    name: "Shell Pier",
    x: 400,
    z: -520,
    radius: 10,
    title: "Shell Pier & Light",
    body: "The lighthouse keeps the east channel. The deck is narrow — fine on foot, dramatic in a car. Deep water past the rail puts you back on the sand.",
  },
  {
    id: "station-beach",
    name: "Shell Beach Station",
    x: 230,
    z: -178,
    radius: 12,
    title: "Shell Beach Station",
    body: "Tide Line commuter trains stop here. Copper Haul freights roll the outer loop without stopping. The yellow Rail Bug on the inner rail is yours — press F to drive it.",
  },
];

export const STATIONS = [
  { name: "Shell Beach", x: 214, z: -155 },
  { name: "Red Mesa", x: -96, z: -155 },
  { name: "Highridge", x: -475, z: 360 },
  { name: "Metro Center", x: 475, z: 300 },
];

export const BEACONS: { id: string; name: string; x: number; z: number }[] = [
  { id: "spawn", name: "Shell Beach", x: 184, z: -466 },
  { id: "pinfall", name: "Pinfall Arcade", x: 78, z: 70 },
  { id: "starlight", name: "Starlight Cinema", x: 352, z: 300 },
  { id: "airport", name: "Red Mesa Field", x: -400, z: -380 },
  { id: "palm", name: "Palm Circuit", x: 330, z: -365 },
  { id: "mesa", name: "Mesa Oval", x: -300, z: -112 },
  { id: "ridge", name: "Ridge Loop", x: -255, z: 245 },
  { id: "lodge", name: "Ridge Lodge", x: -400, z: 400 },
  { id: "pier", name: "Shell Pier", x: 400, z: -560 },
  { id: "metro", name: "Metro Station", x: 475, z: 300 },
];

export function regionName(x: number, z: number, water: number): string {
  if (water > 3) return "Ocean";
  if (x >= 0 && z < 0) return "Beach";
  if (x < 0 && z < 0) return "Desert";
  if (x >= 0 && z >= 0) return "Big City";
  return "Mountains";
}
