// Die shapes: boost and setback are d6, ability and difficulty d8, proficiency
// and challenge d12. Each shape is a convex polyhedron with one face per entry
// in the shared FACES table, used by both the physics body and the mesh.

import * as THREE from "three";
import type { DieType } from "@genesys/shared";

export type DieKind = "d6" | "d8" | "d12";

export const DIE_KIND: Record<DieType, DieKind> = {
  boost: "d6",
  setback: "d6",
  ability: "d8",
  difficulty: "d8",
  proficiency: "d12",
  challenge: "d12",
};

export interface DieFace {
  /** Vertex indices, counter-clockwise seen from outside. */
  indices: number[];
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  /** In-plane axes used to lay the face texture out. */
  u: THREE.Vector3;
  v: THREE.Vector3;
  /** Distance from the centroid to the farthest vertex. */
  radius: number;
  /** Inradius as a fraction of radius: how much of the texture is safe to draw on. */
  inset: number;
}

export interface DieShape {
  kind: DieKind;
  vertices: THREE.Vector3[];
  faces: DieFace[];
}

function sourceGeometry(kind: DieKind): THREE.BufferGeometry {
  switch (kind) {
    case "d6":
      return new THREE.BoxGeometry(0.9, 0.9, 0.9);
    case "d8":
      return new THREE.OctahedronGeometry(0.75);
    case "d12":
      return new THREE.DodecahedronGeometry(0.72);
  }
}

const shapes = new Map<DieKind, DieShape>();

export function dieShape(type: DieType): DieShape {
  const kind = DIE_KIND[type];
  let shape = shapes.get(kind);
  if (!shape) {
    shape = buildShape(kind, sourceGeometry(kind));
    shapes.set(kind, shape);
  }
  return shape;
}

/** Merges the triangles of a convex geometry back into its flat faces. */
function buildShape(kind: DieKind, geometry: THREE.BufferGeometry): DieShape {
  const triangles = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = triangles.getAttribute("position");
  const vertices: THREE.Vector3[] = [];
  const vertexIndex = (p: THREE.Vector3): number => {
    const found = vertices.findIndex((v) => v.distanceToSquared(p) < 1e-8);
    if (found >= 0) return found;
    vertices.push(p.clone());
    return vertices.length - 1;
  };

  const groups: { normal: THREE.Vector3; indices: Set<number> }[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    let group = groups.find((g) => g.normal.dot(normal) > 0.999);
    if (!group) {
      group = { normal, indices: new Set() };
      groups.push(group);
    }
    for (const p of [a, b, c]) group.indices.add(vertexIndex(p));
  }

  const faces = groups.map(({ normal, indices }): DieFace => {
    const ids = [...indices];
    const centroid = ids
      .reduce((sum, i) => sum.add(vertices[i]!), new THREE.Vector3())
      .divideScalar(ids.length);
    const u = new THREE.Vector3().subVectors(vertices[ids[0]!]!, centroid).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u);
    const angle = (i: number) => {
      const d = new THREE.Vector3().subVectors(vertices[i]!, centroid);
      return Math.atan2(d.dot(v), d.dot(u));
    };
    ids.sort((i, j) => angle(i) - angle(j));

    const radius = Math.max(...ids.map((i) => vertices[i]!.distanceTo(centroid)));
    let inradius = Infinity;
    for (let k = 0; k < ids.length; k++) {
      const p = vertices[ids[k]!]!;
      const q = vertices[ids[(k + 1) % ids.length]!]!;
      const edge = new THREE.Line3(p, q);
      inradius = Math.min(inradius, edge.closestPointToPoint(centroid, false, new THREE.Vector3()).distanceTo(centroid));
    }
    return { indices: ids, normal, centroid, u, v, radius, inset: inradius / radius };
  });

  return { kind, vertices, faces };
}

const geometries = new Map<DieKind, THREE.BufferGeometry>();

/** Flat-shaded mesh geometry with one material group per face, in face order. */
export function dieGeometry(shape: DieShape): THREE.BufferGeometry {
  let geometry = geometries.get(shape.kind);
  if (geometry) return geometry;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  geometry = new THREE.BufferGeometry();
  let start = 0;
  shape.faces.forEach((face, faceIndex) => {
    const d = new THREE.Vector3();
    for (let k = 1; k < face.indices.length - 1; k++) {
      for (const index of [face.indices[0]!, face.indices[k]!, face.indices[k + 1]!]) {
        const p = shape.vertices[index]!;
        positions.push(p.x, p.y, p.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        d.subVectors(p, face.centroid);
        // The face's circumcircle fills the texture square.
        uvs.push(0.5 + (d.dot(face.u) / face.radius) * 0.5, 0.5 + (d.dot(face.v) / face.radius) * 0.5);
      }
    }
    const count = (face.indices.length - 2) * 3;
    geometry!.addGroup(start, count, faceIndex);
    start += count;
  });
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometries.set(shape.kind, geometry);
  return geometry;
}
