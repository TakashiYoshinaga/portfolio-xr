/* =========================================================
   Gallery — the state machine.

     CONSOLE   what you arrive to: 3 themes, 8 prototypes, controls
     CORRIDOR  a theme expanded, its projects receding into depth
     EXPANDED  all 22 prototypes, in concentric ranks
     FOCUS     one item, open at arm's length

   CORRIDOR and EXPANDED are independent — you can have a theme open
   and the full prototype set at once. FOCUS layers on top of either.

   Every layout decision goes through applyLayout(), so there is one
   place that decides where a slab belongs given the current state.
   ========================================================= */

import * as THREE from "three";
import { LAYOUT, URLS } from "../core/Theme.js";
import { focusSlot } from "./Layout.js";
import { createDetailPanel } from "./DetailPanel.js";
import { FEATURED } from "../../data/hobby.js";
import { TILE_INDEX } from "../../data/atlas.js";

export function createGallery({ stage, heroPool, atlas }) {
  const panel = createDetailPanel({ heroPool, atlas });
  panel.setTileLookup(TILE_INDEX);
  stage.rig.add(panel.object3d);

  const state = {
    expandedTheme: null, // theme key, or null
    hobbyExpanded: false,
    activeTags: new Set(),
    focused: null, // slab, or null
  };

  /* --- layout ---------------------------------------------- */

  function visibleHobbyCount() {
    return state.hobbyExpanded ? stage.hobbySlabs.length : FEATURED;
  }

  function matchesFilter(slab) {
    if (!state.activeTags.size) return true;
    const tags = slab.data?.tags;
    if (!Array.isArray(tags)) return true;
    return tags.some((t) => state.activeTags.has(t));
  }

  function applyLayout({ immediate = false } = {}) {
    const focusing = Boolean(state.focused);
    // Everything that is not the focused item recedes and dims, so
    // the panel is never competing with the gallery behind it.
    const backdrop = focusing ? LAYOUT.dim.focusBackdrop : 1;

    /* themes — the expanded one takes the top of the column, the
       others clear out so its projects have somewhere to land */
    const themeSlots = stage.slots.research();
    stage.researchSlabs.forEach((slab, i) => {
      const expanded = state.expandedTheme === slab.key;
      const otherExpanded = state.expandedTheme !== null && !expanded;

      slab.seat(expanded ? stage.slots.themeHeader() : themeSlots[i], immediate);
      slab.setVisible(!otherExpanded);
      slab.setOpacity(otherExpanded ? 0 : backdrop);
    });

    /* an expanded theme's projects */
    const openProjects = state.expandedTheme
      ? stage.projectsOf(state.expandedTheme)
      : [];
    const slots = stage.slots.projects(openProjects.length);
    for (const slab of stage.projectSlabs) {
      const index = openProjects.indexOf(slab);
      if (index === -1) {
        slab.setVisible(false);
        slab.setOpacity(0);
        continue;
      }
      // Newly revealed cards are parked deep down -Z first, so the
      // slab's own easing pulls them forward. That rush out of depth
      // is the corridor.
      if (!slab.visible && !immediate) {
        slab.seat(stage.slots.projectEntry(slots[index]), true);
      }
      slab.seat(slots[index], immediate);
      slab.setVisible(true);
      slab.setOpacity(backdrop);
    }

    /* prototypes */
    const count = visibleHobbyCount();
    const hobbySlots = stage.slots.hobby(stage.hobbySlabs.length);
    stage.hobbySlabs.forEach((slab, i) => {
      const shown = i < count;
      // Hidden slabs are seated immediately so revealing them reads
      // as the rank growing outward, not as a pop-in.
      slab.seat(hobbySlots[i], immediate || !shown);
      slab.setVisible(shown);
      if (!shown) {
        slab.setOpacity(0);
        return;
      }
      const dimmed = matchesFilter(slab) ? 1 : LAYOUT.dim.filtered;
      slab.setOpacity(backdrop * dimmed);
    });

    /* controls */
    stage.moreChip.seat(stage.slots.moreCap(), immediate);
    stage.moreChip.setAlt(state.hobbyExpanded);
    stage.moreChip.setVisible(true);
    stage.moreChip.setOpacity(backdrop);

    const railSlots = stage.slots.tagRail();
    stage.tagChips.forEach((chip, i) => {
      chip.seat(railSlots[i], immediate);
      chip.setActive(state.activeTags.has(chip.payload));
      chip.setVisible(true);
      chip.setOpacity(backdrop);
    });
  }

  /* --- focus ----------------------------------------------- */

  function panelItemFor(slab) {
    const data = slab.data ?? {};
    if (slab.kind === "theme") {
      return {
        key: slab.key,
        eyebrow: data.eyebrow,
        title: data.title,
        body: data.desc,
        footer: `${data.projects.length} projects — select the theme to open them`,
        hasVideo: true,
      };
    }
    if (slab.kind === "project") {
      return {
        key: slab.key,
        eyebrow: "Research",
        title: data.title,
        subtitle: data.partner ?? null,
        body: data.desc,
        footer: data.image ? null : `youtube.com/watch?v=${slab.key}`,
        hasVideo: !data.image,
      };
    }
    return {
      key: slab.key,
      eyebrow: "Prototype",
      title: data.title,
      subtitle: (data.tags ?? []).join(" · "),
      body: data.desc,
      footer: `youtube.com/watch?v=${slab.key}`,
      hasVideo: true,
    };
  }

  async function focus(slab, head) {
    if (state.focused === slab) return;
    state.focused = slab;

    const slot = focusSlot(head.position, head.quaternion);
    const from = slab.object3d.getWorldPosition(new THREE.Vector3());
    // The panel lives inside the rig, so a world-space head position
    // has to come back into rig space before it can be used.
    stage.rig.worldToLocal(slot.position);
    stage.rig.worldToLocal(from);

    applyLayout();
    const result = await panel.open(panelItemFor(slab), slot, from);
    if (!result.ok && result.reason !== "superseded") {
      console.info(`[focus] ${slab.key}: hero unavailable (${result.reason})`);
    }
    return result;
  }

  function unfocus() {
    if (!state.focused) return false;
    state.focused = null;
    panel.close();
    applyLayout();
    return true;
  }

  /* --- selection ------------------------------------------- */

  function select(node, head) {
    // While an item is open, any selection closes it first. Selecting
    // the world behind the panel is the natural "back".
    if (state.focused) {
      unfocus();
      return { action: "unfocus" };
    }

    if (!node) return { action: "none" };

    if (node.kind === "chip") {
      if (node.action === "more") {
        state.hobbyExpanded = !state.hobbyExpanded;
        applyLayout();
        return { action: "more", expanded: state.hobbyExpanded };
      }
      if (node.action === "tag") {
        if (state.activeTags.has(node.payload)) state.activeTags.delete(node.payload);
        else state.activeTags.add(node.payload);
        applyLayout();
        return { action: "tag", tags: [...state.activeTags] };
      }
      return { action: "none" };
    }

    if (node.kind === "theme") {
      state.expandedTheme = state.expandedTheme === node.key ? null : node.key;
      applyLayout();
      return { action: "theme", expanded: state.expandedTheme };
    }

    focus(node, head);
    return { action: "focus", key: node.key };
  }

  applyLayout({ immediate: true });

  return {
    state,
    panel,

    select,
    focus,
    unfocus,

    /** While an item is open its panel is the only pickable, so a
     *  stray ray through the dimmed gallery cannot select behind it. */
    get pickables() {
      return state.focused ? [panel.pickable] : stage.pickables;
    },

    get externalLink() {
      const slab = state.focused;
      if (!slab || slab.kind === "theme") return null;
      return URLS.youtubeWatch(slab.key);
    },

    /** Re-seat everything, e.g. once the first XR pose reports a head
     *  height different from the 1.6 m default. */
    relayout(immediate = false) {
      applyLayout({ immediate });
    },

    collapseAll() {
      state.expandedTheme = null;
      state.hobbyExpanded = false;
      state.activeTags.clear();
      unfocus();
      applyLayout();
    },

    update(dt) {
      stage.update(dt);
      panel.update(dt);
    },

    dispose() {
      panel.dispose();
    },
  };
}
