import * as THREE from "three";
import { CollisionWorld } from "./collision";
import {
  Batch,
  boxGeo,
  cylGeo,
  helipadTexture,
  mulberry32,
  plastic,
  roadTexture,
  signPlane,
  skyMaterial,
  trackTexture,
  waterMaterial,
  windowMaterial,
} from "./geom";
import {
  HELIPADS,
  ROADS,
  ROUNDABOUT,
  RUNWAY,
  TRACKS,
  TUNNEL,
  WATER_X,
  WATER_Z,
} from "./layout";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  buildPolyline,
  distToPolyline,
  offsetPolyline,
  sample,
  type Polyline,
} from "./polyline";
import { railLoop } from "./trains";

interface Surface {
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  y0: number;
  y1: number;
  airOnly?: boolean;
}

interface Seg {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  half: number;
}

export interface Checkpoint {
  x: number;
  z: number;
  yaw: number;
}

export class World {
  readonly collision = new CollisionWorld();
  readonly surfaces: Surface[] = [];
  readonly segs: Seg[] = [];
  readonly rects: { x: number; z: number; hx: number; hz: number }[] = [];
  readonly tracks = new Map<string, { poly: Polyline; width: number; name: string }>();
  readonly checks = new Map<string, Checkpoint[]>();
  railMid!: Polyline;
  railInner!: Polyline;
  railOuter!: Polyline;
  waterMats: THREE.ShaderMaterial[] = [];
  sky!: THREE.Mesh;
  beacon!: THREE.Mesh;
  private fountain!: THREE.Mesh;
  private seagulls: { mesh: THREE.Group; a: number; r: number; cx: number; cz: number; y: number }[] = [];
  private clouds: { mesh: THREE.Group; speed: number }[] = [];
  private minimap: { roads: [number, number, number, number][]; rails: { x: number; z: number }[] } = {
    roads: [],
    rails: [],
  };

