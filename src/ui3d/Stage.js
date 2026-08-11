/* =========================================================
   Stage — assembles the gallery inside the rig.

   Owns the slabs, their textures and their arrangement. Knows
   nothing about XR: it takes a rig Group, lays slabs out with
   Layout.js, and exposes a list of pickables for whatever Pointer
   happens to be driving.
   ========================================================= */

import * as THREE from "three";
import { LAYOUT, slabMetrics } from "../core/Theme.js";
import {
  researchSlots,
  hobbySlots,
  moreCapSlot,
  hobbyCapacity,
} from "./Layout.js";
import { Slab } from "./Slab.js";
import { cardChromeTexture, paintLabelAtlas } from "./TextPainter.js";
import { WORKS } from "../../data/works.js";
import { HOBBY, FEATURED } from "../../data/hobby.js";
import { TILE_INDEX } from "../../data/atlas.js";

export function createStage({ mediaTexture = null } = {}) {
  const rig = new THREE.Group();
  rig.name = "rig";

  if (HOBBY.length > hobbyCapacity()) {
    throw new Error(
      `Layout overflow: ${HOBBY.length} prototypes exceed the ${hobbyCapacity()} ` +
        `rank slots in Theme.LAYOUT.hobby.ranks.`
    );
  }

  const researchMetrics = slabMetrics(LAYOUT.research.mediaWidth);
  const hobbyMetrics = slabMetrics(LAYOUT.hobby.mediaWidth);

  /* --- one label strip per slab, in slab order -------------
     Research first, then prototypes, so the index a slab uses to
     sample the atlas is just its position in this list. */
  const labelEntries = [
    ...WORKS.map((theme) => ({
      title: theme.title,
      eyebrow: theme.eyebrow,
      tags: [`${theme.projects.length} projects`],
      widthMetres: researchMetrics.labelWidth,
      distance: LAYOUT.research.radius,
    })),
    ...HOBBY.map((item, i) => ({
      title: item.title,
      tags: item.tags,
      widthMetres: hobbyMetrics.labelWidth,
      // Type sized for the rank the slab actually sits in, so the
      // outer ranks stay as readable as the near one.
      distance: rankRadiusFor(i),
    })),
  ];
  const labelTexture = paintLabelAtlas(labelEntries);

  const researchChrome = cardChromeTexture(
    researchMetrics.width / researchMetrics.height
  );
  const hobbyChrome = cardChromeTexture(
    hobbyMetrics.width / hobbyMetrics.height
  );

  function rankRadiusFor(index) {
    const { ranks } = LAYOUT.hobby;
    let remaining = index;
    for (const rank of ranks) {
      if (remaining < rank.capacity) return rank.radius;
      remaining -= rank.capacity;
    }
    return ranks[ranks.length - 1].radius;
  }

  /* --- research theme slabs ------------------------------- */
  const researchSlabs = WORKS.map(
    (theme, i) =>
      new Slab({
        key: theme.key,
        kind: "research",
        data: theme,
        metrics: researchMetrics,
        tileIndex: TILE_INDEX.get(theme.cover),
        labelIndex: i,
        mediaTexture,
        labelTexture,
        chromeTexture: researchChrome,
      })
  );

  /* --- prototype slabs ------------------------------------ */
  const hobbySlabs = HOBBY.map(
    (item, i) =>
      new Slab({
        key: item.id,
        kind: "hobby",
        data: item,
        metrics: hobbyMetrics,
        tileIndex: TILE_INDEX.get(item.id),
        labelIndex: WORKS.length + i,
        mediaTexture,
        labelTexture,
        chromeTexture: hobbyChrome,
      })
  );

  const allSlabs = [...researchSlabs, ...hobbySlabs];
  for (const slab of allSlabs) rig.add(slab.object3d);

  let eyeY = 1.6;
  let hobbyVisible = FEATURED;

  function layout(immediate = false) {
    researchSlots(eyeY).forEach((slot, i) => {
      researchSlabs[i].seat(slot, immediate);
      researchSlabs[i].setVisible(true);
      researchSlabs[i].setOpacity(1);
    });

    // Lay out every rank, so hidden slabs still have a home to fly
    // out to when "+N MORE" reveals them.
    const slots = hobbySlots(HOBBY.length, eyeY);
    hobbySlabs.forEach((slab, i) => {
      slab.seat(slots[i], immediate || i >= hobbyVisible);
      const shown = i < hobbyVisible;
      slab.setVisible(shown);
      slab.setOpacity(shown ? 1 : 0);
    });
  }

  layout(true);

  return {
    rig,
    researchSlabs,
    hobbySlabs,
    allSlabs,
    labelTexture,

    get pickables() {
      return allSlabs.filter((s) => s.visible).map((s) => s.pickable);
    },

    slabFor(object) {
      return object?.userData?.slab ?? null;
    },

    /** Swap placeholder media for the real atlas video once it is
     *  decoding. */
    setMediaTexture(texture) {
      for (const slab of allSlabs) slab.setMediaTexture(texture);
    },

    /** Re-layout for the measured head height. Called once the first
     *  XR pose lands, since a 1.5 m and a 1.9 m user want different
     *  pitch on the lower rows. */
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

    get metrics() {
      return { research: researchMetrics, hobby: hobbyMetrics };
    },

    moreCapSlot: () => moreCapSlot(eyeY),

    update(dt) {
      for (const slab of allSlabs) slab.update(dt);
    },

    dispose() {
      for (const slab of allSlabs) slab.dispose();
      labelTexture.dispose();
    },
  };
}
