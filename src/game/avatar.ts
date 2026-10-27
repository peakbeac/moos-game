import * as THREE from "three";
import { plastic } from "./geom";

export interface Avatar {
  group: THREE.Group;
  legs: THREE.Group[];
  arms: THREE.Group[];
}

export function buildAvatar(): Avatar {
  const group = new THREE.Group();
  const skin = plastic(0xf5cd30);
  const shirt = plastic(0x2f6fed);
  const pants = plastic(0x1f7a3a);
  const legs: THREE.Group[] = [];
  const arms: THREE.Group[] = [];

  const limb = (mat: THREE.Material, x: number, hipY: number, w: number, h: number, d: number, list: THREE.Group[]) => {
    const hip = new THREE.Group();
    hip.position.set(x, hipY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.y = -h / 2;
    mesh.castShadow = true;
    hip.add(mesh);
    group.add(hip);
    list.push(hip);
  };

  limb(pants, -0.18, 0.78, 0.28, 0.78, 0.28, legs);
  limb(pants, 0.18, 0.78, 0.28, 0.78, 0.28, legs);
  limb(skin, -0.58, 1.45, 0.22, 0.7, 0.22, arms);
  limb(skin, 0.58, 1.45, 0.22, 0.7, 0.22, arms);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 0.46), shirt);
  torso.position.y = 1.2;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.52, 0.52), skin);
  head.position.y = 1.88;
  head.castShadow = true;
  group.add(torso, head);
  return { group, legs, arms };
}

export function poseAvatar(avatar: Avatar, mode: "idle" | "walk" | "sit", time: number, moving: number) {
  if (mode === "sit") {
    avatar.legs[0].rotation.x = -1.15;
    avatar.legs[1].rotation.x = -1.15;
    avatar.arms[0].rotation.x = -0.35;
    avatar.arms[1].rotation.x = -0.35;
    return;
  }
  const swing = Math.sin(time * (mode === "walk" ? 10 : 2)) * (mode === "walk" ? 0.7 : 0.05) * Math.min(1, moving);
  avatar.legs[0].rotation.x = swing;
  avatar.legs[1].rotation.x = -swing;
  avatar.arms[0].rotation.x = -swing;
  avatar.arms[1].rotation.x = swing;
}
