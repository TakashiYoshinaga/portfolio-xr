/* =========================================================
   Pointer — one selection abstraction for every input device.

   The spec already did the hard part. Quest controllers, Quest hand
   pinch and an Android screen tap all surface as an XRInputSource
   with a targetRaySpace and the same select events; on a phone the
   ray already runs from the camera through the touch point. So a
   single raycast covers all three with no branching.

   Preview mode implements the same interface from mouse events, so
   everything downstream — hover, focus, video acquisition — never
   learns which device it is running on.

   Only tracked-pointer sources draw a visible ray. A ray emitted
   from your own face on a phone looks broken.
   ========================================================= */

import * as THREE from "three";
import { COLOR } from "../core/Theme.js";

const RAY_LENGTH = 5;

function makeRayLine() {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  // Fading toward the far end reads as a beam rather than a stick.
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute([0.13, 0.83, 0.93, 0.38, 0.65, 0.98], 3)
  );
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new THREE.Line(geometry, material);
  line.scale.z = RAY_LENGTH;
  line.renderOrder = 10;
  return line;
}

function makeCursor() {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.006, 0.011, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLOR.accent),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
  );
  mesh.renderOrder = 11;
  mesh.visible = false;
  return mesh;
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {() => THREE.Object3D[]} getTargets  fresh pickables each query
 * @param {{onHover?:Function, onSelect?:Function}} handlers
 */
export function createPointer(renderer, scene, getTargets, handlers = {}) {
  const raycaster = new THREE.Raycaster();
  const tmpMatrix = new THREE.Matrix4();
  const cursor = makeCursor();
  scene.add(cursor);

  let hovered = null;
  let enabled = true;

  const controllers = [0, 1].map((i) => {
    const controller = renderer.xr.getController(i);
    controller.name = `controller-${i}`;
    const line = makeRayLine();
    line.visible = false;
    controller.add(line);
    controller.userData.line = line;
    scene.add(controller);

    controller.addEventListener("connected", (event) => {
      controller.userData.inputSource = event.data;
      // Screen (phone tap) and gaze sources get no visible beam.
      line.visible = event.data?.targetRayMode === "tracked-pointer";
    });
    controller.addEventListener("disconnected", () => {
      controller.userData.inputSource = null;
      line.visible = false;
    });
    controller.addEventListener("selectstart", () => {
      controller.userData.selecting = true;
    });
    controller.addEventListener("select", () => {
      if (!enabled) return;
      const hit = intersectFrom(controller);
      handlers.onSelect?.(hit?.object ?? null, hit ?? null);
    });
    controller.addEventListener("selectend", () => {
      controller.userData.selecting = false;
    });

    return controller;
  });

  function intersectFrom(controller) {
    const targets = getTargets();
    if (!targets.length) return null;
    tmpMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tmpMatrix).normalize();
    const hits = raycaster.intersectObjects(targets, false);
    return hits.find((h) => h.object.userData.pickable !== false) ?? null;
  }

  /** Preview mode feeds screen-space coordinates through the same
   *  raycaster so the downstream behaviour is identical. */
  function intersectFromCamera(camera, ndc) {
    const targets = getTargets();
    if (!targets.length) return null;
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(targets, false);
    return hits.find((h) => h.object.userData.pickable !== false) ?? null;
  }

  function applyHover(hit) {
    const object = hit?.object ?? null;
    if (object !== hovered) {
      handlers.onHover?.(object, hovered);
      hovered = object;
    }
    if (hit) {
      // Every target is a plane, so matching the object's own
      // orientation lays the ring flat on it. The small push along
      // its normal keeps the ring from z-fighting the slab.
      cursor.visible = true;
      hit.object.getWorldQuaternion(cursor.quaternion);
      cursor.position.copy(hit.point);
      cursor.translateZ(0.004);
    } else {
      cursor.visible = false;
    }
    return object;
  }

  return {
    controllers,
    cursor,

    setEnabled(on) {
      enabled = on;
      if (!on) {
        cursor.visible = false;
        applyHover(null);
      }
    },

    get hovered() {
      return hovered;
    },

    /** XR path: called every frame from the loop. */
    updateXR() {
      if (!enabled) return;
      let best = null;
      for (const controller of controllers) {
        if (!controller.userData.inputSource) continue;
        const hit = intersectFrom(controller);
        if (hit && (!best || hit.distance < best.distance)) best = hit;
        const line = controller.userData.line;
        if (line) line.scale.z = hit ? hit.distance : RAY_LENGTH;
      }
      applyHover(best);
    },

    /** Preview path: mouse move / click. */
    updatePreview(camera, ndc) {
      if (!enabled) return;
      applyHover(intersectFromCamera(camera, ndc));
    },

    selectPreview(camera, ndc) {
      if (!enabled) return;
      const hit = intersectFromCamera(camera, ndc);
      handlers.onSelect?.(hit?.object ?? null, hit ?? null);
    },
  };
}
