import * as THREE from "three";
import type { Track } from "./track";

/** Road-aligned marks and approach boards, built once for the night circuit. */
export function addMonzonRoadDetails(track: Track): void {
  const corners: number[] = [];
  const spacing = Math.ceil(190 / track.segmentLength);
  for (let i = 0; i < track.samples.length; i++) {
    if (track.curvatures[i] < .009) continue;
    if (corners.some(previous => Math.min(Math.abs(i - previous),
      track.samples.length - Math.abs(i - previous)) < spacing)) continue;
    corners.push(i);
  }

  const rubber = new THREE.MeshStandardMaterial({
    color: 0x08090a, roughness: .98, polygonOffset: true,
    polygonOffsetFactor: -1, polygonOffsetUnits: -1
  });
  const positions: number[] = [];
  const indices: number[] = [];
  for (const corner of corners) {
    for (const lane of [-.8, .8]) {
      const start = positions.length / 3;
      const steps = Math.ceil(65 / track.segmentLength);
      for (let step = 0; step <= steps; step++) {
        const index = corner - steps + step;
        const point = track.sampleAt(index);
        const right = track.rightAt(index);
        for (const edge of [-.10, .10]) {
          positions.push(point.x + right.x * (lane + edge), point.y + .024,
            point.z + right.z * (lane + edge));
        }
        if (step < steps) {
          const vertex = start + step * 2;
          indices.push(vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3);
        }
      }
    }
    for (const distance of [150, 100, 50]) {
      const index = corner - Math.round(distance / track.segmentLength);
      const point = track.sampleAt(index);
      const right = track.rightAt(index);
      const tangent = track.tangentAt(index);
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#e7e9dc";
      context.fillRect(0, 0, 128, 128);
      context.fillStyle = "#14202b";
      context.font = "bold 64px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(distance), 64, 67);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8),
        new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
      board.position.copy(point).addScaledVector(right, track.barrierLateralOffset + 1);
      board.position.y += 2.5;
      board.lookAt(board.position.clone().sub(tangent));
      board.name = "monzon-corner-distance-" + distance;
      track.group.add(board);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const marks = new THREE.Mesh(geometry, rubber);
  marks.name = "monzon-braking-rubber";
  track.group.add(marks);
}
