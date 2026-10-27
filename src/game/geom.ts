import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const boxCache = new Map<string, THREE.BoxGeometry>();
const cylCache = new Map<string, THREE.CylinderGeometry>();

export function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = boxCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    boxCache.set(k, g);
  }
  return g;
}

export function cylGeo(rTop: number, rBot: number, h: number, seg: number): THREE.CylinderGeometry {
  const k = `${rTop}|${rBot}|${h}|${seg}`;
  let g = cylCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
    cylCache.set(k, g);
  }
  return g;
}

const plastics = new Map<string, THREE.MeshLambertMaterial>();

export function plastic(color: number, emissive = 0): THREE.MeshLambertMaterial {
  const key = `${color}:${emissive}`;
  let m = plastics.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      emissive: new THREE.Color(emissive),
    });
    plastics.set(key, m);
  }
  return m;
}

let studBump: THREE.CanvasTexture | null = null;

export function studTexture(): THREE.CanvasTexture {
  if (studBump) return studBump;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 64, 64);
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 18);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.7, "#bdbdbd");
  grd.addColorStop(1, "#808080");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(32, 32, 16, 0, Math.PI * 2);
  g.fill();
  studBump = new THREE.CanvasTexture(c);
  studBump.wrapS = studBump.wrapT = THREE.RepeatWrapping;
  studBump.colorSpace = THREE.NoColorSpace;
  return studBump;
}

const studMats = new Map<string, THREE.MeshLambertMaterial>();

export function studPlastic(color: number, repeatX: number, repeatY: number): THREE.MeshLambertMaterial {
  const key = `${color}:${repeatX.toFixed(2)}:${repeatY.toFixed(2)}`;
  let m = studMats.get(key);
  if (!m) {
    const bump = studTexture().clone();
    bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    bump.repeat.set(Math.max(1, repeatX), Math.max(1, repeatY));
    bump.needsUpdate = true;
    m = new THREE.MeshLambertMaterial({ color, bumpMap: bump, bumpScale: 0.12 });
    studMats.set(key, m);
  }
  return m;
}

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  cast: boolean;
  receive: boolean;
}

export class Batch {
  private bins: Bucket[] = [];
  private index = new Map<string, Bucket>();

  add(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    rotY = 0,
    rotX = 0,
    rotZ = 0,
    cast = true,
    receive = true,
  ) {
    const g = geo.clone();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, "YXZ"));
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
    const key = `${mat.uuid}:${cast}:${receive}`;
    let bin = this.index.get(key);
    if (!bin) {
      bin = { mat, geos: [], cast, receive };
      this.index.set(key, bin);
      this.bins.push(bin);
    }
    bin.geos.push(g);
  }

  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: number,
    rotY = 0,
    opts?: { rotX?: number; rotZ?: number; cast?: boolean; receive?: boolean; emissive?: number },
  ) {
    this.add(
      boxGeo(w, h, d),
      plastic(color, opts?.emissive ?? 0),
      x,
      y,
      z,
      rotY,
      opts?.rotX ?? 0,
      opts?.rotZ ?? 0,
      opts?.cast ?? true,
      opts?.receive ?? true,
    );
  }

  studRoof(w: number, d: number, x: number, y: number, z: number, color: number, rotY = 0) {
    const repX = w / 1.15;
    const repY = d / 1.15;
    this.add(boxGeo(w, 0.16, d), studPlastic(color, repX, repY), x, y, z, rotY, 0, 0, true, true);
  }

  build(scene: THREE.Scene, name = "static") {
    for (const bin of this.bins) {
      if (!bin.geos.length) continue;
      const merged = bin.geos.length === 1 ? bin.geos[0] : mergeGeometries(bin.geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, bin.mat);
      mesh.castShadow = bin.cast;
      mesh.receiveShadow = bin.receive;
      mesh.name = name;
      scene.add(mesh);
      if (bin.geos.length > 1) {
        for (const g of bin.geos) g.dispose();
      }
    }
    this.bins = [];
    this.index.clear();
  }
}

