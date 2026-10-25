// Plays a roll on the dice stage: plans the throw, shuffles each die's faces
// so the rolled result lands on top, replays the recorded physics, holds the
// result for a moment, then fades the dice out. Only ever used for rolls made
// in this browser.

import * as THREE from "three";
import type { RolledDie } from "@genesys/shared";
import { dieGeometry, dieShape } from "./polyhedra";
import { seedFromString } from "./rng";
import { planThrow, STEP, TRACK_STRIDE } from "./simulate";
import type { DiceStage } from "./stage";
import { faceTexture, loadSymbolFont } from "./textures";

const HOLD_SECONDS = 3;
const FADE_SECONDS = 0.6;

export class DiceRoller {
  private group: THREE.Group | null = null;
  private materials: THREE.MeshPhysicalMaterial[] = [];
  private finishPending: (() => void) | null = null;

  constructor(private readonly stage: DiceStage) {}

  /** Resolves once every die has landed. A new roll replaces the one on screen. */
  async show(event: { id: string; dice: RolledDie[] }): Promise<void> {
    await loadSymbolFont();
    this.clear();
    const plan = planThrow(event.dice, this.stage.arena(), seedFromString(event.id));

    const group = new THREE.Group();
    const meshes = event.dice.map((die, i) => {
      const shape = dieShape(die.type);
      const materials = plan.faceMaps[i]!.map(
        (entry) =>
          // Polished resin: a clear coat over a satin body.
          new THREE.MeshPhysicalMaterial({
            map: faceTexture(die.type, entry, shape.faces[0]!.inset),
            roughness: 0.55,
            metalness: 0,
            clearcoat: 0.6,
            clearcoatRoughness: 0.2,
          }),
      );
      this.materials.push(...materials);
      const mesh = new THREE.Mesh(dieGeometry(shape), materials);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    });
    this.group = group;
    this.stage.scene.add(group);

    const lastStep = plan.steps - 1;
    const fadeStart = plan.steps * STEP + HOLD_SECONDS;
    // With reduced motion the dice appear already at rest.
    let elapsed = matchMedia("(prefers-reduced-motion: reduce)").matches ? lastStep * STEP : 0;

    return new Promise((resolve) => {
      this.finishPending = resolve;
      this.stage.animate((dt) => {
        if (this.group !== group) return false;
        elapsed += dt;
        const step = Math.min(Math.floor(elapsed / STEP), lastStep);
        meshes.forEach((mesh, i) => {
          const t = plan.tracks[i]!;
          const o = step * TRACK_STRIDE;
          mesh.position.set(t[o]!, t[o + 1]!, t[o + 2]!);
          mesh.quaternion.set(t[o + 3]!, t[o + 4]!, t[o + 5]!, t[o + 6]!);
        });
        if (step === lastStep) this.settle();

        if (elapsed > fadeStart) {
          const opacity = 1 - (elapsed - fadeStart) / FADE_SECONDS;
          if (opacity <= 0) {
            this.clear();
            return false;
          }
          for (const m of this.materials) {
            m.transparent = true;
            m.opacity = opacity;
          }
        }
        return true;
      });
    });
  }

  /** Removes the dice on screen right away. */
  clear(): void {
    this.settle();
    if (this.group) this.stage.scene.remove(this.group);
    this.group = null;
    // Geometries and textures are shared and cached; only materials are per roll.
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.stage.renderOnce();
  }

  private settle(): void {
    this.finishPending?.();
    this.finishPending = null;
  }
}
