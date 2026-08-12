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
 * Prototype slabs, laid out as a 3x3 grid per rank.
 *
 * Rank 0 holds the 8 shown on entry and keeps its 9th grid slot for
 * the MORE/LESS cap; ranks 1 and 2 hold the remaining 14 and are
 * revealed by that cap.
 *
 * @param {number} count how many slabs to lay out (8 or 22)
 */
export function hobbySlots(count, eyeY) {
  const { hobby } = LAYOUT;
  const cols = hobby.angles.length;
  const slots = [];

  let remaining = count;
  let rankIndex = 0;

  while (remaining > 0 && rankIndex < hobby.ranks.length) {
    const rank = hobby.ranks[rankIndex];
    const take = Math.min(remaining, rank.capacity);
    for (let i = 0; i < take; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      slots.push({
        ...arcSlot(hobby.angles[col], rank.radius, rank.rowY[row], eyeY),
        index: slots.length,
        rank: rankIndex,
      });
    }
    remaining -= take;
    rankIndex++;
  }
  return slots;
}

/** Total capacity across all ranks — a guard against the data
 *  outgrowing the layout silently. */
export function hobbyCapacity() {
  return LAYOUT.hobby.ranks.reduce((sum, r) => sum + r.capacity, 0);
}

/** The "+N MORE" / "LESS" cap. Fixed at rank 0's unused 9th grid
 *  slot (bottom right) so it never moves as ranks appear. */
export function moreCapSlot(eyeY) {
  const { hobby } = LAYOUT;
  const rank = hobby.ranks[0];
  const cols = hobby.angles.length;
  const rows = rank.rowY.length;
  return arcSlot(
    hobby.angles[cols - 1],
    rank.radius,
    rank.rowY[rows - 1],
    eyeY
  );
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

/** The four tag chips, below the prototype bank. */
export function tagRailSlots(eyeY) {
  const { tagRail } = LAYOUT;
  return tagRail.angles.map((angle, i) => ({
    ...arcSlot(angle, tagRail.radius, tagRail.y, eyeY),
    index: i,
  }));
}

/** The recenter control, under the spine between the two banks. */
export function recenterSlot(eyeY) {
  const { recenter } = LAYOUT;
  return arcSlot(recenter.angle, recenter.radius, recenter.y, eyeY);
}

/** Dead ahead of the user's current gaze, where a focused item lands. */
export function focusSlot(headPosition, headQuaternion) {
  const { focus } = LAYOUT;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuaternion);
  const position = headPosition.clone().addScaledVector(forward, focus.distance);
  const rotation = new THREE.Euler().setFromQuaternion(headQuaternion, "YXZ");
  rotation.z = 0; // never roll the panel, however the head is tilted
  return { position, rotation };
}
