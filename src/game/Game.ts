import * as THREE from "three";
import { Sfx } from "./audio";
import { buildAvatar, poseAvatar } from "./avatar";
import { drawMap, formatClock, mapToWorld, type MapDraw } from "./hud";
import {
  AIRCRAFT,
  BEACONS,
  INTRO_CAM,
  PARKED,
  POIS,
  SPAWN,
  regionName,
} from "./layout";
import {
  axisAllows,
  buildSignals,
  inIntersection,
  phaseAt,
  stepTraffic,
  trafficSpawns,
  travelAxis,
  updateSignals,
  type Signal,
} from "./traffic";
import { TrainSystem } from "./trains";
import {
  mph,
  resetVehicle,
  spawnVehicle,
  stepCar,
  stepHeli,
  stepPlane,
  updateVehiclePose,
  type Control,
  type Vehicle,
} from "./vehicles";
import { World } from "./world";

const HOLD = ["gas", "brake", "up", "down", "boost"] as const;
type Hold = (typeof HOLD)[number];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private world = new World();
  private vehicles: Vehicle[] = [];
  private trains!: TrainSystem;
  private signals: Signal[] = [];
  private avatar = buildAvatar();
  private sfx = new Sfx();
  private sun: THREE.DirectionalLight;
  private fill: THREE.PointLight;
  private keys = new Set<string>();
  private prev = new Set<string>();
  private look = false;
  private touch = { x: 0, y: 0, gas: false, brake: false, up: false, down: false, boost: false };
  private player = { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: SPAWN.yaw, vy: 0, grounded: true };
  private occupied: Vehicle | null = null;
  private started = false;
  private intro = true;
  private time = 0;
  private tickets = 0;
  private ticketAt = new Map<string, number>();
  private race = { track: "", next: 0, t0: 0, running: false, gate: -1, best: {} as Record<string, number> };
  private beacon: { x: number; z: number } | null = null;
  private lightsOn = false;
  private region = "";
  private toastTimer = 0;
  private acc = 0;
  private frames = 0;
  private fpsClock = 0;
  private qualityDropped = false;
  private mapOpen = false;
  private cardOpen = false;
  private helpOpen = false;
  private camYaw = SPAWN.yaw;
  private camPitch = 0.42;
  private camDist = 8;
  private touchUpWas = false;
  private focus = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.15, 1800);
    this.camera.position.set(INTRO_CAM.x, INTRO_CAM.y, INTRO_CAM.z);
    this.scene.background = new THREE.Color(0x9ec9ef);
    this.scene.fog = new THREE.Fog(0xc5d7e4, 140, 780);
    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0xe7c49a, 0.72);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 1.45);
    this.sun.position.set(-60, 90, -30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 180;
    this.sun.shadow.camera.left = -55;
    this.sun.shadow.camera.right = 55;
    this.sun.shadow.camera.top = 55;
    this.sun.shadow.camera.bottom = -55;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.PointLight(0xfff4dd, 0, 22);
    this.scene.add(this.fill);
    this.scene.add(this.avatar.group);
  }

  async load() {
    if (document.fonts?.ready) {
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1800))]);
    }
    this.world.build(this.scene);
    this.signals = buildSignals(this.scene, this.world.collision);
    this.trains = new TrainSystem(this.world.railMid, this.world.railInner, this.world.railOuter);
    this.trains.build(this.scene);
    for (const p of PARKED) {
      const v = spawnVehicle(p.id, p.id, p);
      this.scene.add(v.group);
      this.vehicles.push(v);
    }
    for (const p of AIRCRAFT) {
      const v = spawnVehicle(p.id, p.id, p);
      this.scene.add(v.group);
      this.vehicles.push(v);
    }
    for (const t of trafficSpawns()) {
      const v = spawnVehicle(t.catalog, t.uid, t);
      v.ai = {
        mode: t.mode,
        pts: t.pts,
        index: t.index ?? 0,
        dir: t.dir ?? 1,
        trackId: t.trackId,
        s: t.s ?? 0,
      };
      this.scene.add(v.group);
      this.vehicles.push(v);
    }
    this.bindInput();
    this.bindUi();
    this.resize();
  }

  start() {
    this.started = true;
    this.sfx.resume();
    const title = document.getElementById("title");
    if (title) title.hidden = true;
    this.canvas.focus();
    this.toast("The Lumen iX is the blue one. Press F.");
  }

  private bindUi() {
    document.getElementById("start")?.addEventListener("click", () => this.start());
    document.getElementById("prompt")?.addEventListener("click", () => {
      if (this.started && !this.overlayOpen()) this.interact();
    });
    document.getElementById("help-btn")?.addEventListener("click", () => this.setHelp(true));
    document.getElementById("help-close")?.addEventListener("click", () => this.setHelp(false));
    document.getElementById("mute-btn")?.addEventListener("click", () => this.toggleMute());
    document.getElementById("map-close")?.addEventListener("click", () => this.setMap(false));
    document.getElementById("card-close")?.addEventListener("click", () => this.setCard(false));
    const keys = document.getElementById("map-keys");
    if (keys) {
      for (const b of BEACONS) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = b.name;
        btn.addEventListener("click", () => {
          this.beacon = { x: b.x, z: b.z };
          this.world.setBeacon(b.x, b.z);
          this.toast(`${b.name} marked.`);
        });
        keys.appendChild(btn);
      }
    }
    const mapCanvas = document.getElementById("map-canvas") as HTMLCanvasElement | null;
    mapCanvas?.addEventListener("click", (ev) => {
      const rect = mapCanvas.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * mapCanvas.width;
      const y = ((ev.clientY - rect.top) / rect.height) * mapCanvas.height;
      const w = mapToWorld(x, y, mapCanvas.width, mapCanvas.height);
      this.beacon = w;
      this.world.setBeacon(w.x, w.z);
    });
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches || "ontouchstart" in window;
    if (coarse) document.body.classList.add("show-touch");
  }

  private bindInput() {
    window.addEventListener("keydown", (e) => {
      const code = eventCode(e);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(code)) e.preventDefault();
      if (code) this.keys.add(code);
    });
    window.addEventListener("keyup", (e) => {
      const code = eventCode(e);
      if (code) this.keys.delete(code);
    });
    window.addEventListener("blur", () => this.keys.clear());
    window.addEventListener("resize", () => this.resize());
    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.focus();
      if (!this.started || this.overlayOpen()) return;
      const rect = this.canvas.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      if (document.body.classList.contains("show-touch") && localX < rect.width * 0.45) return;
      this.look = true;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.look) return;
      this.camYaw -= e.movementX * 0.005;
      this.camPitch = clamp(this.camPitch + e.movementY * 0.0035, 0.18, 1.15);
    });
    const endLook = () => {
      this.look = false;
    };
    this.canvas.addEventListener("pointerup", endLook);
    this.canvas.addEventListener("pointercancel", endLook);
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 0.6, 4.5, 16);
      },
      { passive: false },
    );
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    const stick = document.getElementById("stick");
    const knob = document.getElementById("knob");
    let stickId: number | null = null;
    let origin = { x: 0, y: 0 };
    stick?.addEventListener("pointerdown", (e) => {
      stickId = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stick.setPointerCapture(e.pointerId);
    });
    stick?.addEventListener("pointermove", (e) => {
      if (e.pointerId !== stickId) return;
      this.touch.x = clamp((e.clientX - origin.x) / 46, -1, 1);
      this.touch.y = clamp(-(e.clientY - origin.y) / 46, -1, 1);
      if (knob) {
        knob.style.left = `${44 + this.touch.x * 36}px`;
        knob.style.top = `${44 - this.touch.y * 36}px`;
      }
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== stickId) return;
      stickId = null;
      this.touch.x = 0;
      this.touch.y = 0;
      if (knob) {
        knob.style.left = "44px";
        knob.style.top = "44px";
      }
    };
    stick?.addEventListener("pointerup", endStick);
    stick?.addEventListener("pointercancel", endStick);

    for (const btn of document.querySelectorAll<HTMLButtonElement>("#touch-buttons button")) {
      const hold = btn.dataset.hold as Hold | undefined;
      const tap = btn.dataset.tap;
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        if (hold) this.touch[hold] = true;
      });
      const release = () => {
        if (hold) this.touch[hold] = false;
        if (tap === "action") this.interact();
        if (tap === "map") this.setMap(!this.mapOpen);
        if (tap === "reset") this.resetCurrent();
      };
      btn.addEventListener("pointerup", release);
      btn.addEventListener("pointercancel", () => {
        if (hold) this.touch[hold] = false;
      });
    }
  }

  run() {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= 1 / 60 && steps < 4) {
        this.step(1 / 60);
        this.acc -= 1 / 60;
        steps++;
      }
      this.draw();
      this.watchFps(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private step(dt: number) {
    this.time += dt;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) document.getElementById("toast")?.classList.remove("show");
    }
    updateSignals(this.signals, this.time);
    const paused = this.overlayOpen();
    const control = this.readControl();
    if (this.started && !paused && this.edge("KeyF")) this.interact();
    if (this.started && !paused && (this.edge("Enter"))) this.interact();
    if (this.started && this.edge("KeyM")) this.setMap(!this.mapOpen);
    if (this.started && this.edge("KeyN")) this.toggleMute();
    if (this.started && this.edge("KeyH") && !this.helpOpen) this.sfx.blip(660);
    if (this.started && this.edge("KeyL")) this.lightsOn = !this.lightsOn;
    if (this.started && this.edge("Escape")) {
      this.setMap(false);
      this.setCard(false);
      this.setHelp(false);
    }
    if (this.started && !paused && this.edge("KeyR")) this.resetCurrent();

    if (this.started && !paused && !this.intro && this.anyMove()) this.intro = false;
    if (this.started && this.intro && this.anyMove()) this.releaseIntro();

    this.trains.speederOccupied = this.trains.speederOccupied && this.started;
    this.trains.update(dt, this.trains.speederOccupied && !paused ? control.throttleAxis : 0);

    this.world.collision.dynamic = [];
    for (const v of this.vehicles) {
      this.world.collision.dynamic.push({
        id: v.uid,
        x: v.x,
        z: v.z,
        hx: Math.max(0.8, v.half.w),
        hz: Math.max(1.2, v.half.l),
        rot: v.yaw,
        minY: v.y,
        maxY: v.y + v.half.h + 0.4,
      });
    }
    if (!this.trains.riding) {
      for (const [i, p] of this.trains.trainPoints().entries()) {
        this.world.collision.dynamic.push({
          id: `train-${i}`,
          x: p.x,
          z: p.z,
          hx: 1.35,
          hz: p.len,
          rot: p.yaw,
          minY: 0,
          maxY: 3.4,
        });
      }
    }

    if (!this.started || paused) {
      poseAvatar(this.avatar, "idle", this.time, 0);
    } else if (this.trains.riding) {
      const seat = this.trains.seatPose();
      this.player.x = seat.x;
      this.player.y = seat.y;
      this.player.z = seat.z;
      this.player.yaw = seat.yaw;
      this.placeAvatar("sit");
      if (this.edge("KeyF") || this.edge("Enter")) {
        /* interact already handled */
      }
    } else if (this.trains.speederOccupied) {
      const seat = this.trains.speederPose();
      this.player.x = seat.x;
      this.player.y = seat.y;
      this.player.z = seat.z;
      this.player.yaw = seat.yaw;
      this.placeAvatar("sit");
    } else if (this.occupied) {
      const v = this.occupied;
      let result: "ok" | "drown" | "crash" = "ok";
      if (v.kind === "car") result = stepCar(v, control, dt, this.world);
      else if (v.kind === "plane") result = stepPlane(v, control, dt, this.world);
      else result = stepHeli(v, control, dt, this.world);
      if (result !== "ok") this.failRide(v, result);
      this.player.x = v.x;
      this.player.y = v.y;
      this.player.z = v.z;
      this.player.yaw = v.yaw;
      this.placeAvatar("sit");
      this.scoreLights(v);
      this.scoreLap(v);
    } else {
      this.stepFoot(dt, control);
    }

    if (this.started) stepTraffic(this.vehicles, dt, this.world, this.signals, this.time);
    for (const v of this.vehicles) updateVehiclePose(v);

    const name = regionName(this.player.x, this.player.z, this.world.waterDepth(this.player.x, this.player.z));
    if (name !== this.region) {
      this.region = name;
      const el = document.getElementById("region");
      if (el) el.textContent = name;
    }
    this.prev = new Set(this.keys);
    this.touchUpWas = this.touch.up;
  }

  private stepFoot(dt: number, control: Control) {
    const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 8.2 : 4.8;
    const depth = this.world.waterDepth(this.player.x, this.player.z);
    const scale = depth > 0 ? Math.max(0.32, 1 - depth * 0.045) : 1;
    const f = forward(this.camYaw);
    const r = right(this.camYaw);
    let mx = r.x * control.steer + f.x * Math.max(0, control.throttleAxis);
    let mz = r.z * control.steer + f.z * Math.max(0, control.throttleAxis);
    if (control.throttleAxis < 0) {
      mx -= f.x;
      mz -= f.z;
    }
    const mag = Math.hypot(mx, mz);
    if (mag > 0.01) {
      mx = (mx / mag) * speed * scale;
      mz = (mz / mag) * speed * scale;
      this.player.yaw = Math.atan2(mx, mz);
      this.intro = false;
    }
    this.player.x += mx * dt;
    this.player.z += mz * dt;
    const hit = this.world.collide(this.player.x, this.player.z, 0.42, this.player.y, 1.7, "player");
    this.player.x = hit.x;
    this.player.z = hit.z;
    this.player.vy -= 22 * dt;
    const jump = (this.edgeSpace() || (this.touch.up && !this.touchUpWas)) && this.player.grounded;
    if (jump && (this.keys.has("Space") || this.touch.up)) {
      this.player.vy = 7.2;
      this.player.grounded = false;
    }
    this.player.y += this.player.vy * dt;
    const gy = this.world.groundY(this.player.x, this.player.z, "land");
    if (depth > 0.4 && gy < 0.2) {
      const wade = -Math.min(0.55, depth * 0.06);
      if (this.player.y < wade) {
        this.player.y = wade;
        this.player.vy = 0;
        this.player.grounded = true;
      }
      if (depth > 18) {
        this.player.x = SPAWN.x;
        this.player.z = SPAWN.z;
        this.player.y = 0;
        this.player.vy = 0;
        this.toast("The current brought you back to Shell Beach.");
      }
    } else if (this.player.y <= gy) {
      this.player.y = gy;
      this.player.vy = 0;
      this.player.grounded = true;
    } else this.player.grounded = false;
    if (this.player.y < -2.5) {
      this.player.x = SPAWN.x;
      this.player.z = SPAWN.z;
      this.player.y = 0;
      this.player.vy = 0;
      this.toast("Back on the sand.");
    }
    this.placeAvatar(mag > 0.2 ? "walk" : "idle");
  }

  private edgeSpace() {
    return (this.keys.has("Space") && !this.prev.has("Space")) || false;
  }

  private placeAvatar(mode: "idle" | "walk" | "sit") {
    let x = this.player.x;
    let y = this.player.y;
    let z = this.player.z;
    let yaw = this.player.yaw;
    let scale = 1;
    if (this.occupied && mode === "sit") {
      const v = this.occupied;
      const local =
        v.kind === "plane"
          ? { x: 0, y: 0.42, z: 0.35, s: 0.7 }
          : v.kind === "heli"
            ? { x: 0.02, y: 0.48, z: 0.15, s: 0.62 }
            : { x: -0.34, y: 0.4, z: -0.12, s: 0.58 };
      const f = forward(v.yaw);
      const rt = right(v.yaw);
      x = v.x + rt.x * local.x + f.x * local.z;
      y = v.y + local.y;
      z = v.z + rt.z * local.x + f.z * local.z;
      yaw = v.yaw;
      scale = local.s;
    }
    this.avatar.group.scale.setScalar(scale);
    this.avatar.group.position.set(x, y, z);
    this.avatar.group.rotation.y = yaw;
    const moving = mode === "walk" ? 1 : 0;
    poseAvatar(this.avatar, mode, this.time, moving);
  }

  private readControl(): Control {
    const plane = this.occupied?.kind === "plane";
    const heli = this.occupied?.kind === "heli";
    let x = 0;
    let y = 0;
    if (this.keys.has("KeyA")) x -= 1;
    if (this.keys.has("KeyD")) x += 1;
    if (this.keys.has("KeyW")) y += 1;
    if (this.keys.has("KeyS")) y -= 1;
    if (!plane) {
      if (this.keys.has("ArrowLeft")) x -= 1;
      if (this.keys.has("ArrowRight")) x += 1;
      if (this.keys.has("ArrowUp")) y += 1;
      if (this.keys.has("ArrowDown")) y -= 1;
    } else {
      if (this.keys.has("ArrowLeft")) x -= 1;
      if (this.keys.has("ArrowRight")) x += 1;
    }
    x = clamp(x + this.touch.x, -1, 1);
    y = clamp(y + this.touch.y, -1, 1);
    if (this.touch.gas) y = Math.max(y, 1);
    if (this.touch.brake) y = Math.min(y, -1);
    const pitch = plane ? (this.keys.has("ArrowUp") ? 1 : 0) - (this.keys.has("ArrowDown") ? 1 : 0) : 0;
    const climb = (this.keys.has("Space") || this.touch.up ? 1 : 0) - (this.keys.has("KeyC") || this.touch.down ? 1 : 0);
    return {
      throttleAxis: y,
      // Chase camera shows world +X on the left, and positive yaw turns that way.
      steer: -x,
      handbrake: !heli && !plane && (this.keys.has("Space") || this.touch.brake),
      boost: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touch.boost,
      pitch: heli ? y : pitch,
      climb: heli ? climb : 0,
    };
  }

  private interact() {
    if (this.occupied) {
      this.exitVehicle();
      return;
    }
    if (this.trains.riding) {
      if (!this.trains.commuterSlow()) {
        this.toast("Wait for the stop.");
        return;
      }
      const side = this.trains.seatPose();
      this.trains.riding = false;
      this.player.x = side.x + 3;
      this.player.z = side.z;
      this.player.y = this.world.groundY(this.player.x, this.player.z, "land");
      return;
    }
    if (this.trains.speederOccupied) {
      if (Math.abs(this.trains.speederSpeed) > 6) {
        this.toast("Ease off before you step down.");
        return;
      }
      const side = this.trains.sideOfSpeeder();
      this.trains.speederOccupied = false;
      this.player.x = side.x;
      this.player.z = side.z;
      this.player.y = 0;
      this.player.yaw = side.yaw;
      return;
    }
    let best: Vehicle | null = null;
    let bestD = 7;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
      if (d < v.enterRadius && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    const speederD = this.trains.nearSpeeder(this.player.x, this.player.z);
    const commuterD = this.trains.nearCommuter(this.player.x, this.player.z);
    if (best && bestD <= speederD && bestD <= commuterD) {
      best.occupied = true;
      best.ai = null;
      this.occupied = best;
      this.intro = false;
      this.camDist = best.kind === "car" ? 8.2 : best.kind === "heli" ? 9.5 : 16;
      this.toast(best.blurb);
      return;
    }
    if (speederD < 4.8 && speederD < commuterD) {
      this.trains.speederOccupied = true;
      this.intro = false;
      this.toast("Rail Bug. W and S run the inner loop. It cannot leave the rails.");
      return;
    }
    if (commuterD < 6 && this.trains.commuterSlow()) {
      this.trains.riding = true;
      this.intro = false;
      this.toast("Riding the Tide Line. Step off at the next stop.");
      return;
    }
    for (const poi of POIS) {
      if (Math.hypot(poi.x - this.player.x, poi.z - this.player.z) < poi.radius) {
        const title = document.getElementById("card-title");
        const body = document.getElementById("card-body");
        if (title) title.textContent = poi.title;
        if (body) body.textContent = poi.body;
        this.setCard(true);
        return;
      }
    }
  }

  private exitVehicle() {
    const v = this.occupied;
    if (!v) return;
    if (v.kind === "car" && Math.abs(v.speed) > 9) {
      this.toast("Slow down to step out.");
      return;
    }
    const gy = this.world.groundY(v.x, v.z, "air");
    if (v.kind === "plane" && (v.y > gy + 2.4 || v.speed > 12)) {
      this.toast("Land, then roll to a stop.");
      return;
    }
    if (v.kind === "heli" && v.y > gy + 1.6) {
      this.toast("Set the skids down first.");
      return;
    }
    v.occupied = false;
    const rt = right(v.yaw);
    this.player.x = v.x - rt.x * (v.half.w + 1.3);
    this.player.z = v.z - rt.z * (v.half.w + 1.3);
    this.player.y = this.world.groundY(this.player.x, this.player.z, "land");
    this.player.yaw = v.yaw;
    this.occupied = null;
    this.camDist = 7;
  }

  private failRide(v: Vehicle, result: "drown" | "crash") {
    resetVehicle(v);
    this.toast(result === "drown" ? "That one went in the water. It's back at its spot." : "Hard landing. Reset to where it was parked.");
  }

  private resetCurrent() {
    if (this.occupied) {
      resetVehicle(this.occupied);
      this.toast("Reset to its parking spot.");
      return;
    }
    if (this.trains.speederOccupied) {
      const beach = this.trains.stations.find((s) => s.name === "Shell Beach");
      if (beach) this.trains.speederS = beach.s;
      this.trains.speederSpeed = 0;
      this.toast("Rail Bug is back at Shell Beach station.");
      return;
    }
    this.player.x = SPAWN.x;
    this.player.z = SPAWN.z;
    this.player.y = 0;
    this.player.yaw = SPAWN.yaw;
    this.intro = true;
    this.toast("Back on Shell Beach.");
  }

  private scoreLights(v: Vehicle) {
    if (v.kind !== "car" || v.speed < 8) return;
    for (const s of this.signals) {
      if (!inIntersection(s, v.x, v.z)) continue;
      const phase = phaseAt(this.time, s.offset);
      if (axisAllows(phase, travelAxis(v.yaw))) continue;
      const key = `${s.x}:${s.z}`;
      if (this.time - (this.ticketAt.get(key) ?? -99) < 8) continue;
      this.ticketAt.set(key, this.time);
      this.tickets += 1;
      this.toast("Red light. The county noticed.");
      const el = document.getElementById("tickets");
      if (el) el.textContent = this.tickets === 1 ? "1 red-light ticket" : `${this.tickets} red-light tickets`;
    }
  }

  private scoreLap(v: Vehicle) {
    if (v.kind !== "car") return;
    const id = this.world.trackAt(v.x, v.z);
    const lapEl = document.getElementById("lap");
    if (!id) {
      if (lapEl && !this.race.running) lapEl.textContent = "";
      return;
    }
    const cps = this.world.checks.get(id);
    if (!cps) return;
    if (this.race.gate >= 0) {
      const g = cps[this.race.gate];
      if (!g || Math.hypot(v.x - g.x, v.z - g.z) > 16) this.race.gate = -1;
    }
    const next = this.race.track === id && this.race.running ? this.race.next : 0;
    const cp = cps[next];
    if (cp && this.race.gate < 0 && Math.hypot(v.x - cp.x, v.z - cp.z) < 12 && v.speed > 6) {
      const diff = Math.atan2(Math.sin(v.yaw - cp.yaw), Math.cos(v.yaw - cp.yaw));
      if (Math.abs(diff) < 1.35) {
        this.race.gate = next;
        if (next === 0) {
          if (this.race.running && this.race.track === id) {
            const lap = this.time - this.race.t0;
            if (lap > 5) {
              if (!this.race.best[id] || lap < this.race.best[id]) this.race.best[id] = lap;
              this.toast(`Lap ${formatClock(lap)}`);
            }
          }
          this.race.running = true;
          this.race.track = id;
          this.race.t0 = this.time;
          this.race.next = 1;
        } else {
          this.race.track = id;
          this.race.next = (next + 1) % 4;
        }
      }
    }
    if (lapEl && this.race.running && this.race.track === id) {
      const name = this.world.tracks.get(id)?.name ?? "Track";
      const best = this.race.best[id] ? ` · best ${formatClock(this.race.best[id])}` : "";
      lapEl.textContent = `${name} ${formatClock(this.time - this.race.t0)}${best}`;
    }
  }

  private draw() {
    const look = this.focus;
    if (!this.started || this.intro) {
      this.camera.position.lerp(new THREE.Vector3(INTRO_CAM.x, INTRO_CAM.y, INTRO_CAM.z), 0.08);
      look.set(INTRO_CAM.lookX, INTRO_CAM.lookY, INTRO_CAM.lookZ);
    } else {
      const target = this.occupied
        ? new THREE.Vector3(this.occupied.x, this.occupied.y + 1.2, this.occupied.z)
        : new THREE.Vector3(this.player.x, this.player.y + 1.35, this.player.z);
      if ((this.occupied || this.trains.speederOccupied || this.trains.riding) && !this.look) {
        const yaw = this.trains.riding ? this.player.yaw : this.trains.speederOccupied ? this.player.yaw : this.occupied?.yaw ?? this.camYaw;
        const diff = Math.atan2(Math.sin(yaw - this.camYaw), Math.cos(yaw - this.camYaw));
        this.camYaw += diff * 0.08;
      }
      const f = forward(this.camYaw);
      const dist = this.camDist * (this.occupied?.kind === "plane" ? 1.35 : 1);
      const cp = Math.cos(this.camPitch);
      const sp = Math.sin(this.camPitch);
      const desired = new THREE.Vector3(
        target.x - f.x * dist * cp,
        target.y + dist * sp,
        target.z - f.z * dist * cp,
      );
      this.camera.position.lerp(desired, 0.14);
      look.copy(target);
    }
    this.camera.lookAt(look);
    const speed = this.occupied ? this.occupied.speed : this.trains.speederOccupied ? this.trains.speederSpeed : this.trains.riding ? this.trains.commuterSpeed : 0;
    const fov = 68 + Math.min(10, Math.abs(speed) * 0.08);
    if (Math.abs(this.camera.fov - fov) > 0.2) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const focusX = this.occupied?.x ?? this.player.x;
    const focusZ = this.occupied?.z ?? this.player.z;
    this.sun.position.set(focusX - 48, 80, focusZ - 24);
    this.sun.target.position.set(focusX, 0, focusZ);
    const dark = this.world.inDark(focusX, focusZ);
    const lamps = this.lightsOn || dark;
    this.fill.intensity = dark ? 14 : 0;
    this.fill.position.set(focusX, (this.occupied?.y ?? this.player.y) + 1, focusZ);
    if (this.occupied) {
      for (const m of this.occupied.headMats) m.emissiveIntensity = lamps ? 1 : 0.28;
    }
    const cam = this.camera.position;
    for (const v of this.vehicles) {
      const d = cam.distanceTo(v.group.position);
      v.label.visible = !v.occupied && d < 46 && d > 6;
      const mat = v.label.material as THREE.SpriteMaterial;
      mat.opacity = d < 16 ? 1 : Math.max(0, 1 - (d - 16) / 30);
    }
    this.world.update(1 / 60, cam.x, cam.z);
    this.paintHud(speed);
    this.renderer.render(this.scene, this.camera);
  }

  private paintHud(speed: number) {
    const mphEl = document.getElementById("mph");
    const nameEl = document.getElementById("veh-name");
    const prompt = document.getElementById("prompt");
    const boost = document.getElementById("boost-fill");
    if (mphEl) mphEl.textContent = String(Math.round(mph(speed)));
    let label = "On foot";
    if (this.occupied) label = this.occupied.name;
    else if (this.trains.speederOccupied) label = "Rail Bug";
    else if (this.trains.riding) label = "Tide Line";
    if (nameEl) nameEl.textContent = label;
    if (boost && this.occupied?.kind === "car") {
      boost.style.width = `${(this.occupied.boost / this.occupied.boostMax) * 100}%`;
    } else if (boost) boost.style.width = "0%";
    if (prompt && this.started && !this.overlayOpen()) prompt.textContent = this.promptText();
    else if (prompt) prompt.textContent = "";
    const mini = document.getElementById("mini") as HTMLCanvasElement | null;
    const map = document.getElementById("map-canvas") as HTMLCanvasElement | null;
    const data = this.mapData();
    if (mini) {
      const ctx = mini.getContext("2d");
      if (ctx) drawMap(ctx, mini.width, mini.height, data);
    }
    if (map && this.mapOpen) {
      const ctx = map.getContext("2d");
      if (ctx) drawMap(ctx, map.width, map.height, data);
    }
    const kind = !this.started
      ? "none"
      : this.trains.speederOccupied || this.trains.riding
        ? "train"
        : this.occupied?.kind === "car"
          ? this.occupied.tune.kind === "car" && this.occupied.tune.electric
            ? "electric"
            : "gas"
          : this.occupied?.kind === "plane"
            ? "plane"
            : this.occupied?.kind === "heli"
              ? "heli"
              : "none";
    const amount = this.occupied ? Math.min(1, Math.abs(this.occupied.speed) / 30 + (this.occupied.kind === "plane" ? this.occupied.throttle : 0)) : this.trains.riding ? 0.4 : Math.min(1, Math.abs(speed) / 20);
    this.sfx.update(kind, this.started ? amount : 0);
    if (this.trains.crossingActive && Math.floor(this.time * 2) !== Math.floor((this.time - 1 / 60) * 2)) {
      /* ding handled visually */
    }
  }

  private mapData(): MapDraw {
    const lines = this.world.linesForMap();
    return {
      roads: lines.roads,
      rails: lines.rails,
      tracks: lines.tracks,
      px: this.player.x,
      pz: this.player.z,
      yaw: this.occupied?.yaw ?? this.player.yaw,
      beacon: this.beacon,
    };
  }

  private promptText() {
    if (this.occupied) {
      if (this.occupied.kind === "car") return `${this.occupied.name} · F to exit · Shift boost`;
      if (this.occupied.kind === "plane") return `${this.occupied.name} · W throttle · arrows pitch · F when stopped`;
      return `${this.occupied.name} · Space up · C down · F when skids are down`;
    }
    if (this.trains.riding) return this.trains.commuterSlow() ? "Tide Line stopped · F to step off" : "Riding the Tide Line";
    if (this.trains.speederOccupied) return "Rail Bug · W forward · S back · F to hop off";
    let best: Vehicle | null = null;
    let bestD = 8;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
      if (d < v.enterRadius && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    const speederD = this.trains.nearSpeeder(this.player.x, this.player.z);
    const commuterD = this.trains.nearCommuter(this.player.x, this.player.z);
    if (best && bestD <= speederD) return `F · ${best.name}`;
    if (speederD < 4.8) return "F · Rail Bug";
    if (commuterD < 6 && this.trains.commuterSlow()) return "F · board the Tide Line";
    if (commuterD < 6) return "Tide Line is moving";
    for (const poi of POIS) {
      if (Math.hypot(poi.x - this.player.x, poi.z - this.player.z) < poi.radius) return `F · ${poi.name}`;
    }
    if (this.intro) return "Walk up to the blue Lumen iX and press F";
    return "";
  }

  private releaseIntro() {
    this.intro = false;
    const look = new THREE.Vector3(this.player.x, this.player.y + 1.3, this.player.z);
    this.camYaw = Math.atan2(look.x - this.camera.position.x, look.z - this.camera.position.z);
  }

  private failSafeAudio() {
    this.sfx.resume();
  }

  private toggleMute() {
    this.failSafeAudio();
    this.sfx.setMuted(!this.sfx.muted);
    const btn = document.getElementById("mute-btn");
    if (btn) btn.textContent = this.sfx.muted ? "Sound off" : "Sound on";
  }

  private setMap(open: boolean) {
    this.mapOpen = open;
    const el = document.getElementById("map");
    if (el) el.hidden = !open;
  }

  private setCard(open: boolean) {
    this.cardOpen = open;
    const el = document.getElementById("card");
    if (el) el.hidden = !open;
  }

  private setHelp(open: boolean) {
    this.helpOpen = open;
    const el = document.getElementById("help");
    if (el) el.hidden = !open;
  }

  private overlayOpen() {
    return this.mapOpen || this.cardOpen || this.helpOpen;
  }

  private edge(code: string) {
    return this.keys.has(code) && !this.prev.has(code);
  }

  private anyMove() {
    return (
      this.keys.has("KeyW") ||
      this.keys.has("KeyA") ||
      this.keys.has("KeyS") ||
      this.keys.has("KeyD") ||
      this.keys.has("ArrowUp") ||
      this.touch.x !== 0 ||
      this.touch.y !== 0
    );
  }

  private resetQuality() {
    if (this.qualityDropped) return;
    this.qualityDropped = true;
    this.renderer.shadowMap.enabled = false;
    this.sun.castShadow = false;
    this.renderer.setPixelRatio(1);
    this.resize();
  }

  private watchFps(dt: number) {
    this.frames += 1;
    this.fpsClock += dt;
    if (this.fpsClock < 2.5 || this.qualityDropped) return;
    const fps = this.frames / this.fpsClock;
    this.frames = 0;
    this.fpsClock = 0;
    if (fps < 22) this.resetQuality();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  private toast(text: string) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    this.toastTimer = 2.6;
  }
}

function eventCode(e: KeyboardEvent) {
  if (e.code) return e.code;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const named: Record<string, string> = {
    w: "KeyW",
    a: "KeyA",
    s: "KeyS",
    d: "KeyD",
    f: "KeyF",
    m: "KeyM",
    n: "KeyN",
    h: "KeyH",
    l: "KeyL",
    r: "KeyR",
    c: "KeyC",
    " ": "Space",
    escape: "Escape",
    enter: "Enter",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    shift: "ShiftLeft",
  };
  return named[key] ?? "";
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function forward(yaw: number) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function right(yaw: number) {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}
