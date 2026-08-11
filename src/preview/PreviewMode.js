/* =========================================================
   PreviewMode — the developer's window into the scene.

   NOT a product feature: portfolio-xr is XR-only by design, and a
   visitor without WebXR is sent to the 2D portfolio instead. This
   exists so the layout, textures, atlas UVs and state transitions
   can be authored and verified without a headset in hand.

   Reached with ?preview=1. It builds the same scene graph and
   drives the same Pointer abstraction, so what it shows is what
   the headset will show.
   ========================================================= */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/** Where the user's head would be on entry, so the preview frames
 *  the console exactly as the headset will. */
const EYE = new THREE.Vector3(0, 1.6, 0);
const ARC_CENTRE = new THREE.Vector3(0, 1.35, -1.4);

/** Quest 3's horizontal FOV. ?fov=quest frames the preview the way
 *  the headset will, which is the only way to check that the console
 *  really is readable without turning around. */
const QUEST_H_FOV = 104;
const DEFAULT_FOV = 62;

/** Window dimensions can be 0 before first layout (and in headless
 *  runs), which would poison every derived value with NaN. */
function viewAspect() {
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 720;
  return w / h;
}

const fovMode = new URLSearchParams(location.search).get("fov");

/** Vertical FOV for three.js. "quest" converts the headset's
 *  horizontal FOV for the current aspect, so it has to be recomputed
 *  whenever the window resizes. */
function verticalFov() {
  if (fovMode === "quest") {
    const hRad = (QUEST_H_FOV * Math.PI) / 180;
    return (2 * Math.atan(Math.tan(hRad / 2) / viewAspect()) * 180) / Math.PI;
  }
  const numeric = Number(fovMode);
  return Number.isFinite(numeric) && numeric > 20 && numeric < 150
    ? numeric
    : DEFAULT_FOV;
}

export function createPreview(renderer, scene) {
  const camera = new THREE.PerspectiveCamera(
    verticalFov(),
    viewAspect(),
    0.05,
    80
  );
  camera.updateProjectionMatrix();

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 14;
  controls.target.copy(ARC_CENTRE);

  // A dark ground plane and a horizon fade stand in for passthrough,
  // which is otherwise just transparent black on a desktop.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshBasicMaterial({
      color: 0x0a0e1a,
      transparent: true,
      opacity: 0.85,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = "preview-ground";

  const grid = new THREE.GridHelper(14, 28, 0x22d3ee, 0x1e293b);
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  grid.name = "preview-grid";
  grid.position.y = 0.002;

  scene.add(ground, grid);

  resetToEye();

  function resetToEye() {
    camera.position.copy(EYE).add(new THREE.Vector3(0, 0, 0.35));
    controls.target.copy(ARC_CENTRE);
    controls.update();
  }

  function overview() {
    camera.position.set(2.6, 3.4, 3.2);
    controls.target.set(0, 1.2, -1.2);
    controls.update();
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") resetToEye();
    if (e.key === "o" || e.key === "O") overview();
    if (e.key === "g" || e.key === "G") {
      grid.visible = !grid.visible;
      ground.visible = grid.visible;
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = viewAspect();
    camera.fov = verticalFov(); // the quest mapping depends on aspect
    camera.updateProjectionMatrix();
  });

  return {
    camera,
    controls,
    /** Stand-in for the XR head pose, so code that wants to know
     *  where the user is looking works identically here. */
    headPosition: () => camera.position.clone(),
    headQuaternion: () => camera.quaternion.clone(),
    update() {
      controls.update();
    },
    resetToEye,
    overview,
  };
}
