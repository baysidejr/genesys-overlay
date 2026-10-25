// Transparent full-screen Three.js stage for the dice. The render loop runs
// only while something is moving, so the idle overlay costs Alchemy's GPU
// almost nothing.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Arena } from "./simulate";

/** Keeps dice this far inside the screen edges, in world units. */
const ARENA_MARGIN = 0.6;

export class DiceStage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private frame: number | null = null;
  private onFrame: ((dt: number) => boolean) | null = null;
  private lastTime = 0;
  private leftInset = 0;
  private rightInset = 0;
  private topInset = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    // Steep enough that the face on top is the one you read, even on d8s.
    this.camera.position.set(0, 18, 5.5);
    this.camera.lookAt(0, 0, 0);

    // Soft studio reflections give the resin dice their gloss.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.9));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-6, 14, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun);

    // Invisible table that only shows the dice's shadows over the map.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.3 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.resize();
    window.addEventListener("resize", () => {
      this.resize();
      this.renderOnce();
    });
  }

  /**
   * Runs `step` every frame until it returns false, then stops the loop.
   * `step` gets the seconds since the previous frame. A new call replaces
   * the current step.
   */
  animate(step: (dt: number) => boolean): void {
    this.onFrame = step;
    if (this.frame !== null) return;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      const keepGoing = this.onFrame?.(dt) ?? false;
      this.renderer.render(this.scene, this.camera);
      this.frame = keepGoing ? requestAnimationFrame(tick) : null;
    };
    this.frame = requestAnimationFrame(tick);
  }

  renderOnce(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Keeps dice out of the strips the tray covers at either side, in CSS pixels. */
  setSideInsets(left: number, right: number): void {
    this.leftInset = left;
    this.rightInset = right;
  }

  /** Keeps dice out from under the result card at the top, in CSS pixels. */
  setTopInset(px: number): void {
    this.topInset = px;
  }

  /** The largest rectangle of table (y = 0) that is fully on screen. */
  arena(): Arena {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    // Rays come from the camera's world matrix, which otherwise only updates on render.
    this.camera.updateMatrixWorld();
    const corner = (x: number, y: number) => {
      ray.setFromCamera(new THREE.Vector2(x, y), this.camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3()) ?? new THREE.Vector3();
    };
    // Leave at least half the screen for dice even if the tray is wide.
    const left = -1 + 2 * Math.min(this.leftInset / window.innerWidth, 0.5);
    const right = 1 - 2 * Math.min(this.rightInset / window.innerWidth, 0.5);
    const top = 1 - 2 * Math.min(this.topInset / window.innerHeight, 0.4);
    // In perspective the bottom (near) edge of the screen is the narrowest.
    const nearLeft = corner(left, -1);
    const nearRight = corner(right, -1);
    const farLeft = corner(left, top);
    return {
      minX: nearLeft.x + ARENA_MARGIN,
      maxX: nearRight.x - ARENA_MARGIN,
      minZ: farLeft.z + ARENA_MARGIN,
      maxZ: nearLeft.z - ARENA_MARGIN,
    };
  }

  private resize(): void {
    const { innerWidth: w, innerHeight: h } = window;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const a = this.arena();
    const shadow = this.sun.shadow.camera;
    const reach = Math.max(-a.minX, a.maxX, -a.minZ, a.maxZ) + 4;
    shadow.left = shadow.bottom = -reach;
    shadow.right = shadow.top = reach;
    shadow.far = 60;
    shadow.updateProjectionMatrix();
  }
}
