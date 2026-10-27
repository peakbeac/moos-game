import * as THREE from "three";
import { boxGeo, plastic, signPlane } from "./geom";
import { CROSSINGS, STATIONS } from "./layout";
import { buildPolyline, closestS, sample, type Polyline } from "./polyline";

interface Car {
  mesh: THREE.Group;
  offset: number;
}

export class TrainSystem {
  commuterS = 0;
  commuterSpeed = 0;
  commuterDwell = 0;
  commuterNext = 0;
  freightS = 40;
  speederS = 0;
  speederSpeed = 0;
  speederOccupied = false;
  riding = false;
  stations: { name: string; s: number; x: number; z: number }[] = [];
  private commuter: Car[] = [];
  private freight: Car[] = [];
  private speeder!: Car;
  private gates: { arm: THREE.Object3D; lampL: THREE.MeshLambertMaterial; lampR: THREE.MeshLambertMaterial }[] = [];
  private flash = 0;
  crossingActive = false;

  constructor(
    private mid: Polyline,
    private inner: Polyline,
    private outer: Polyline,
  ) {}

  build(scene: THREE.Scene) {
    this.commuter = this.makeCommuter();
    this.freight = this.makeFreight();
    this.speeder = { mesh: this.makeSpeeder(), offset: 0 };
    for (const c of [...this.commuter, ...this.freight, this.speeder]) scene.add(c.mesh);

    this.stations = STATIONS.map((s) => ({ ...s, s: closestS(this.mid, s.x, s.z) })).sort((a, b) => a.s - b.s);
    const beach = this.stations.find((s) => s.name === "Shell Beach");
    this.speederS = beach ? closestS(this.inner, beach.x, beach.z) : 0;
    const metro = this.stations.find((s) => s.name === "Metro Center");
    this.commuterS = metro?.s ?? this.mid.total * 0.5;
    this.freightS = this.outer.total * 0.35;

    for (const st of this.stations) this.buildStation(scene, st);
    for (const c of CROSSINGS) this.buildCrossing(scene, c);
    this.placeAll();
  }

  private buildStation(scene: THREE.Scene, st: { name: string; s: number; x: number; z: number }) {
    const p = sample(this.mid, st.s);
    const px = p.x + p.lx * 13;
    const pz = p.z + p.lz * 13;
    const yaw = Math.atan2(p.tx, p.tz);
    const deck = new THREE.Mesh(boxGeo(7, 0.8, 26), plastic(0xd9d3c7));
    deck.position.set(px, 0.4, pz);
    deck.rotation.y = yaw;
    deck.receiveShadow = true;
    deck.castShadow = true;
    scene.add(deck);
    const roof = new THREE.Mesh(boxGeo(6, 0.2, 18), plastic(0x2c4a55));
    roof.position.set(px + p.lx * 0.2, 3.3, pz);
    roof.rotation.y = yaw;
    scene.add(roof);
    for (const s of [-6, 6]) {
      const post = new THREE.Mesh(boxGeo(0.25, 3, 0.25), plastic(0xf2f2f2));
      post.position.set(px + p.tx * s, 1.6, pz + p.tz * s);
      scene.add(post);
    }
    const sign = signPlane(
      [
        { text: st.name.toUpperCase(), size: 54, color: "#102028" },
        { text: "TIDE LINE", size: 28, color: "#1f8a8a" },
      ],
      "#f4efe6",
      7.2,
      2.2,
    );
    sign.position.set(px + p.lx * 2.2, 2.4, pz);
    sign.rotation.y = yaw + Math.PI / 2;
    scene.add(sign);
  }

