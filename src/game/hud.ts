import { BEACONS, WORLD_MAX, WORLD_MIN } from "./layout";

export interface MapDraw {
  roads: [number, number, number, number][];
  rails: { x: number; z: number }[];
  tracks: { pts: { x: number; z: number }[] }[];
  px: number;
  pz: number;
  yaw: number;
  beacon: { x: number; z: number } | null;
}

const MIN = WORLD_MIN;
const SPAN = WORLD_MAX - WORLD_MIN;

export function worldToMap(x: number, z: number, w: number, h: number) {
  return {
    x: ((x - MIN) / SPAN) * w,
    y: (1 - (z - MIN) / SPAN) * h,
  };
}

export function mapToWorld(px: number, py: number, w: number, h: number) {
  return {
    x: (px / w) * SPAN + MIN,
    z: (1 - py / h) * SPAN + MIN,
  };
}

export function drawMap(ctx: CanvasRenderingContext2D, w: number, h: number, data: MapDraw) {
  ctx.clearRect(0, 0, w, h);
  const rect = (x0: number, z0: number, x1: number, z1: number, color: string) => {
    const a = worldToMap(x0, z1, w, h);
    const b = worldToMap(x1, z0, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  };
  rect(MIN, MIN, WORLD_MAX, WORLD_MAX, "#d7a45a");
  rect(0, 0, WORLD_MAX, WORLD_MAX, "#b7b3aa");
  rect(MIN, 0, 0, WORLD_MAX, "#6e9458");
  rect(0, MIN, WORLD_MAX, 0, "#e4c48a");
  rect(MIN, -650, WORLD_MAX, -520, "#1a7f96");
  rect(520, -520, 700, 200, "#1a7f96");

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = Math.max(1, w / 180);
  ctx.beginPath();
  for (const r of data.roads) {
    const a = worldToMap(r[0], r[1], w, h);
    const b = worldToMap(r[2], r[3], w, h);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  ctx.strokeStyle = "#d7dde3";
  ctx.lineWidth = Math.max(1, w / 220);
  ctx.beginPath();
  data.rails.forEach((p, i) => {
    const m = worldToMap(p.x, p.z, w, h);
    if (i === 0) ctx.moveTo(m.x, m.y);
    else ctx.lineTo(m.x, m.y);
  });
  ctx.stroke();

  ctx.strokeStyle = "#ff6b4a";
  ctx.lineWidth = Math.max(1.5, w / 160);
  for (const t of data.tracks) {
    ctx.beginPath();
    t.pts.forEach((p, i) => {
      const m = worldToMap(p.x, p.z, w, h);
      if (i === 0) ctx.moveTo(m.x, m.y);
      else ctx.lineTo(m.x, m.y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  if (w > 280) {
    ctx.fillStyle = "#102028";
    ctx.font = `700 ${Math.round(w / 28)}px Nunito, sans-serif`;
    const labels: [string, number, number][] = [
      ["BEACH", 250, -250],
      ["DESERT", -250, -250],
      ["CITY", 250, 250],
      ["MOUNTAINS", -250, 250],
    ];
    for (const [name, x, z] of labels) {
      const m = worldToMap(x, z, w, h);
      ctx.fillText(name, m.x - 28, m.y);
    }
    ctx.font = `800 ${Math.round(w / 42)}px Nunito, sans-serif`;
    ctx.fillStyle = "#9a3412";
    for (const b of BEACONS) {
      const m = worldToMap(b.x, b.z, w, h);
      ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
    }
  }

  if (data.beacon) {
    const m = worldToMap(data.beacon.x, data.beacon.z, w, h);
    ctx.strokeStyle = "#ff6b4a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  const p = worldToMap(data.px, data.pz, w, h);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(-data.yaw);
  ctx.fillStyle = "#102028";
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}