export function makeSign(
  lines: { text: string; size: number; color: string }[],
  bg: string,
  wPx = 512,
  hPx = 256,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = wPx;
  c.height = hPx;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, wPx, hPx);
  let y = 0;
  const total = lines.reduce((s, l) => s + l.size, 0);
  y = (hPx - total * 1.15) / 2;
  for (const line of lines) {
    g.fillStyle = line.color;
    g.font = `800 ${line.size}px Nunito, Trebuchet MS, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(line.text, wPx / 2, y);
    y += line.size * 1.15;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function signPlane(
  lines: { text: string; size: number; color: string }[],
  bg: string,
  width: number,
  height: number,
  emissive = false,
): THREE.Mesh {
  const tex = makeSign(lines, bg);
  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    emissive: emissive ? new THREE.Color("#ffffff") : new THREE.Color(0),
    emissiveMap: emissive ? tex : null,
    emissiveIntensity: emissive ? 0.55 : 0,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return mesh;
}

export function windowTexture(cols: number, rows: number, seed: number, lit = "#f3d48a", frame = "#243044", glass = "#8ec7de"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = cols * 16;
  c.height = rows * 22;
  const g = c.getContext("2d")!;
  g.fillStyle = frame;
  g.fillRect(0, 0, c.width, c.height);
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = rnd() > 0.42 ? lit : glass;
      g.fillRect(x * 16 + 2, y * 22 + 3, 12, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const windowMats = new Map<string, THREE.MeshLambertMaterial>();

export function windowMaterial(cols: number, rows: number, seed: number): THREE.MeshLambertMaterial {
  const key = `${cols}:${rows}:${seed}`;
  let m = windowMats.get(key);
  if (!m) {
    const tex = windowTexture(cols, rows, seed);
    m = new THREE.MeshLambertMaterial({
      map: tex,
      emissive: new THREE.Color("#ffd9a0"),
      emissiveMap: tex,
      emissiveIntensity: 0.22,
    });
    windowMats.set(key, m);
  }
  return m;
}

export function roadTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3c4148";
  g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
  }
  g.fillStyle = "#f2f2f2";
  g.fillRect(0, 0, 5, 256);
  g.fillRect(123, 0, 5, 256);
  g.fillStyle = "#e2b340";
  for (let y = 8; y < 256; y += 32) g.fillRect(60, y, 8, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function trackTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2f3338";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) {
    g.fillStyle = y % 32 === 0 ? "#f4f4f4" : "#d23b3b";
    g.fillRect(0, y, 14, 16);
    g.fillRect(114, y, 14, 16);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function helipadTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a3038";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "#f2c14e";
  g.lineWidth = 14;
  g.strokeRect(18, 18, 220, 220);
  g.beginPath();
  g.arc(128, 128, 78, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#f4f4f4";
  g.font = "800 92px Nunito, Trebuchet MS, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("H", 128, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function labelSprite(title: string, sub: string, accent = "#ffb703"): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 512, 256);
  roundRect(g, 16, 48, 480, 160, 28);
  g.fillStyle = "rgba(14, 28, 36, 0.88)";
  g.fill();
  g.fillStyle = accent;
  g.font = "700 42px Fredoka, Nunito, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title, 256, 108);
  g.fillStyle = "#f4efe6";
  g.font = "700 28px Nunito, Trebuchet MS, sans-serif";
  g.fillText(sub, 256, 156);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(7.2, 3.6, 1);
  return s;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function waterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vW;
      void main() {
        vUv = uv;
        vec3 p = position;
        float w = sin(position.x * 0.08 + uTime * 1.4) * 0.18 + cos(position.y * 0.06 - uTime) * 0.12;
        p.z += w;
        vW = w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vW;
      void main() {
        float foam = smoothstep(0.12, 0.22, abs(vW));
        vec3 deep = vec3(0.05, 0.38, 0.52);
        vec3 mid = vec3(0.12, 0.62, 0.72);
        vec3 col = mix(deep, mid, vUv.y * 0.35 + 0.4 + vW);
        col = mix(col, vec3(0.85, 0.95, 0.95), foam * 0.35);
        float shimmer = 0.5 + 0.5 * sin(vUv.x * 40.0 + uTime * 2.0);
        col += vec3(0.15, 0.25, 0.25) * shimmer * 0.08;
        gl_FragColor = vec4(col, 0.88);
      }
    `,
  });
}

export function skyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, -0.05, 1.0);
        vec3 zenith = vec3(0.33, 0.62, 0.92);
        vec3 horizon = vec3(0.98, 0.78, 0.58);
        vec3 ground = vec3(0.55, 0.62, 0.58);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, h));
        col = mix(ground, col, smoothstep(-0.08, 0.06, dir.y));
        vec3 sun = normalize(vec3(-0.62, 0.38, -0.42));
        float disc = pow(max(dot(dir, sun), 0.0), 700.0);
        float glow = pow(max(dot(dir, sun), 0.0), 6.0);
        col += vec3(1.0, 0.86, 0.55) * disc * 1.5;
        col += vec3(1.0, 0.62, 0.32) * glow * 0.38;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
