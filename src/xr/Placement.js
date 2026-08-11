/* =========================================================
   Placement — put the gallery in front of the user, immediately.

   Deliberately no hit-test and no tap-to-place on either device.
   The brief was explicit: nothing to configure, content readable
   within 1-2 m the moment you arrive. So we read the first viewer
   pose and drop the rig there.

   Rig convention: origin sits at the user's feet (directly below
   the head), -Z points where they were looking, flattened to the
   horizon. Every number in Theme.LAYOUT is expressed in this space.
   ========================================================= */

import * as THREE from "three";

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _fwd = new THREE.Vector3();

export function createPlacement(rig) {
  let placed = false;
  let headHeight = 1.6; // sensible default until the first pose lands
  let refSpaceType = "local-floor";

  function apply(headPos, headQuat) {
    // Flatten the look direction — a user glancing at the floor on
    // entry should not tip the whole gallery.
    _fwd.set(0, 0, -1).applyQuaternion(headQuat);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();

    rig.position.set(headPos.x, 0, headPos.z);

    // With 'local', the origin is roughly at head height rather than
    // the floor, so push the rig down by the measured head height to
    // recover floor-relative layout.
    if (refSpaceType !== "local-floor" && refSpaceType !== "bounded-floor") {
      rig.position.y = headPos.y - headHeight;
    }

    rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), _fwd);
    rig.updateMatrixWorld(true);
  }

  return {
    setReferenceSpaceType(type) {
      refSpaceType = type;
    },

    get isPlaced() {
      return placed;
    },

    /** Head height as measured on the first frame — useful for
     *  raising the layout for a tall or seated user later. */
    get headHeight() {
      return headHeight;
    },

    /** Call every frame. Does nothing once placed unless recenter()
     *  has armed it again. */
    update(frame, refSpace) {
      if (placed || !frame) return false;
      const pose = frame.getViewerPose(refSpace);
      if (!pose) return false;

      const { position, orientation } = pose.transform;
      _pos.set(position.x, position.y, position.z);
      _quat.set(orientation.x, orientation.y, orientation.z, orientation.w);

      // On a floor-relative space the viewer's y IS the head height.
      if (refSpaceType === "local-floor" || refSpaceType === "bounded-floor") {
        if (_pos.y > 0.8 && _pos.y < 2.4) headHeight = _pos.y;
      }

      apply(_pos, _quat);
      placed = true;
      return true;
    },

    /** Re-arm placement; the next frame re-seats the gallery on the
     *  user's current pose. This is the difference between a usable
     *  and unusable session when someone enters facing a wall. */
    recenter() {
      placed = false;
    },

    /** Preview mode has no XR frames — seat the rig at the origin. */
    placeForPreview() {
      rig.position.set(0, 0, 0);
      rig.quaternion.identity();
      rig.updateMatrixWorld(true);
      placed = true;
    },
  };
}
