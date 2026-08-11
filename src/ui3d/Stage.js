/* =========================================================
   Stage — assembles the gallery inside the rig.

   Owns the slabs and their arrangement. Knows nothing about XR: it
   takes a rig Group, lays slabs out with Layout.js, and exposes a
   list of pickable objects for whatever Pointer is driving.
   ========================================================= */

import * as THREE from "three";
import { LAYOUT, TEX } from "../core/Theme.js";
import {
  researchSlots,
  hobbySlots,
  moreCapSlot,
  hobbyCapacity,
} from "./Layout.js";
import { Slab } from "./Slab.js";
import { WORKS } from "../../data/works.js";
import { HOBBY, FEATURED } from "../../data/hobby.js";
import { TILE_INDEX } from "../../data/atlas.js";

export function createStage({ mediaTexture = null, labelTexture = null } = {}) {
  const rig = new THREE.Group();
  rig.name = "rig";

  const shared = {
    mediaTexture,
    labelTexture,
    atlasSize: { width: TEX.atlas.width, height: TEX.atlas.height },
    labelGrid: { cols: TEX.label.cols, rows: TEX.label.rows },
  };

  let eyeY = 1.6;
  let hobbyVisible = FEATURED;

  /* --- research theme slabs ------------------------------- */
  const researchSlabs = WORKS.map((theme, i) =>
    new Slab({
      ...shared,
      key: theme.key,
      kind: "research",
      data: theme,
      tileIndex: TILE_INDEX.get(theme.cover),
      labelIndex: i,
      width: LAYOUT.research.width,
      height: LAYOUT.research.height,
      mediaWidth: LAYOUT.research.mediaWidth,
      mediaHeight: LAYOUT.research.mediaHeight,
    })
  );

  if (HOBBY.length > hobbyCapacity()) {
    throw new Error(
      `Layout overflow: ${HOBBY.length} prototypes exceed the ${hobbyCapacity()} rank slots in Theme.LAYOUT.hobby.ranks.`
    );
  }

  /* --- prototype slabs ------------------------------------ */
  const hobbySlabs = HOBBY.map((item, i) =>
    new Slab({
      ...shared,
      key: item.id,
      kind: "hobby",
      data: item,
      tileIndex: TILE_INDEX.get(item.id),
      // Label slots continue past the three research strips.
      labelIndex: WORKS.length + i,
      width: LAYOUT.hobby.width,
      height: LAYOUT.hobby.height,
      mediaWidth: LAYOUT.hobby.mediaWidth,
      mediaHeight: LAYOUT.hobby.mediaHeight,
    })
  );

  const allSlabs = [...researchSlabs, ...hobbySlabs];
  for (const slab of allSlabs) rig.add(slab.object3d);

  function layout(immediate = false) {
    researchSlots(eyeY).forEach((slot, i) =>
      researchSlabs[i].seat(slot, immediate)
    );

    const slots = hobbySlots(hobbyVisible, eyeY);
    hobbySlabs.forEach((slab, i) => {
      if (i < hobbyVisible) {
        slab.seat(slots[i], immediate);
        slab.setVisible(true);
        slab.setOpacity(1);
      } else {
        // Parked at the outermost rank so revealing them reads as
        // the corridor growing outward rather than a pop-in.
        const parked = slots[Math.min(i, slots.length - 1)] ?? slots.at(-1);
        if (parked) slab.seat(parked, true);
        slab.setVisible(false);
        slab.setOpacity(0);
      }
    });
  }

  layout(true);

  return {
    rig,
    researchSlabs,
    hobbySlabs,
    allSlabs,

    get pickables() {
      return allSlabs.filter((s) => s.visible).map((s) => s.pickable);
    },

    slabFor(object) {
      return object?.userData?.slab ?? null;
    },

    /** Re-layout for the measured head height. Called once the first
     *  XR pose lands, since a 1.5 m and a 1.9 m user want different
     *  pitch on the lower row. */
    setEyeHeight(y, immediate = false) {
      eyeY = THREE.MathUtils.clamp(y, 1.1, 2.1);
      layout(immediate);
    },

    setHobbyVisible(count) {
      hobbyVisible = THREE.MathUtils.clamp(count, 0, HOBBY.length);
      layout(false);
      return hobbyVisible;
    },

    get hobbyVisibleCount() {
      return hobbyVisible;
    },

    moreCap: () => moreCapSlot(eyeY),

    update(dt) {
      for (const slab of allSlabs) slab.update(dt);
    },

    dispose() {
      for (const slab of allSlabs) slab.dispose();
    },
  };
}
