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
    width: research.width,
    height: research.height,
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
        width: hobby.width,
        height: hobby.height,
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
  return {
    ...arcSlot(
      hobby.angles[cols - 1],
      rank.radius,
      rank.rowY[rows - 1],
      eyeY
    ),
    width: hobby.width * 0.86,
    height: hobby.height * 0.42,
  };
}

/**
 * The corridor: an expanded theme's projects recede along -Z on the
 * left, turned toward the centre line. This is the only state where
 * content sits beyond arm's reach, and selecting a distant slab
 * glides the user to it rather than making them walk.
 */
export function corridorSlots(count, eyeY) {
  const { corridor, research } = LAYOUT;
  const slots = [];
  for (let i = 0; i < count; i++) {
    const z = corridor.z[Math.min(i, corridor.z.length - 1)];
    const position = new THREE.Vector3(corridor.x, corridor.y, z);
    // Turned toward the corridor's centre line rather than at the
    // origin — the user walks (or glides) down it, so a fixed yaw
    // reads better than one that points back at the entrance.
    const rotation = new THREE.Euler(
      -Math.atan2(eyeY - corridor.y, Math.abs(z)) * 0.5,
      corridor.yaw * DEG,
      0,
      "YXZ"
    );
    slots.push({
      position,
      rotation,
      width: research.width * 1.15,
      height: research.height * 1.15,
      index: i,
    });
  }
  return slots;
}

/** Where an expanded theme's header parks itself. */
export function themeHeaderSlot(eyeY) {
  const { corridor, research } = LAYOUT;
  return {
    ...arcSlot(corridor.headerAngle, corridor.headerRadius, research.y, eyeY),
    width: research.width,
    height: research.height,
  };
}

/** The four tag chips, below the prototype bank. */
export function tagRailSlots(eyeY) {
  const { tagRail } = LAYOUT;
  return tagRail.angles.map((angle, i) => ({
    ...arcSlot(angle, tagRail.radius, tagRail.y, eyeY),
    width: 0.15,
    height: 0.05,
    index: i,
  }));
}

/** Dead ahead of the user's current gaze, where a focused item lands. */
export function focusSlot(headPosition, headQuaternion) {
  const { focus } = LAYOUT;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuaternion);
  const position = headPosition.clone().addScaledVector(forward, focus.distance);
  const rotation = new THREE.Euler().setFromQuaternion(headQuaternion, "YXZ");
  rotation.z = 0; // never roll the panel, however the head is tilted
  return {
    position,
    rotation,
    width: focus.panelWidth,
    height: focus.panelHeight,
  };
}
