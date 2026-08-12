/* =========================================================
   Stage — assembles the gallery inside the rig.

   Owns every slab, chip and texture, and the arrangement maths that
   places them. Knows nothing about XR: it takes a rig Group, lays
   things out with Layout.js, and exposes a list of pickables for
   whatever Pointer happens to be driving.

   The state machine that moves between the console, an expanded
   theme and a focused item lives in Gallery.js.
   ========================================================= */

import * as THREE from "three";
import { COLOR, LAYOUT, slabMetrics } from "../core/Theme.js";
import {
  researchSlots,
  hobbySlots,
  moreCapSlot,
  projectSlots,
  projectEntrySlot,
  themeHeaderSlot,
  tagRailSlots,
  recenterSlot,
  hobbyCapacity,
} from "./Layout.js";
import { Slab } from "./Slab.js";
import { Chip } from "./Chip.js";
import { cardChromeTexture, paintLabelAtlas } from "./TextPainter.js";
import { WORKS } from "../../data/works.js";
import { HOBBY, FEATURED, TAGS } from "../../data/hobby.js";
import { TILE_INDEX } from "../../data/atlas.js";
import { TAG_COLOR } from "../core/Theme.js";

const CHIP_WIDTH = 0.17;
const CHIP_HEIGHT = 0.064;

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
  const projectMetrics = slabMetrics(LAYOUT.projects.mediaWidth);

  /* Type is sized for the distance a slab is actually viewed from,
     so the outer ranks stay as readable as the near one. */
  function rankRadiusFor(index) {
    let remaining = index;
    for (const rank of LAYOUT.hobby.ranks) {
      if (remaining < rank.capacity) return rank.radius;
      remaining -= rank.capacity;
    }
    return LAYOUT.hobby.ranks.at(-1).radius;
  }

  const projects = WORKS.flatMap((theme) =>
    theme.projects.map((p) => ({ ...p, themeKey: theme.key }))
  );

  /* --- label atlas ----------------------------------------
     One strip per slab and chip, in this exact order. A slab's
     labelIndex is just its position in this list. */
  const labelEntries = [
    ...WORKS.map((theme) => ({
      title: theme.title,
      eyebrow: theme.eyebrow,
      tags: [`${theme.projects.length} projects`],
      widthMetres: researchMetrics.labelWidth,
      distance: LAYOUT.research.radius,
    })),
    ...projects.map((p) => ({
      title: p.title,
      eyebrow: p.partner ?? null,
      widthMetres: projectMetrics.labelWidth,
      distance: LAYOUT.projects.radius,
    })),
    ...HOBBY.map((item, i) => ({
      title: item.title,
      tags: item.tags,
      widthMetres: hobbyMetrics.labelWidth,
      distance: rankRadiusFor(i),
    })),
    { variant: "chip", title: "+ more", widthMetres: CHIP_WIDTH, distance: 1.6 },
    { variant: "chip", title: "less", widthMetres: CHIP_WIDTH, distance: 1.6 },
    ...TAGS.map((tag) => ({
      variant: "chip",
      title: tag,
      accent: TAG_COLOR[tag],
      widthMetres: CHIP_WIDTH,
      distance: LAYOUT.tagRail.radius,
    })),
    {
      variant: "chip",
      title: "recenter",
      accent: COLOR.textMuted,
      widthMetres: CHIP_WIDTH,
      distance: LAYOUT.recenter.radius,
    },
  ];
  const labelTexture = paintLabelAtlas(labelEntries);

  const LABEL_BASE = {
    themes: 0,
    projects: WORKS.length,
    hobby: WORKS.length + projects.length,
    more: WORKS.length + projects.length + HOBBY.length,
  };
  LABEL_BASE.less = LABEL_BASE.more + 1;
  LABEL_BASE.tags = LABEL_BASE.more + 2;
  LABEL_BASE.recenter = LABEL_BASE.tags + TAGS.length;

  const researchChrome = cardChromeTexture(
    researchMetrics.width / researchMetrics.height
  );
  const hobbyChrome = cardChromeTexture(hobbyMetrics.width / hobbyMetrics.height);
  const projectChrome = cardChromeTexture(
    projectMetrics.width / projectMetrics.height,
    { accent: COLOR.accent3 }
  );

  const shared = { mediaTexture, labelTexture };

  /* --- slabs ----------------------------------------------- */
  const researchSlabs = WORKS.map(
    (theme, i) =>
      new Slab({
        ...shared,
        key: theme.key,
        kind: "theme",
        data: theme,
        metrics: researchMetrics,
        tileIndex: TILE_INDEX.get(theme.cover),
        labelIndex: LABEL_BASE.themes + i,
        chromeTexture: researchChrome,
      })
  );

  const projectSlabs = projects.map(
    (project, i) =>
      new Slab({
        ...shared,
        key: project.id,
        kind: "project",
        data: project,
        metrics: projectMetrics,
        tileIndex: TILE_INDEX.get(project.id),
        labelIndex: LABEL_BASE.projects + i,
        chromeTexture: projectChrome,
      })
  );

  const hobbySlabs = HOBBY.map(
    (item, i) =>
      new Slab({
        ...shared,
        key: item.id,
        kind: "hobby",
        data: item,
        metrics: hobbyMetrics,
        tileIndex: TILE_INDEX.get(item.id),
        labelIndex: LABEL_BASE.hobby + i,
        chromeTexture: hobbyChrome,
      })
  );

  /* --- chips ----------------------------------------------- */
  const moreChip = new Chip({
    key: "more",
    action: "more",
    labelIndex: LABEL_BASE.more,
    labelIndexAlt: LABEL_BASE.less,
    labelTexture,
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
  });

  const tagChips = TAGS.map(
    (tag, i) =>
      new Chip({
        key: `tag:${tag}`,
        action: "tag",
        payload: tag,
        labelIndex: LABEL_BASE.tags + i,
        labelTexture,
        width: CHIP_WIDTH,
        height: CHIP_HEIGHT,
        accent: TAG_COLOR[tag],
      })
  );

  /* Recentering has to be reachable in-world. On Quest the DOM
     overlay is never granted, and entering while facing a wall is
     the difference between a usable and unusable session. */
  const recenterChip = new Chip({
    key: "recenter",
    action: "recenter",
    labelIndex: LABEL_BASE.recenter,
    labelTexture,
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    accent: COLOR.textMuted,
  });

  const chips = [moreChip, ...tagChips, recenterChip];
  const allSlabs = [...researchSlabs, ...projectSlabs, ...hobbySlabs];
  const everything = [...allSlabs, ...chips];

  for (const node of everything) rig.add(node.object3d);

  let eyeY = 1.6;

  return {
    rig,
    researchSlabs,
    projectSlabs,
    hobbySlabs,
    allSlabs,
    chips,
    moreChip,
    tagChips,
    recenterChip,
    labelTexture,

    get eyeHeight() {
      return eyeY;
    },

    get metrics() {
      return {
        research: researchMetrics,
        hobby: hobbyMetrics,
        projects: projectMetrics,
      };
    },

    get pickables() {
      return everything.filter((n) => n.visible).map((n) => n.pickable);
    },

    nodeFor(object) {
      return object?.userData?.slab ?? null;
    },

    projectsOf(themeKey) {
      return projectSlabs.filter((s) => s.data.themeKey === themeKey);
    },

    setMediaTexture(texture) {
      for (const slab of allSlabs) slab.setMediaTexture(texture);
    },

    setEyeHeight(y) {
      eyeY = THREE.MathUtils.clamp(y, 1.1, 2.1);
    },

    /* --- slot providers, resolved against the current eye height --- */
    slots: {
      research: () => researchSlots(eyeY),
      hobby: (count) => hobbySlots(count, eyeY),
      projects: (count) => projectSlots(count, eyeY),
      projectEntry: projectEntrySlot,
      themeHeader: () => themeHeaderSlot(eyeY),
      moreCap: () => moreCapSlot(eyeY),
      tagRail: () => tagRailSlots(eyeY),
      recenter: () => recenterSlot(eyeY),
    },

    update(dt) {
      for (const node of everything) node.update(dt);
    },

    dispose() {
      for (const node of everything) node.dispose();
      labelTexture.dispose();
    },
  };
}
