/* =========================================================
   Layout — where every slab sits, as pure maths.

   Knows nothing about XR, video or textures. Given the constants in
   Theme.LAYOUT it returns slots: position, rotation and size in rig
   space. That keeps the arrangement testable in preview mode and
   makes the corridor states a matter of asking for a different set
   of slots rather than rewriting the scene.

   Rig space: origin at the user's feet, -Z forward, +X right.
   An angle is measured from forward; positive turns right.
   ========================================================= */

import * as THREE from "three";
import { LAYOUT } from "../core/Theme.js";

const DEG = Math.PI / 180;

/**
 * Place a slab on an arc and turn it to face the viewer.
 *
 * A plane's front face is +Z. Rotating by -theta about Y aims that
 * face back at the origin; the X rotation then tilts it toward the
 * eye so the lower row is not read edge-on.
 */
export function arcSlot(angleDeg, radius, y, eyeY) {
  const a = angleDeg * DEG;
  const position = new THREE.Vector3(
    radius * Math.sin(a),
    y,
    -radius * Math.cos(a)
  );
  const pitch = -Math.atan2(eyeY - y, radius);
  const rotation = new THREE.Euler(pitch, -a, 0, "YXZ");
  return { position, rotation };
}

/**
 * The three research themes, stacked vertically in one column.
 *
 * A column rather than a row because the 2D site presents them as a
 * vertical accordion, and because three side-by-side slabs would eat
 * 60 deg of the field of view that the prototype grid needs.
 */
export function researchSlots(eyeY) {
  const { research } = LAYOUT;
  return research.rowY.map((y, i) => ({
    ...arcSlot(research.angle, research.radius, y, eyeY),
    index: i,
  }));
}

/**
 * Prototype slabs — a flat grid on a single radius, in both states.
 *
 * Expanding does not push cards into depth; it reflows the grid to
 * more columns and rows and scales the cards down to fit. Every card
 * stays the same distance away, so none can end up behind another.
 *
 * @param {number} count how many slabs to lay out
 * @param {boolean} expanded which grid to use
 */
export function hobbySlots(count, eyeY, expanded = false) {
  const { hobby } = LAYOUT;
  const grid = expanded
    ? hobby.expanded
    : { angles: hobby.angles, rowY: hobby.rowY, scale: 1 };
  const cols = grid.angles.length;
  const slots = [];

  for (let i = 0; i < count; i++) {
    const row = Math.min(Math.floor(i / cols), grid.rowY.length - 1);
    const col = i % cols;
    slots.push({
      ...arcSlot(grid.angles[col], hobby.radius, grid.rowY[row], eyeY),
      scale: grid.scale,
      index: i,
    });
  }
  return slots;
}

/** Slots in the expanded grid — a guard against the data outgrowing
 *  the layout silently. */
export function hobbyCapacity() {
  const { expanded } = LAYOUT.hobby;
  return expanded.angles.length * expanded.rowY.length;
}

/** The "+N MORE" / "LESS" control, on the rail below everything. */
export function moreCapSlot(eyeY) {
  const { moreCap } = LAYOUT;
  return arcSlot(moreCap.angle, moreCap.radius, moreCap.y, eyeY);
}

/**
 * The corridor: an expanded theme's projects recede along -Z on the
 * left, turned toward the centre line. This is the only state where
 * content sits beyond arm's reach, and selecting a distant slab
 * glides the user to it rather than making them walk.
 */
/**
 * An expanded theme's projects: a 2x2 grid in the space the other two
 * themes vacate, below the expanded theme's own card.
 */
export function projectSlots(count, eyeY) {
  const { projects } = LAYOUT;
  const cols = projects.angles.length;
  const slots = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    slots.push({
      ...arcSlot(
        projects.angles[col],
        projects.radius,
        projects.rowY[Math.min(row, projects.rowY.length - 1)],
        eyeY
      ),
      index: i,
    });
  }
  return slots;
}

/**
 * Where a project card enters from: the same slot, pushed deep down
 * -Z and shrunk. Letting the slab's own easing pull it forward is
 * what makes the expansion read as a corridor rushing toward you
 * rather than cards fading in.
 */
export function projectEntrySlot(slot) {
  const { projects } = LAYOUT;
  const position = slot.position.clone();
  position.z -= projects.flyDepth;
  return { position, rotation: slot.rotation, scale: projects.flyScale };
}

/** An expanded theme takes the top of its own column and its
 *  projects fill the space below. */
export function themeHeaderSlot(eyeY) {
  const { research } = LAYOUT;
  return arcSlot(research.angle, research.radius, research.rowY[0], eyeY);
}

/** The recenter control, under the spine between the two banks. */
export function recenterSlot(eyeY) {
  const { recenter } = LAYOUT;
  return arcSlot(recenter.angle, recenter.radius, recenter.y, eyeY);
}

/**
 * Where a focused item opens: in front of whichever way the viewer is
 * facing, but always upright and always at the same height and
 * distance, whichever card was selected.
 *
 * Yaw is the only thing taken from the head. Keeping pitch — which is
 * what this did originally — meant looking down at a low card threw
 * the panel down along that gaze and tilted it to match, so both the
 * height and the lean changed with every selection.
 *
 * Inputs and output are all RIG-local. The panel is a child of the
 * rig, so a slot derived from a world-space head pose is off by the
 * rig's own yaw — invisible in preview, where the rig is unrotated,
 * and wrong in a session, where placement yaws it to the direction
 * the user happened to be facing on entry.
 */
export function focusSlot(headLocalPosition, headLocalForward, eyeY) {
  const { focus } = LAYOUT;

  const fwd = headLocalForward.clone();
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();

  const position = new THREE.Vector3(
    headLocalPosition.x,
    0,
    headLocalPosition.z
  ).addScaledVector(fwd, focus.distance);
  position.y = eyeY + focus.yOffset; // independent of where they looked

  // Turn the panel's front face (+Z) back toward the head. X and Z
  // stay at zero, which is what keeps it upright to the ground.
  const rotation = new THREE.Euler(0, Math.atan2(-fwd.x, -fwd.z), 0, "YXZ");
  return { position, rotation };
}