  private buildCrossing(
    scene: THREE.Scene,
    c: { x: number; z: number; roadYaw: number; roadHalf: number },
  ) {
    const rightX = Math.cos(c.roadYaw);
    const rightZ = -Math.sin(c.roadYaw);
    for (const side of [-1, 1]) {
      const x = c.x + rightX * side * (c.roadHalf + 1.4);
      const z = c.z + rightZ * side * (c.roadHalf + 1.4);
      const pole = new THREE.Mesh(boxGeo(0.22, 3.2, 0.22), plastic(0x22262c));
      pole.position.set(x, 1.6, z);
      pole.castShadow = true;
      scene.add(pole);
      const cross = new THREE.Group();
      const a = new THREE.Mesh(boxGeo(1.1, 0.12, 0.12), plastic(0xf4f4f4));
      const b = new THREE.Mesh(boxGeo(1.1, 0.12, 0.12), plastic(0xf4f4f4));
      a.rotation.z = 0.7;
      b.rotation.z = -0.7;
      cross.add(a, b);
      cross.position.set(x, 2.7, z);
      scene.add(cross);
      const lampL = new THREE.MeshLambertMaterial({ color: 0x3a1414, emissive: new THREE.Color(0xff2a2a), emissiveIntensity: 0 });
      const lampR = lampL.clone();
      const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lampL);
      const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), lampR);
      l1.position.set(x - 0.2, 3.15, z);
      l2.position.set(x + 0.2, 3.15, z);
      scene.add(l1, l2);
      const hinge = new THREE.Group();
      hinge.position.set(x, 1.15, z);
      hinge.rotation.y = c.roadYaw + (side < 0 ? 0 : Math.PI);
      const arm = new THREE.Mesh(boxGeo(c.roadHalf + 1.2, 0.12, 0.18), plastic(0xf4f4f4));
      arm.position.x = (c.roadHalf + 1.2) / 2;
      const stripe = new THREE.Mesh(boxGeo(c.roadHalf + 1.2, 0.13, 0.08), plastic(0xd23b3b));
      stripe.position.x = arm.position.x;
      hinge.add(arm, stripe);
      hinge.rotation.z = 1.15;
      scene.add(hinge);
      this.gates.push({ arm: hinge, lampL, lampR });
    }
  }

  private makeCommuter(): Car[] {
    const cars: Car[] = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(boxGeo(2.45, 2.5, 6.4), plastic(0xf4f7f8));
      body.position.y = 1.7;
      body.castShadow = true;
      g.add(body);
      const band = new THREE.Mesh(boxGeo(2.5, 0.28, 6.4), plastic(0x148a86));
      band.position.y = 1.15;
      g.add(band);
      const glass = new THREE.Mesh(
        boxGeo(2.2, 0.7, 5.2),
        new THREE.MeshLambertMaterial({ color: 0x173044, emissive: new THREE.Color(0x8ecae6), emissiveIntensity: 0.08 }),
      );
      glass.position.y = 2.35;
      g.add(glass);
      if (i === 0) {
        const nose = new THREE.Mesh(boxGeo(2.2, 1.3, 0.8), plastic(0x148a86));
        nose.position.set(0, 1.5, 3.3);
        g.add(nose);
        const lamp = new THREE.Mesh(
          boxGeo(1.4, 0.16, 0.1),
          new THREE.MeshLambertMaterial({ color: 0xfff4d2, emissive: new THREE.Color(0xfff4d2), emissiveIntensity: 0.8 }),
        );
        lamp.position.set(0, 1.7, 3.7);
        g.add(lamp);
      }
      cars.push({ mesh: g, offset: -i * 7.3 });
    }
    return cars;
  }

  private makeFreight(): Car[] {
    const cars: Car[] = [];
    const paints = [0x8c2f2f, 0xd7a45a, 0x2f6b4a, 0x3d4f63, 0x8c2f2f];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      if (i === 2) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 5.4, 12), plastic(paints[i]));
        tank.rotation.x = Math.PI / 2;
        tank.position.y = 1.7;
        g.add(tank);
      } else {
        const body = new THREE.Mesh(boxGeo(2.4, i === 0 ? 2.6 : 2.3, 6.2), plastic(paints[i]));
        body.position.y = 1.7;
        body.castShadow = true;
        g.add(body);
      }
      const bed = new THREE.Mesh(boxGeo(2.3, 0.25, 6.4), plastic(0x2a2a2a));
      bed.position.y = 0.55;
      g.add(bed);
      if (i === 0) {
        const lamp = new THREE.Mesh(
          boxGeo(1.2, 0.16, 0.1),
          new THREE.MeshLambertMaterial({ color: 0xfff4d2, emissive: new THREE.Color(0xfff4d2), emissiveIntensity: 0.7 }),
        );
        lamp.position.set(0, 2.4, 3.2);
        g.add(lamp);
      }
      cars.push({ mesh: g, offset: i * 7.5 });
    }
    return cars;
  }

  private makeSpeeder(): THREE.Group {
    const g = new THREE.Group();
    const base = new THREE.Mesh(boxGeo(1.7, 0.4, 3.1), plastic(0xf2c14e));
    base.position.y = 0.7;
    base.castShadow = true;
    g.add(base);
    const cage = new THREE.Mesh(boxGeo(1.5, 0.08, 1.5), plastic(0x1a1a1a));
    cage.position.y = 1.7;
    g.add(cage);
    for (const [x, z] of [[-0.65, -0.6], [0.65, -0.6], [-0.65, 0.6], [0.65, 0.6]] as const) {
      const post = new THREE.Mesh(boxGeo(0.08, 1.1, 0.08), plastic(0x1a1a1a));
      post.position.set(x, 1.2, z);
      g.add(post);
    }
    const seat = new THREE.Mesh(boxGeo(0.7, 0.35, 0.7), plastic(0xc4534a));
    seat.position.set(-0.28, 0.95, -0.1);
    g.add(seat);
    return g;
  }

  update(dt: number, throttleAxis: number) {
    const cruise = 18;
    if (this.commuterDwell > 0) {
      this.commuterDwell -= dt;
      this.commuterSpeed = 0;
      if (this.commuterDwell <= 0) this.commuterNext = (this.commuterNext + 1) % this.stations.length;
    } else if (this.stations.length) {
      const target = this.stations[this.commuterNext];
      let ahead = target.s - this.commuterS;
      if (ahead < 0) ahead += this.mid.total;
      if (ahead < 1.4) {
        this.commuterSpeed = 0;
        this.commuterDwell = 6.5;
      } else if (ahead < 55) this.commuterSpeed = Math.min(cruise, Math.max(2.2, ahead * 0.38));
      else this.commuterSpeed = cruise;
    }
    this.commuterS = wrap(this.commuterS + this.commuterSpeed * dt, this.mid.total);
    this.freightS = wrap(this.freightS - 14 * dt, this.outer.total);

    if (this.speederOccupied) {
      this.speederSpeed += throttleAxis * 12 * dt;
      if (Math.abs(throttleAxis) < 0.05) {
        const drop = Math.min(Math.abs(this.speederSpeed), 3.2 * dt);
        this.speederSpeed -= Math.sign(this.speederSpeed) * drop;
      }
      this.speederSpeed = Math.max(-10, Math.min(28, this.speederSpeed));
    } else if (!this.riding) {
      this.speederSpeed = 0;
    }
    this.speederS = wrap(this.speederS + this.speederSpeed * dt, this.inner.total);
    this.placeAll();
    this.flash += dt;
    this.updateGates();
  }

  private placeAll() {
    this.placeCars(this.commuter, this.mid, this.commuterS, false);
    this.placeCars(this.freight, this.outer, this.freightS, true);
    const sp = sample(this.inner, this.speederS);
    this.speeder.mesh.position.set(sp.x, 0.35, sp.z);
    this.speeder.mesh.rotation.y = sp.yaw;
  }

  private placeCars(cars: Car[], poly: Polyline, head: number, reverse: boolean) {
    for (const c of cars) {
      const p = sample(poly, head + c.offset);
      c.mesh.position.set(p.x, 0.42, p.z);
      c.mesh.rotation.y = reverse ? p.yaw + Math.PI : p.yaw;
    }
  }

  private updateGates() {
    let active = false;
    const points = this.trainPoints();
    for (const c of CROSSINGS) {
      for (const p of points) {
        if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 78 * 78) active = true;
      }
    }
    this.crossingActive = active;
    const target = active ? 0.02 : 1.2;
    const blink = active && Math.floor(this.flash * 6) % 2 === 0;
    for (const g of this.gates) {
      const current = g.arm.rotation.z;
      g.arm.rotation.z = current + (target - current) * 0.08;
      g.lampL.emissiveIntensity = blink ? 1 : 0;
      g.lampR.emissiveIntensity = blink ? 0 : active ? 0.9 : 0;
    }
  }

  trainPoints() {
    const pts: { x: number; z: number; yaw: number; len: number }[] = [];
    for (const c of this.commuter) {
      pts.push({ x: c.mesh.position.x, z: c.mesh.position.z, yaw: c.mesh.rotation.y, len: 3.2 });
    }
    for (const c of this.freight) {
      pts.push({ x: c.mesh.position.x, z: c.mesh.position.z, yaw: c.mesh.rotation.y, len: 3.2 });
    }
    pts.push({
      x: this.speeder.mesh.position.x,
      z: this.speeder.mesh.position.z,
      yaw: this.speeder.mesh.rotation.y,
      len: 1.7,
    });
    return pts;
  }

  nearSpeeder(x: number, z: number) {
    const p = this.speeder.mesh.position;
    return Math.hypot(p.x - x, p.z - z);
  }

  nearCommuter(x: number, z: number) {
    let best = Infinity;
    for (const c of this.commuter) {
      best = Math.min(best, Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z));
    }
    return best;
  }

  commuterSlow() {
    return this.commuterSpeed < 2.2;
  }

  seatPose() {
    const car = this.commuter[1] ?? this.commuter[0];
    const p = car.mesh.position;
    const yaw = car.mesh.rotation.y;
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    return { x: p.x + lx * 0.4, y: p.y + 1.15, z: p.z + lz * 0.4, yaw };
  }

  speederPose() {
    const p = this.speeder.mesh.position;
    return { x: p.x, y: 0.9, z: p.z, yaw: this.speeder.mesh.rotation.y };
  }

  sideOfSpeeder() {
    const p = sample(this.inner, this.speederS);
    return { x: p.x + p.lx * 3.2, z: p.z + p.lz * 3.2, yaw: p.yaw };
  }
}

function wrap(s: number, total: number) {
  if (total <= 0) return 0;
  return ((s % total) + total) % total;
}

export function railLoop(): Polyline {
  const left = -475;
  const right = 475;
  const bottom = -155;
  const top = 470;
  const r = 34;
  const pts: { x: number; z: number }[] = [];
  const pushArc = (cx: number, cz: number, a0: number, a1: number) => {
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = a0 + ((a1 - a0) * i) / steps;
      pts.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r });
    }
  };
  // Clockwise: south edge heading east, then north, west, south.
  for (let x = left + r; x <= right - r; x += 20) pts.push({ x, z: bottom });
  pushArc(right - r, bottom + r, -Math.PI / 2, 0);
  for (let z = bottom + r; z <= top - r; z += 20) pts.push({ x: right, z });
  pushArc(right - r, top - r, 0, Math.PI / 2);
  for (let x = right - r; x >= left + r; x -= 20) pts.push({ x, z: top });
  pushArc(left + r, top - r, Math.PI / 2, Math.PI);
  for (let z = top - r; z >= bottom + r; z -= 20) pts.push({ x: left, z });
  pushArc(left + r, bottom + r, Math.PI, Math.PI * 1.5);
  return buildPolyline(pts, 8, true);
}