  build(scene: THREE.Scene) {
    const batch = new Batch();
    this.ground(scene);
    this.roads(batch);
    this.roundabout(batch, scene);
    this.runway(batch, scene);
    this.raceTracks(batch, scene);
    this.rails(batch);
    this.landmarks(batch, scene);
    this.cityFill(batch, scene);
    this.scatter(scene);
    this.dressBeach(batch, scene);
    this.pier(batch, scene);
    this.tunnel(batch, scene);
    this.peaks(batch);
    this.desertRocks(batch);
    this.helipads(scene);
    batch.build(scene, "county");
    if (this._ties) scene.add(this._ties);
    this.waters(scene);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMaterial());
    scene.add(this.sky);
    this.makeBeacon(scene);
    this.makeClouds(scene);
    this.makeSeagulls(scene);
  }

  private ground(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1200, 1200, 140, 140);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = Math.sin(x * 0.02) * Math.cos(z * 0.018);
      let hex = 0x6e9458;
      if (x >= 0 && z < 0) hex = z < -490 ? 0xcbb07a : 0xe4c48a;
      else if (x < 0 && z < 0) hex = 0xd7a45a;
      else if (x >= 0 && z >= 0) hex = 0xb7b3aa;
      else hex = n > 0.35 ? 0x8d887f : 0x6e9458;
      if (x < 0 && z > 360 && n > 0.1) hex = 0xe7eef2;
      col.setHex(hex);
      col.getHSL(hsl);
      col.setHSL(hsl.h, hsl.s, Math.min(0.72, hsl.l + n * 0.04));
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true }),
    );
    mesh.receiveShadow = true;
    mesh.name = "ground";
    scene.add(mesh);
  }

  private roads(batch: Batch) {
    const tex = roadTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
    const plain = plastic(0x3a3f46);
    for (const r of ROADS) {
      const dx = r.x2 - r.x1;
      const dz = r.z2 - r.z1;
      const len = Math.hypot(dx, dz);
      if (len < 1) continue;
      const yaw = Math.atan2(dx, dz);
      const geo = new THREE.PlaneGeometry(r.w, len);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * (len / 8));
      geo.rotateX(-Math.PI / 2);
      batch.add(geo, mat, (r.x1 + r.x2) / 2, 0.03, (r.z1 + r.z2) / 2, yaw, 0, 0, false, true);
      this.segs.push({ x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2, half: r.w / 2 });
      this.minimap.roads.push([r.x1, r.z1, r.x2, r.z2]);
    }
    // Intersection pads so the dashes don't cross like spaghetti.
    const pads = [
      ...ROADS.map((r) => ({ x: r.x1, z: r.z1, w: r.w })),
      ...ROADS.map((r) => ({ x: r.x2, z: r.z2, w: r.w })),
    ];
    const seen = new Set<string>();
    for (const p of pads) {
      const key = `${Math.round(p.x)}:${Math.round(p.z)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.hypot(p.x, p.z) < 26) continue;
      batch.box(p.w + 2, 0.02, p.w + 2, p.x, 0.045, p.z, 0x3a3f46, 0, { cast: false });
      void plain;
    }
    // Beach parking pad
    batch.box(78, 0.02, 22, 210, 0.04, -466, 0x4a4038, 0, { cast: false });
    this.rects.push({ x: 210, z: -466, hx: 39, hz: 11 });
  }

  private roundabout(batch: Batch, scene: THREE.Scene) {
    const ring = new THREE.RingGeometry(ROUNDABOUT.inner, ROUNDABOUT.outer, 40);
    ring.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(ring, plastic(0x3a3f46));
    mesh.position.y = 0.05;
    mesh.receiveShadow = true;
    scene.add(mesh);
    batch.box(ROUNDABOUT.inner * 2 - 1, 0.2, ROUNDABOUT.inner * 2 - 1, 0, 0.12, 0, 0x6e9458, 0, { cast: false });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.8, 16), plastic(0xd7d2c8));
    basin.position.y = 0.5;
    scene.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.3, 16), plastic(0x1f8aaa));
    water.position.y = 0.85;
    scene.add(water);
    this.fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 2.4, 8), plastic(0x9ee7f2));
    this.fountain.position.y = 2;
    scene.add(this.fountain);
    this.collision.add({ id: "fountain", x: 0, z: 0, hx: 3.4, hz: 3.4, rot: 0, minY: 0, maxY: 2.2 });
    const sign = signPlane(
      [
        { text: "COUNTY CIRCLE", size: 64, color: "#102028" },
        { text: "FOUR REGIONS MEET", size: 32, color: "#1f6b8a" },
      ],
      "#f4efe6",
      8,
      3,
    );
    sign.position.set(0, 3.2, -ROUNDABOUT.outer - 2);
    scene.add(sign);
  }

  private runway(batch: Batch, scene: THREE.Scene) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 1024;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3a4148";
    g.fillRect(0, 0, 256, 1024);
    g.fillStyle = "#f4f4f4";
    g.fillRect(8, 0, 6, 1024);
    g.fillRect(242, 0, 6, 1024);
    for (let y = 20; y < 1000; y += 48) g.fillRect(122, y, 12, 24);
    for (let i = 0; i < 8; i++) g.fillRect(40, 40 + i * 18, 176, 8);
    g.font = "800 120px Nunito, sans-serif";
    g.fillText("09", 48, 280);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const geo = new THREE.PlaneGeometry(RUNWAY.w, RUNWAY.len);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    mesh.position.set(RUNWAY.x, 0.04, RUNWAY.z);
    mesh.rotation.y = Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
    this.rects.push({ x: RUNWAY.x, z: RUNWAY.z, hx: RUNWAY.len / 2, hz: RUNWAY.w / 2 });
    // Threshold lights
    const lamp = plastic(0xfff4d2, 0xfff4d2);
    for (let i = 0; i < 14; i++) {
      const x = RUNWAY.x - RUNWAY.len / 2 + 8 + i * 26;
      batch.box(0.4, 0.12, 0.4, x, 0.08, RUNWAY.z - RUNWAY.w / 2 - 0.6, 0xfff4d2, 0, { cast: false, emissive: 0xfff4d2 });
      batch.box(0.4, 0.12, 0.4, x, 0.08, RUNWAY.z + RUNWAY.w / 2 + 0.6, 0xfff4d2, 0, { cast: false, emissive: 0xfff4d2 });
      void lamp;
    }
    const termX = -300;
    const termZ = -292;
    this.building(batch, termX, termZ, 42, 14, 8, 0xe7e1d6, 0xc5d0d8, 4);
    this.building(batch, -268, -292, 6, 6, 18, 0xd7d2c8, 0x8fa4b5, 7);
    const glass = new THREE.Mesh(boxGeo(2.4, 2.4, 2.4), plastic(0x8ecae6, 0x8ecae6));
    glass.position.set(-268, 18.2, -292);
    scene.add(glass);
    const sign = signPlane(
      [
        { text: "RED MESA FIELD", size: 58, color: "#f4efe6" },
        { text: "RUNWAY 09", size: 36, color: "#ffb703" },
      ],
      "#1c2830",
      12,
      3.2,
      true,
    );
    sign.position.set(termX, 6.2, termZ + 7.2);
    scene.add(sign);
  }

  private raceTracks(batch: Batch, scene: THREE.Scene) {
    const mat = new THREE.MeshLambertMaterial({ map: trackTexture() });
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
    for (const t of TRACKS) {
      const poly = buildPolyline(t.points, 6, true);
      this.tracks.set(t.id, { poly, width: t.width, name: t.name });
      const geo = ribbon(poly, t.width, 0.055, 6);
      batch.add(geo, mat, 0, 0, 0, 0, 0, 0, false, true);
      const checks: Checkpoint[] = [];
      for (let k = 0; k < 4; k++) {
        const p = sample(poly, (poly.total * k) / 4);
        checks.push({ x: p.x, z: p.z, yaw: p.yaw });
      }
      this.checks.set(t.id, checks);
      const start = sample(poly, 2);
      const line = new THREE.Mesh(boxGeo(t.width * 0.92, 0.04, 0.45), plastic(0xf4f4f4));
      line.position.set(start.x, 0.08, start.z);
      line.rotation.y = start.yaw;
      scene.add(line);
      for (let s = 0; s < poly.total; s += 16) {
        const p = sample(poly, s);
        if (Math.hypot(p.x - t.gap.x, p.z - t.gap.z) < t.gap.len) continue;
        for (const side of [-1, 1]) {
          const ox = p.x + p.lx * side * (t.width / 2 + 0.7);
          const oz = p.z + p.lz * side * (t.width / 2 + 0.7);
          batch.box(0.45, 0.7, 13.5, ox, 0.4, oz, side > 0 ? 0xd7d3cc : 0xc5c0b6, p.yaw, { cast: true });
          this.collision.add({
            id: `${t.id}-bar-${s}-${side}`,
            x: ox,
            z: oz,
            hx: 0.32,
            hz: 6.6,
            rot: p.yaw,
            minY: 0,
            maxY: 0.9,
          });
        }
      }
      const g = sample(poly, poly.total * 0.02);
      const gantry = signPlane(
        [
          { text: t.name.toUpperCase(), size: 58, color: "#102028" },
          { text: "CROSS THE STRIPE", size: 28, color: "#9a3412" },
        ],
        "#f4efe6",
        t.width,
        2.2,
      );
      gantry.position.set(g.x, 3.4, g.z);
      gantry.rotation.y = g.yaw;
      scene.add(gantry);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(boxGeo(0.25, 3.4, 0.25), plastic(0x22262c));
        post.position.set(g.x + g.lx * s * (t.width / 2 + 0.4), 1.7, g.z + g.lz * s * (t.width / 2 + 0.4));
        scene.add(post);
      }
    }
  }

  private rails(batch: Batch) {
    this.railMid = railLoop();
    this.railInner = offsetPolyline(this.railMid, 7.2, 8);
    this.railOuter = offsetPolyline(this.railMid, -7.5, 8);
    const gravel = plastic(0x6b645c);
    const steel = plastic(0xb7bec6);
    for (const poly of [this.railMid, this.railInner, this.railOuter]) {
      batch.add(ribbon(poly, 3.4, 0.025, 4), gravel, 0, 0, 0, 0, 0, 0, false, true);
      batch.add(ribbonShift(poly, 0.72, 0.12, 0.16, 2), steel, 0, 0, 0, 0, 0, 0, false, true);
      batch.add(ribbonShift(poly, -0.72, 0.12, 0.16, 2), steel, 0, 0, 0, 0, 0, 0, false, true);
    }
    const tie = boxGeo(2.15, 0.08, 0.28);
    const tieMat = plastic(0x6a4630);
    const count = Math.floor(this.railMid.total / 3.1) * 3;
    const ties = new THREE.InstancedMesh(tie, tieMat, count);
    ties.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const poly of [this.railMid, this.railInner, this.railOuter]) {
      for (let s = 0; s < poly.total && n < count; s += 3.1) {
        const p = sample(poly, s);
        q.setFromAxisAngle(up, p.yaw);
        m.compose(new THREE.Vector3(p.x, 0.08, p.z), q, new THREE.Vector3(1, 1, 1));
        ties.setMatrixAt(n++, m);
      }
    }
    ties.count = n;
    ties.instanceMatrix.needsUpdate = true;
    // added after batch via scene in build — store on a temp by adding now through a side channel
    this._ties = ties;
    const step = 40;
    for (let s = 0; s < this.railMid.total; s += step) {
      const p = sample(this.railMid, s);
      this.minimap.rails.push({ x: p.x, z: p.z });
    }
  }

  _ties?: THREE.InstancedMesh;

  private landmarks(batch: Batch, scene: THREE.Scene) {
    // Pinfall — faces Ocean Avenue to the east.
    this.building(batch, 100, 66, 50, 32, 9, 0x2a2438, 0x3a3050, 2);
    batch.box(50.4, 0.35, 0.4, 100, 8.6, 66, 0xff3cac, 0, { emissive: 0xff3cac, cast: false });
    batch.box(0.4, 0.35, 32.4, 100, 8.6, 66, 0x00f5d4, Math.PI / 2, { emissive: 0x00f5d4, cast: false });
    const pinfall = signPlane(
      [
        { text: "PINFALL", size: 92, color: "#ff3cac" },
        { text: "BOWLING + ARCADE", size: 36, color: "#7ef0e0" },
      ],
      "#1a1228",
      14,
      4.2,
      true,
    );
    pinfall.position.set(125.2, 6.4, 66);
    pinfall.rotation.y = Math.PI / 2;
    scene.add(pinfall);
    batch.box(8, 0.2, 3, 122, 3.1, 78, 0xff3cac, 0, { emissive: 0xff3cac, cast: false });
    for (const [x, z] of [[118, 86], [121, 88], [124, 85]] as const) this.pin(scene, x, z);

    // Starlight cinema
    this.building(batch, 352, 300, 42, 22, 12, 0x241c22, 0x3a2a30, 5);
    const blade = signPlane(
      [
        { text: "STAR", size: 70, color: "#f2c14e" },
        { text: "LIGHT", size: 70, color: "#f4efe6" },
      ],
      "#6b1d2a",
      4.2,
      10,
      true,
    );
    blade.position.set(330, 14, 300);
    blade.rotation.y = -Math.PI / 2;
    scene.add(blade);
    const marquee = signPlane(
      [
        { text: "NOW SHOWING", size: 36, color: "#f2c14e" },
        { text: "TIDE HOUSE", size: 48, color: "#fff8ea" },
        { text: "DUNE RUN  ·  LAST TRAIN", size: 28, color: "#f4efe6" },
      ],
      "#1a1216",
      16,
      4,
      true,
    );
    marquee.position.set(352, 8.5, 288.7);
    marquee.rotation.y = Math.PI;
    scene.add(marquee);
    for (const [i, title] of ["TIDE HOUSE", "DUNE RUN", "LAST TRAIN"].entries()) {
      const poster = signPlane(
        [
          { text: title, size: 36, color: "#102028" },
          { text: "TONIGHT", size: 22, color: "#9a3412" },
        ],
        i === 1 ? "#e7c98a" : i === 2 ? "#8fb9c9" : "#f0c1b0",
        3.2,
        4.6,
      );
      poster.position.set(338 + i * 7, 3.2, 288.8);
      poster.rotation.y = Math.PI;
      scene.add(poster);
    }

    // Hospital
    this.building(batch, 220, 336, 34, 22, 22, 0xf4f1ea, 0xd7d2c8, 9);
    const cross = new THREE.Mesh(boxGeo(2.2, 2.2, 0.2), plastic(0xd23b3b, 0xff4d4d));
    cross.position.set(220, 16, 325.1);
    scene.add(cross);
    const hSign = signPlane([{ text: "COUNTY GENERAL", size: 48, color: "#102028" }], "#f4efe6", 12, 2);
    hSign.position.set(220, 12.5, 324.8);
    scene.add(hSign);
    this.surfaces.push({
      x: 220,
      z: 336,
      hx: 12,
      hz: 8,
      rot: 0,
      y0: 22.15,
      y1: 22.15,
      airOnly: true,
    });

    // Towers
    const towers = [
      { x: 196, z: 188, w: 16, d: 16, h: 46, c: 0x8fa4b5 },
      { x: 230, z: 210, w: 18, d: 18, h: 68, c: 0xd7dde3 },
      { x: 252, z: 168, w: 14, d: 14, h: 34, c: 0xc46b4a },
    ];
    for (const [i, t] of towers.entries()) {
      this.building(batch, t.x, t.z, t.w, t.d, t.h, t.c, 0xbfc6cc, 20 + i);
      const ant = new THREE.Mesh(boxGeo(0.3, 6, 0.3), plastic(0xdddddd));
      ant.position.set(t.x, t.h + 3, t.z);
      scene.add(ant);
    }

    // Lodge
    this.building(batch, -408, 392, 18, 12, 7, 0x8d5a32, 0x6b4428, 3);
    const lodge = signPlane(
      [
        { text: "RIDGE LODGE", size: 52, color: "#f4efe6" },
        { text: "HOT DRINKS · COLD VIEW", size: 24, color: "#ffb703" },
      ],
      "#3a2418",
      8,
      2.6,
      true,
    );
    lodge.position.set(-408, 5.2, 398.2);
    scene.add(lodge);

    // Airport helipad row is handled with pads. Gas canopy in the desert.
    batch.box(14, 0.3, 10, -80, 4.2, -278, 0xf2c14e, 0, { cast: true });
    batch.box(0.4, 4, 0.4, -86, 2, -282, 0xdddddd);
    batch.box(0.4, 4, 0.4, -74, 2, -274, 0xdddddd);
    const gas = signPlane([{ text: "DUNE FUEL", size: 48, color: "#102028" }], "#f2c14e", 6, 1.6);
    gas.position.set(-80, 4.8, -272.8);
    scene.add(gas);
  }

  private pin(scene: THREE.Scene, x: number, z: number) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.85, 8), plastic(0xf7f7f7));
    body.position.y = 0.42;
    const neck = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), plastic(0xf7f7f7));
    neck.position.y = 0.95;
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8), plastic(0xd23b3b));
    stripe.position.y = 0.62;
    g.add(body, neck, stripe);
    g.position.set(x, 0, z);
    scene.add(g);
  }

  private cityFill(batch: Batch, scene: THREE.Scene) {
    const blocks = [
      [164, 276, 18, 116],
      [304, 406, 18, 116],
      [434, 490, 18, 116],
      [18, 136, 144, 256],
      [304, 406, 144, 256],
      [434, 490, 144, 256],
      [18, 136, 286, 386],
      [434, 490, 286, 386],
      [18, 136, 414, 455],
      [164, 276, 414, 455],
      [304, 406, 414, 455],
    ];
    const palette = [0xe7e1d6, 0xc9a27a, 0x8fa4b5, 0xd06a4f, 0xf2efe6, 0x6e7e8e, 0xe6d3a3, 0xb7c4b0];
    blocks.forEach((b, bi) => {
      const [x0, x1, z0, z1] = b;
      const rnd = mulberry32(100 + bi * 17);
      let x = x0 + 3;
      let n = 0;
      while (x + 12 < x1 - 2 && n < 5) {
        const w = 11 + rnd() * 7;
        const d = 12 + rnd() * 6;
        const h = 8 + rnd() * (bi % 3 === 0 ? 16 : 8);
        const cx = x + w / 2;
        const cz = z0 + 4 + d / 2;
        if (cz + d / 2 < z1 - 2) {
          const color = palette[Math.floor(rnd() * palette.length)];
          this.building(batch, cx, cz, w, d, h, color, 0xd7d2c8, bi * 5 + n);
        }
        x += w + 2.5;
        n++;
      }
    });
    const cafe = signPlane([{ text: "SALT CAFE", size: 48, color: "#102028" }], "#f4efe6", 6, 1.5);
    cafe.position.set(138, 4.2, 40);
    scene.add(cafe);
    const bank = signPlane([{ text: "DUNE BANK", size: 42, color: "#f4efe6" }], "#1f4e89", 6, 1.5, true);
    bank.position.set(330, 6, 150);
    scene.add(bank);
  }

  private building(batch: Batch, x: number, z: number, w: number, d: number, h: number, color: number, roof: number, seed: number) {
    batch.box(w, h, d, x, h / 2, z, color);
    batch.studRoof(w + 0.15, d + 0.15, x, h + 0.08, z, roof);
    batch.box(1.2, 2.2, 0.12, x, 1.1, z + d / 2 + 0.02, 0x2a241c, 0, { cast: false });
    const cols = Math.max(2, Math.min(8, Math.round(w / 3)));
    const rows = Math.max(1, Math.min(10, Math.round(h / 3.2)));
    const mat = windowMaterial(cols, rows, seed);
    const gw = Math.min(w * 0.78, cols * 0.9);
    const gh = Math.min(h * 0.62, rows * 0.9);
    const geo = new THREE.PlaneGeometry(gw, gh);
    batch.add(geo, mat, x, h * 0.58, z + d / 2 + 0.08, 0, 0, 0, false, false);
    batch.add(geo, mat, x, h * 0.58, z - d / 2 - 0.08, Math.PI, 0, 0, false, false);
    this.collision.add({
      id: `b-${x}-${z}`,
      x,
      z,
      hx: w / 2,
      hz: d / 2,
      rot: 0,
      minY: 0,
      maxY: h > 20 ? h - 0.45 : h,
    });
  }

  private scatter(scene: THREE.Scene) {
    const rnd = mulberry32(7);
    const palms: THREE.Matrix4[] = [];
    const pines: THREE.Matrix4[] = [];
    const cacti: THREE.Matrix4[] = [];
    const lamps: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const m = new THREE.Matrix4();
    const push = (list: THREE.Matrix4[], x: number, z: number, s = 1, rot = rnd() * Math.PI * 2) => {
      q.setFromAxisAngle(up, rot);
      m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
      list.push(m.clone());
    };
    const handPalms = [
      [118, -500],
      [96, -448],
      [250, -505],
      [300, -488],
      [330, -450],
      [210, -508],
      [270, -500],
      [78, -492],
      [360, -500],
      [40, -430],
    ];
    for (const [x, z] of handPalms) push(palms, x, z, 0.9 + rnd() * 0.4);
    let guard = 0;
    const tryPlace = (region: "beach" | "desert" | "mount" | "city", list: THREE.Matrix4[], n: number, scale = 1) => {
      let placed = 0;
      while (placed < n && guard < 8000) {
        guard++;
        const x = region === "beach" || region === "city" ? rnd() * 500 : -rnd() * 480;
        const z = region === "beach" || region === "desert" ? -rnd() * 500 : rnd() * 460;
        if (this.blocked(x, z)) continue;
        push(list, x, z, scale * (0.75 + rnd() * 0.6));
        placed++;
      }
    };
    tryPlace("beach", palms, 28, 1);
    tryPlace("mount", pines, 70, 1);
    tryPlace("desert", cacti, 40, 1);
    // Lamps along a few roads
    for (const r of ROADS) {
      if (r.kind === "spur") continue;
      const dx = r.x2 - r.x1;
      const dz = r.z2 - r.z1;
      const len = Math.hypot(dx, dz);
      const yaw = Math.atan2(dx, dz);
      const steps = Math.floor(len / 34);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = r.x1 + dx * t;
        const z = r.z1 + dz * t;
        const side = i % 2 === 0 ? 1 : -1;
        const ox = Math.cos(yaw) * side * (r.w / 2 + 1.6);
        const oz = -Math.sin(yaw) * side * (r.w / 2 + 1.6);
        if (Math.hypot(x, z) < ROUNDABOUT.outer + 4) continue;
        push(lamps, x + ox, z + oz, 1, yaw);
      }
    }
    scene.add(instanced(palmGeo(), plastic(0x2f8a45), palms, true));
    // trunks separately
    scene.add(instanced(trunkGeo(4.2), plastic(0x8a5a32), palms, true));
    scene.add(instanced(pineGeo(), plastic(0x1e4d32), pines, true));
    scene.add(instanced(trunkGeo(2.4), plastic(0x6b4a32), pines, true));
    scene.add(instanced(cactusGeo(), plastic(0x3e7a45), cacti, false));
    scene.add(instanced(lampGeo(), plastic(0x2c3138), lamps, false));
    const heads = instanced(boxGeo(0.55, 0.12, 0.28), plastic(0xfff1c9, 0xffe2a8), lamps.map((mx) => {
      const p = new THREE.Vector3();
      const qq = new THREE.Quaternion();
      const s = new THREE.Vector3();
      mx.decompose(p, qq, s);
      const mm = new THREE.Matrix4();
      mm.compose(p.add(new THREE.Vector3(0, 4.15, 0)), qq, s);
      return mm;
    }), false);
    scene.add(heads);
    // Tree trunks collide, lightly.
    for (const mx of palms) {
      const p = new THREE.Vector3();
      mx.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
      this.collision.add({ id: `palm-${p.x.toFixed(0)}-${p.z.toFixed(0)}`, x: p.x, z: p.z, hx: 0.4, hz: 0.4, rot: 0, minY: 0, maxY: 4 });
    }
    for (const mx of pines) {
      const p = new THREE.Vector3();
      mx.decompose(p, new THREE.Quaternion(), new THREE.Vector3());
      this.collision.add({ id: `pine-${p.x.toFixed(0)}-${p.z.toFixed(0)}`, x: p.x, z: p.z, hx: 0.45, hz: 0.45, rot: 0, minY: 0, maxY: 6 });
    }
  }

  private blocked(x: number, z: number) {
    if (this.waterDepth(x, z) > 0) return true;
    if (this.nearPaved(x, z) < 8) return true;
    if (distToPolyline(this.railMid, x, z) < 16) return true;
    for (const t of this.tracks.values()) {
      if (distToPolyline(t.poly, x, z) < t.width) return true;
    }
    if (Math.abs(x - RUNWAY.x) < RUNWAY.len / 2 + 8 && Math.abs(z - RUNWAY.z) < RUNWAY.w / 2 + 8) return true;
    if (Math.hypot(x - 190, z + 466) < 40) return true;
    if (Math.hypot(x - 112, z + 470) < 16) return true;
    return false;
  }

  private dressBeach(batch: Batch, scene: THREE.Scene) {
    // Lifeguard chair
    batch.box(1.6, 0.2, 1.6, 132, 1.7, -498, 0xf4f4f4);
    batch.box(0.15, 1.7, 0.15, 131.4, 0.85, -497.4, 0xd23b3b);
    batch.box(0.15, 1.7, 0.15, 132.6, 0.85, -498.6, 0xf4f4f4);
    const lg = signPlane([{ text: "GUARD", size: 42, color: "#f4efe6" }], "#d23b3b", 1.8, 0.7);
    lg.position.set(132, 2.15, -497.1);
    scene.add(lg);
    const welcome = signPlane(
      [
        { text: "SHELL BEACH", size: 58, color: "#102028" },
        { text: "CORAL COUNTY", size: 32, color: "#1f6b8a" },
        { text: "THE BLUE SUV IS YOURS", size: 26, color: "#9a3412" },
      ],
      "#f4efe6",
      7.5,
      3.2,
    );
    welcome.position.set(164, 2.2, -458);
    welcome.rotation.y = Math.PI;
    scene.add(welcome);
    // Umbrellas
    for (const [x, z, c] of [[228, -508, 0xff6b4a], [300, -512, 0xffd23a], [118, -518, 0x3d7ea6]] as const) {
      const pole = new THREE.Mesh(boxGeo(0.12, 1.6, 0.12), plastic(0xf4f4f4));
      pole.position.set(x, 0.8, z);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.45, 8), plastic(c));
      top.position.set(x, 1.7, z);
      scene.add(pole, top);
    }
    // Cottages between highway and the sand
    for (const [x, z] of [[70, -200], [250, -190], [320, -205], [400, -185], [-40, -200]] as const) {
      if (Math.abs(x - 150) < 16) continue;
      this.building(batch, x, z, 8, 7, 4.5, x < 0 ? 0xd7a45a : 0xf2efe6, 0xc47a4a, x + 3);
    }
    const rent = signPlane([{ text: "SHELL RENTALS", size: 36, color: "#102028" }], "#f4efe6", 5, 1.2);
    rent.position.set(96, 3.6, -452);
    scene.add(rent);
    this.building(batch, 96, -458, 9, 6, 4, 0xf2efe6, 0xe7c98a, 1);
  }

  private pier(batch: Batch, scene: THREE.Scene) {
    batch.box(8, 0.35, 100, 400, 0.9, -560, 0xc4a882, 0, { cast: true });
    this.surfaces.push({ x: 400, z: -560, hx: 4, hz: 50, rot: 0, y0: 1.08, y1: 1.08 });
    for (let i = 0; i < 8; i++) {
      const z = -520 - i * 12;
      batch.box(0.35, 1.4, 0.35, 396.2, 0.5, z, 0x8a5a32, 0, { cast: false });
      batch.box(0.35, 1.4, 0.35, 403.8, 0.5, z, 0x8a5a32, 0, { cast: false });
    }
    for (let i = 0; i < 10; i++) {
      const z = -518 - i * 9;
      this.collision.add({ id: `pier-l-${i}`, x: 395.6, z, hx: 0.2, hz: 0.5, rot: 0, minY: 1, maxY: 2.1 });
      this.collision.add({ id: `pier-r-${i}`, x: 404.4, z, hx: 0.2, hz: 0.5, rot: 0, minY: 1, maxY: 2.1 });
      batch.box(0.12, 0.9, 0.8, 395.6, 1.55, z, 0xf4f4f4, 0, { cast: false });
      batch.box(0.12, 0.9, 0.8, 404.4, 1.55, z, 0xf4f4f4, 0, { cast: false });
    }
    // Lighthouse
    const bands = [0xf4f4f4, 0xd23b3b, 0xf4f4f4, 0xd23b3b, 0xf4f4f4];
    bands.forEach((c, i) => batch.box(3.2 - i * 0.15, 2.1, 3.2 - i * 0.15, 400, 1.2 + i * 2.1, -600, c));
    const lamp = new THREE.Mesh(boxGeo(2.2, 1.4, 2.2), plastic(0xfff1c9, 0xffe2a8));
    lamp.position.set(400, 12.2, -600);
    scene.add(lamp);
    this.collision.add({ id: "lighthouse", x: 400, z: -600, hx: 1.8, hz: 1.8, rot: 0, minY: 0, maxY: 13 });
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(boxGeo(1.6, 0.5, 4.2), plastic(0xf4f4f4));
    hull.position.y = 0.3;
    const cabin = new THREE.Mesh(boxGeo(1.2, 0.7, 1.4), plastic(0x1f6b8a));
    cabin.position.set(0, 0.8, -0.4);
    boat.add(hull, cabin);
    boat.position.set(418, -0.15, -545);
    boat.rotation.y = 0.4;
    scene.add(boat);
  }

  private tunnel(batch: Batch, scene: THREE.Scene) {
    const x = TUNNEL.x;
    const z0 = TUNNEL.z - TUNNEL.len / 2;
    const z1 = TUNNEL.z + TUNNEL.len / 2;
    batch.box(1.6, 5.2, TUNNEL.len, x - 7.2, 2.6, TUNNEL.z, 0x6e6a64);
    batch.box(1.6, 5.2, TUNNEL.len, x + 7.2, 2.6, TUNNEL.z, 0x6e6a64);
    batch.box(16, 0.6, TUNNEL.len, x, 5.3, TUNNEL.z, 0x5c5954, 0, { cast: true });
    this.collision.add({ id: "tun-l", x: x - 7.2, z: TUNNEL.z, hx: 0.9, hz: TUNNEL.len / 2, rot: 0, minY: 0, maxY: 5.2 });
    this.collision.add({ id: "tun-r", x: x + 7.2, z: TUNNEL.z, hx: 0.9, hz: TUNNEL.len / 2, rot: 0, minY: 0, maxY: 5.2 });
    this.collision.add({ id: "tun-roof", x, z: TUNNEL.z, hx: 8, hz: TUNNEL.len / 2, rot: 0, minY: 4.9, maxY: 5.8 });
    for (const z of [z0, z1]) {
      batch.box(16, 6, 0.8, x, 3, z, 0x8a847c);
    }
    for (let i = 0; i < 4; i++) {
      const z = z0 + 8 + i * 10;
      const glow = new THREE.Mesh(boxGeo(0.4, 0.12, 0.8), plastic(0xffe2a8, 0xffe2a8));
      glow.position.set(x, 4.5, z);
      scene.add(glow);
    }
    void z1;
  }

  private peaks(batch: Batch) {
    const peaks = [
      { x: -80, z: 390, h: 58, r: 18 },
      { x: -430, z: 440, h: 72, r: 20 },
      { x: -410, z: 170, h: 42, r: 14 },
      { x: -60, z: 250, h: 32, r: 11 },
      { x: -250, z: 450, h: 40, r: 13 },
    ];
    for (const p of peaks) {
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const k = 1 - i / tiers;
        const hh = p.h / tiers;
        const snow = i === tiers - 1;
        batch.box(p.r * 2 * k, hh, p.r * 2 * k * 0.85, p.x, hh * i + hh / 2, p.z, snow ? 0xeef3f6 : 0x8a847c, i * 0.2);
      }
      this.collision.add({
        id: `peak-${p.x}`,
        x: p.x,
        z: p.z,
        hx: p.r * 0.72,
        hz: p.r * 0.62,
        rot: 0,
        minY: 0,
        maxY: p.h * 0.45,
      });
    }
  }

  private desertRocks(batch: Batch) {
    const mesas = [
      { x: -180, z: -470, w: 26, d: 16, h: 12 },
      { x: -430, z: -210, w: 18, d: 12, h: 8 },
      { x: -90, z: -340, w: 20, d: 14, h: 10 },
    ];
    for (const m of mesas) {
      batch.box(m.w, m.h * 0.7, m.d, m.x, m.h * 0.35, m.z, 0xc46b4a);
      batch.box(m.w * 0.7, m.h * 0.35, m.d * 0.7, m.x, m.h * 0.85, m.z, 0xd7a45a);
      this.collision.add({
        id: `mesa-${m.x}`,
        x: m.x,
        z: m.z,
        hx: m.w / 2,
        hz: m.d / 2,
        rot: 0,
        minY: 0,
        maxY: m.h,
      });
    }
    const rnd = mulberry32(99);
    for (let i = 0; i < 12; i++) {
      const x = -40 - rnd() * 420;
      const z = -260 - rnd() * 220;
      if (this.blocked(x, z)) continue;
      const s = 4 + rnd() * 6;
      const geo = new THREE.SphereGeometry(s, 8, 6);
      geo.scale(1, 0.38, 1);
      batch.add(geo, plastic(0xe0b56a), x, s * 0.12, z, rnd() * 3, 0, 0, false, true);
    }
  }

  private helipads(scene: THREE.Scene) {
    const tex = helipadTexture();
    for (const h of HELIPADS) {
      const geo = new THREE.PlaneGeometry(12, 12);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
      mesh.position.set(h.x, h.y + 0.04, h.z);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }

  private waters(scene: THREE.Scene) {
    const add = (w: number, d: number, x: number, z: number) => {
      const mat = waterMaterial();
      this.waterMats.push(mat);
      const geo = new THREE.PlaneGeometry(w, d, 24, 24);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, -0.25, z);
      scene.add(mesh);
    };
    add(1400, 260, 0, -650);
    add(260, 760, 650, -140);
  }

  private makeBeacon(scene: THREE.Scene) {
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 48, 8, 1, true),
      new THREE.MeshLambertMaterial({
        color: 0xff6b4a,
        emissive: new THREE.Color(0xff6b4a),
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
      }),
    );
    this.beacon.visible = false;
    scene.add(this.beacon);
  }

  private makeClouds(scene: THREE.Scene) {
    const mat = new THREE.MeshLambertMaterial({
      color: 0xfffdf8,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const puff = new THREE.Mesh(boxGeo(16 + k * 7, 1.4, 9), mat);
        puff.position.set(k * 7 - 7, (k % 2) * 0.4, (k - 1) * 1.6);
        g.add(puff);
      }
      g.position.set(-420 + i * 190, 128 + (i % 2) * 16, -60 + (i % 3) * 140);
      scene.add(g);
      this.clouds.push({ mesh: g, speed: 2.2 + (i % 3) });
    }
  }

  private makeSeagulls(scene: THREE.Scene) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Group();
      const body = new THREE.Mesh(boxGeo(0.25, 0.12, 0.45), plastic(0xf7f7f7));
      const wingL = new THREE.Mesh(boxGeo(0.7, 0.04, 0.18), plastic(0xf7f7f7));
      const wingR = new THREE.Mesh(boxGeo(0.7, 0.04, 0.18), plastic(0xf7f7f7));
      wingL.position.x = -0.4;
      wingR.position.x = 0.4;
      mesh.add(body, wingL, wingR);
      scene.add(mesh);
      this.seagulls.push({
        mesh,
        a: (i / 6) * Math.PI * 2,
        r: 18 + i * 6,
        cx: 220 + i * 20,
        cz: -500,
        y: 8 + i,
      });
    }
  }

  update(dt: number, camX: number, camZ: number) {
    for (const m of this.waterMats) m.uniforms.uTime.value += dt;
    this.sky.position.set(camX, 0, camZ);
    if (this.fountain) {
      const s = 0.85 + Math.sin(performance.now() * 0.004) * 0.15;
      this.fountain.scale.y = s;
    }
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 700) c.mesh.position.x = -700;
    }
    const t = performance.now() * 0.001;
    for (const s of this.seagulls) {
      s.a += dt * 0.35;
      s.mesh.position.set(s.cx + Math.cos(s.a) * s.r, s.y + Math.sin(t * 2 + s.a) * 0.4, s.cz + Math.sin(s.a) * s.r * 0.6);
      s.mesh.rotation.y = -s.a;
      const wing = Math.sin(t * 6 + s.a) * 0.6;
      s.mesh.children[1].rotation.z = wing;
      s.mesh.children[2].rotation.z = -wing;
    }
  }

  setBeacon(x: number | null, z?: number) {
    if (x === null || z === undefined) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    this.beacon.position.set(x, 24, z);
  }

  groundY(x: number, z: number, mode: "land" | "air"): number {
    let y = this.rawWater(x, z) > 0.8 ? -3.6 : 0;
    for (const s of this.surfaces) {
      if (mode === "land" && s.airOnly) continue;
      const h = this.surfaceHeight(s, x, z);
      if (h !== null && h > y) y = h;
    }
    return y;
  }

  private surfaceHeight(s: Surface, x: number, z: number): number | null {
    const dx = x - s.x;
    const dz = z - s.z;
    const cos = Math.cos(s.rot);
    const sin = Math.sin(s.rot);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) > s.hx || Math.abs(lz) > s.hz) return null;
    const t = s.hz < 1e-4 ? 0 : (lz / s.hz + 1) / 2;
    return s.y0 + (s.y1 - s.y0) * t;
  }

  paved(x: number, z: number): boolean {
    if (this.nearPaved(x, z) < 0.2) return true;
    const rr = Math.hypot(x - ROUNDABOUT.x, z - ROUNDABOUT.z);
    if (rr < ROUNDABOUT.outer && rr > ROUNDABOUT.inner - 0.5) return true;
    for (const rect of this.rects) {
      if (Math.abs(x - rect.x) < rect.hx && Math.abs(z - rect.z) < rect.hz) return true;
    }
    for (const t of this.tracks.values()) {
      if (distToPolyline(t.poly, x, z) < t.width / 2 - 0.4) return true;
    }
    return false;
  }

  private nearPaved(x: number, z: number): number {
    let best = Infinity;
    for (const s of this.segs) {
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((x - s.x1) * dx + (z - s.z1) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = s.x1 + dx * t;
      const pz = s.z1 + dz * t;
      best = Math.min(best, Math.hypot(x - px, z - pz) - s.half);
    }
    return best;
  }

  rawWater(x: number, z: number): number {
    let depth = 0;
    if (z < WATER_Z) depth = Math.max(depth, WATER_Z - z);
    if (x > WATER_X) depth = Math.max(depth, x - WATER_X);
    return depth;
  }

  waterDepth(x: number, z: number): number {
    if (this.rawWater(x, z) <= 0) return 0;
    for (const s of this.surfaces) {
      if (s.airOnly) continue;
      if (this.surfaceHeight(s, x, z) !== null && s.y0 > 0.4) return 0;
    }
    return this.rawWater(x, z);
  }

  inDark(x: number, z: number) {
    return Math.abs(x - TUNNEL.x) < 6 && Math.abs(z - TUNNEL.z) < TUNNEL.len / 2 - 1;
  }

  collide(x: number, z: number, radius: number, feetY: number, height: number, ignore: string | null) {
    return this.collision.resolve(x, z, radius, feetY, height, ignore);
  }

  sampleTrack(id: string, s: number) {
    const t = this.tracks.get(id);
    if (!t) return null;
    const p = sample(t.poly, s);
    return { x: p.x, z: p.z, yaw: p.yaw };
  }

  trackAt(x: number, z: number): string | null {
    let best: string | null = null;
    let bestD = 8;
    for (const [id, t] of this.tracks) {
      const d = distToPolyline(t.poly, x, z);
      if (d < t.width / 2 && d < bestD) {
        best = id;
        bestD = d;
      }
    }
    return best;
  }

  linesForMap() {
    return {
      roads: this.minimap.roads,
      rails: this.minimap.rails,
      tracks: [...this.tracks.entries()].map(([id, t]) => ({
        id,
        pts: t.poly.pts.filter((_, i) => i % 2 === 0),
      })),
    };
  }
}

function ribbon(poly: Polyline, width: number, y: number, uvScale: number) {
  return ribbonShift(poly, 0, width, y, uvScale);
}

function ribbonShift(poly: Polyline, shift: number, width: number, y: number, uvScale: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const n = poly.pts.length;
  for (let i = 0; i < n; i++) {
    const p = sample(poly, poly.cum[i] ?? 0);
    const o1 = shift + width / 2;
    const o2 = shift - width / 2;
    pos.push(p.x + p.lx * o1, y, p.z + p.lz * o1);
    pos.push(p.x + p.lx * o2, y, p.z + p.lz * o2);
    const v = (poly.cum[i] ?? 0) / uvScale;
    uv.push(0, v, 1, v);
  }
  const segs = Math.max(0, n - 1);
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cast: boolean) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  if (!mats.length) mesh.count = 0;
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function trunkGeo(h: number) {
  const g = cylGeo(0.18, 0.28, h, 6).clone();
  g.translate(0, h / 2, 0);
  return g;
}

function palmGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const g = boxGeo(0.35, 0.08, 2.1).clone();
    const yaw = (i / 5) * Math.PI * 2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, yaw, 0, "YXZ"));
    g.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(yaw) * 0.7, 4.15, Math.cos(yaw) * 0.7),
        q,
        new THREE.Vector3(1, 1, 1),
      ),
    );
    parts.push(g);
  }
  return mergeSafe(parts);
}

function pineGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = cylGeo(0.05, 1.3 - i * 0.3, 1.5, 6).clone();
    g.translate(0, 2.6 + i * 0.9, 0);
    parts.push(g);
  }
  return mergeSafe(parts);
}

function cactusGeo() {
  const a = boxGeo(0.35, 1.8, 0.35).clone();
  a.translate(0, 0.9, 0);
  const b = boxGeo(0.22, 0.7, 0.22).clone();
  b.translate(0.45, 1.15, 0);
  const c = boxGeo(0.7, 0.22, 0.22).clone();
  c.translate(0.2, 1.15, 0);
  return mergeSafe([a, b, c]);
}

function lampGeo() {
  const g = boxGeo(0.16, 4.1, 0.16).clone();
  g.translate(0, 2.05, 0);
  return g;
}

function mergeSafe(parts: THREE.BufferGeometry[]) {
  const merged = parts.length === 1 ? parts[0] : mergeImport(parts);
  return merged ?? parts[0];
}

function mergeImport(parts: THREE.BufferGeometry[]) {
  // local import avoided; BufferGeometryUtils already used via a tiny wrapper
  return mergeGeometriesLazy(parts);
}

function mergeGeometriesLazy(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts, false);
}
