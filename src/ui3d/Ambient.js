/* =========================================================
   Ambient — the furniture that is not content.

   Three jobs, all of them orientation: the spine says whose gallery
   this is and marks the seam between the two banks, the floor ring
   grounds the console in the room, and the motes give the space a
   sense of depth that a passthrough view of an empty room does not.

   Deliberately restrained. In AR every one of these is drawn over
   the user's actual room, and transparent overdraw — not draw calls
   — is the real fill-rate cost on a headset. Everything here is
   additive-blended and thin.
   ========================================================= */

import * as THREE from "three";
import { COLOR, LAYOUT } from "../core/Theme.js";
import { spinePlateTexture } from "./TextPainter.js";
import { arcSlot } from "./Layout.js";

const SPINE_ANGLE = -16; // the gap between the research and prototype banks
const SPINE_RADIUS = 1.72;
const PLATE_WIDTH = 0.44;
const MOTE_COUNT = 90;

export function createAmbient() {
  const group = new THREE.Group();
  group.name = "ambient";

  /* --- vertical spine ------------------------------------- */
  // A tall thin quad with a gradient painted into vertex colours —
  // cheaper and sharper than a texture for a two-stop fade.
  const spineGeo = new THREE.PlaneGeometry(0.006, 1.55);
  const colors = new Float32Array(4 * 3);
  const top = new THREE.Color(COLOR.accent);
  const bottom = new THREE.Color(COLOR.accent3);
  for (let i = 0; i < 4; i++) {
    const c = i < 2 ? top : bottom;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  spineGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const spine = new THREE.Mesh(
    spineGeo,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  group.add(spine);

  /* --- identity plate ------------------------------------- */
  const plateTexture = spinePlateTexture({
    name: "Takashi Yoshinaga",
    subtitle: "XR PORTFOLIO",
    widthMetres: PLATE_WIDTH,
    distance: SPINE_RADIUS,
  });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATE_WIDTH, PLATE_WIDTH / 2),
    new THREE.MeshBasicMaterial({
      map: plateTexture,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false,
    })
  );
  group.add(plate);

  /* --- floor ring ----------------------------------------- */
  // Grounds the console in the room. Kept faint: with a 'local'
  // reference space the floor is an estimate, and a bright ring
  // floating off the actual floor looks broken.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.66, 1.69, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLOR.accent),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  group.add(ring);

  /* --- drifting motes ------------------------------------- */
  const positions = new Float32Array(MOTE_COUNT * 3);
  const phases = new Float32Array(MOTE_COUNT);
  // Deterministic scatter: Math.random would give a different room
  // every reload, and a hash of the index costs nothing.
  const hash = (n) => {
    const x = Math.sin(n * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < MOTE_COUNT; i++) {
    const angle = (hash(i) * 2 - 1) * Math.PI * 0.75;
    const radius = 1.1 + hash(i + 100) * 2.4;
    positions[i * 3] = Math.sin(angle) * radius;
    positions[i * 3 + 1] = 0.3 + hash(i + 200) * 2.2;
    positions[i * 3 + 2] = -Math.cos(angle) * radius;
    phases[i] = hash(i + 300) * Math.PI * 2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color(COLOR.accent2),
      size: 0.012,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
  group.add(motes);

  const baseY = new Float32Array(MOTE_COUNT);
  for (let i = 0; i < MOTE_COUNT; i++) baseY[i] = positions[i * 3 + 1];

  let elapsed = 0;
  let eyeY = 1.6;

  function layout() {
    const spineSlot = arcSlot(SPINE_ANGLE, SPINE_RADIUS, 1.35, eyeY);
    spine.position.copy(spineSlot.position);
    spine.rotation.copy(spineSlot.rotation);

    const plateSlot = arcSlot(SPINE_ANGLE, SPINE_RADIUS, 2.16, eyeY);
    plate.position.copy(plateSlot.position);
    plate.rotation.copy(plateSlot.rotation);
  }

  layout();

  return {
    object3d: group,

    setEyeHeight(y) {
      eyeY = y;
      layout();
    },

    /** Faded down while an item is focused, so the panel is not
     *  competing with decoration. */
    setDimmed(on) {
      const scale = on ? LAYOUT.dim.focusBackdrop : 1;
      spine.material.opacity = 0.4 * scale;
      plate.material.opacity = 0.92 * scale;
      ring.material.opacity = 0.16 * scale;
      motes.material.opacity = 0.5 * scale;
    },

    update(dt) {
      elapsed += dt;
      const attr = motes.geometry.attributes.position;
      for (let i = 0; i < MOTE_COUNT; i++) {
        attr.array[i * 3 + 1] =
          baseY[i] + Math.sin(elapsed * 0.28 + phases[i]) * 0.09;
      }
      attr.needsUpdate = true;
      motes.rotation.y = elapsed * 0.012;
    },

    dispose() {
      for (const mesh of [spine, plate, ring, motes]) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      plateTexture.dispose();
    },
  };
}
