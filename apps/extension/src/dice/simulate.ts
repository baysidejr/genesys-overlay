// Throws the dice in a physics world ahead of time, records every step, then
// works out which face of each die ended up on top. The face textures are
// then shuffled so the server's result is the one showing. No DOM here, so
// this runs in tests too.

import * as CANNON from "cannon-es";
import * as THREE from "three";
import type { DieType, RolledDie } from "@genesys/shared";
import { dieShape, type DieKind, type DieShape } from "./polyhedra";
import { mulberry32 } from "./rng";

/** The visible patch of table, in world units on the y = 0 plane. */
export interface Arena {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const STEP = 1 / 60;
const MAX_STEPS = 60 * 6;
/** All dice slower than this (units/s, rad/s) for REST_STEPS steps counts as settled. */
const REST_SPEED = 0.08;
const REST_SPIN = 0.15;
const REST_STEPS = 10;
/** Floats recorded per die per step: position xyz, quaternion xyzw. */
export const TRACK_STRIDE = 7;
/** How square to the table the top face must be; below this we rethrow. */
const MIN_ALIGNMENT = 0.95;
const MAX_ATTEMPTS = 6;

export interface Throw {
  steps: number;
  /** One track per die: `steps * TRACK_STRIDE` floats. */
  tracks: Float32Array[];
  /** Physical face index that ended up on top, per die. */
  topFaces: number[];
  /** Worst top-face alignment across the dice (1 = perfectly flat). */
  alignment: number;
}

export interface PlannedThrow extends Throw {
  /** Per die, which FACES-table entry each physical face shows. */
  faceMaps: number[][];
}

const bodyShapes = new Map<DieKind, CANNON.ConvexPolyhedron>();

function bodyShape(shape: DieShape): CANNON.ConvexPolyhedron {
  let body = bodyShapes.get(shape.kind);
  if (!body) {
    body = new CANNON.ConvexPolyhedron({
      vertices: shape.vertices.map((v) => new CANNON.Vec3(v.x, v.y, v.z)),
      faces: shape.faces.map((f) => f.indices),
    });
    bodyShapes.set(shape.kind, body);
  }
  return body;
}

function addPlane(world: CANNON.World, position: CANNON.Vec3, euler: [number, number, number]): void {
  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  body.position.copy(position);
  body.quaternion.setFromEuler(...euler);
  world.addBody(body);
}

export function simulateThrow(types: readonly DieType[], arena: Arena, random: () => number): Throw {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -40, 0), allowSleep: true });
  world.defaultContactMaterial.friction = 0.3;
  world.defaultContactMaterial.restitution = 0.35;

  // A Plane's normal is its local +z; turn each one to face into the arena.
  addPlane(world, new CANNON.Vec3(0, 0, 0), [-Math.PI / 2, 0, 0]);
  addPlane(world, new CANNON.Vec3(arena.minX, 0, 0), [0, Math.PI / 2, 0]);
  addPlane(world, new CANNON.Vec3(arena.maxX, 0, 0), [0, -Math.PI / 2, 0]);
  addPlane(world, new CANNON.Vec3(0, 0, arena.minZ), [0, 0, 0]);
  addPlane(world, new CANNON.Vec3(0, 0, arena.maxZ), [0, Math.PI, 0]);

  // Dice come in from the left edge in a loose cluster, spinning.
  const midZ = (arena.minZ + arena.maxZ) / 2;
  const spread = (n: number) => (random() - 0.5) * n;
  const bodies = types.map((type, i) => {
    const body = new CANNON.Body({
      mass: 1,
      shape: bodyShape(dieShape(type)),
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.3,
      linearDamping: 0.2,
      angularDamping: 0.25,
    });
    const column = Math.floor(i / 4);
    const row = (i % 4) - 1.5;
    body.position.set(
      Math.min(arena.minX + 1 + column * 1.1, arena.maxX - 1),
      1.5 + random() * 1.5,
      midZ + row * 1.1 + spread(0.3),
    );
    body.quaternion.setFromEuler(random() * Math.PI * 2, random() * Math.PI * 2, random() * Math.PI * 2);
    body.velocity.set(10 + random() * 6, -2, spread(6));
    body.angularVelocity.set(spread(40), spread(40), spread(40));
    world.addBody(body);
    return body;
  });

  const tracks = types.map(() => new Float32Array(MAX_STEPS * TRACK_STRIDE));
  let steps = 0;
  let restingSteps = 0;
  while (steps < MAX_STEPS) {
    world.step(STEP);
    bodies.forEach((body, i) => {
      const o = steps * TRACK_STRIDE;
      const t = tracks[i]!;
      t[o] = body.position.x;
      t[o + 1] = body.position.y;
      t[o + 2] = body.position.z;
      t[o + 3] = body.quaternion.x;
      t[o + 4] = body.quaternion.y;
      t[o + 5] = body.quaternion.z;
      t[o + 6] = body.quaternion.w;
    });
    steps++;
    // Sleep alone can take seconds to kick in while dice jitter in place.
    const resting = bodies.every(
      (b) =>
        b.sleepState === CANNON.Body.SLEEPING ||
        (b.velocity.lengthSquared() < REST_SPEED ** 2 && b.angularVelocity.lengthSquared() < REST_SPIN ** 2),
    );
    restingSteps = resting ? restingSteps + 1 : 0;
    if (restingSteps >= REST_STEPS) break;
  }

  let alignment = 1;
  const topFaces = bodies.map((body, i) => {
    const top = topFace(dieShape(types[i]!), body.quaternion);
    alignment = Math.min(alignment, top.alignment);
    return top.face;
  });

  return { steps, tracks: tracks.map((t) => t.slice(0, steps * TRACK_STRIDE)), topFaces, alignment };
}

const UP = new THREE.Vector3(0, 1, 0);

export function topFace(shape: DieShape, q: { x: number; y: number; z: number; w: number }) {
  const rotation = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  const n = new THREE.Vector3();
  let face = 0;
  let alignment = -Infinity;
  shape.faces.forEach((f, i) => {
    const dot = n.copy(f.normal).applyQuaternion(rotation).dot(UP);
    if (dot > alignment) {
      alignment = dot;
      face = i;
    }
  });
  return { face, alignment };
}

/**
 * Which FACES-table entry each physical face shows. Physical face i starts out
 * showing entry i; swapping two entries puts `wanted` on `top` and keeps every
 * face of the die exactly once.
 */
export function remapFaces(faceCount: number, top: number, wanted: number): number[] {
  const map = Array.from({ length: faceCount }, (_, i) => i);
  map[top] = wanted;
  map[wanted] = top;
  return map;
}

/**
 * Plans a throw that lands on the server's result. Seeded by the roll so the
 * same roll replays the same throw in the same arena. Rethrows if a die
 * comes to rest cocked against a wall or another die.
 */
export function planThrow(dice: readonly RolledDie[], arena: Arena, seed: number): PlannedThrow {
  const types = dice.map((d) => d.type);
  let best: Throw | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = simulateThrow(types, arena, mulberry32(seed ^ Math.imul(attempt, 0x9e3779b9)));
    if (!best || result.alignment > best.alignment) best = result;
    if (result.alignment >= MIN_ALIGNMENT) break;
  }
  const planned = best!;
  const faceMaps = dice.map((d, i) => remapFaces(dieShape(d.type).faces.length, planned.topFaces[i]!, d.face));
  return { ...planned, faceMaps };
}
