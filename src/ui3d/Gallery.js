/* =========================================================
   Gallery — the state machine.

     CONSOLE   what you arrive to: 3 themes, 9 prototypes, controls
     THEME     one theme expanded, its projects rushed in from depth
     EXPANDED  all 22 prototypes, in a reflowed flat grid
     FOCUS     one item, open at arm's length

   THEME and EXPANDED are independent — you can have a theme open and
   the full prototype set at once. FOCUS layers on top of either.

   Every layout decision goes through applyLayout(), so there is one
   place that decides where a slab belongs given the current state.
   ========================================================= */

import * as THREE from "three";
import { LAYOUT, URLS } from "../core/Theme.js";
import { focusSlot } from "./Layout.js";
import { createDetailPanel } from "./DetailPanel.js";
import { createAmbient } from "./Ambient.js";
import { FEATURED } from "../../data/hobby.js";
import { TILE_INDEX } from "../../data/atlas.js";

export function createGallery({ stage, heroPool, atlas, onRecenter }) {
  const panel = createDetailPanel({ heroPool, atlas });
  panel.setTileLookup(TILE_INDEX);
  stage.rig.add(panel.object3d);

  const ambient = createAmbient();
  stage.rig.add(ambient.object3d);

  const state = {
    expandedTheme: null, // theme key, or null
    hobbyExpanded: false,
    focused: null, // slab, or null
  };

  /* --- layout ---------------------------------------------- */

  function visibleHobbyCount() {
    return state.hobbyExpanded ? stage.hobbySlabs.length : FEATURED;
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
      slab.setOpacity(otherExpanded ? 0 : backdrop, immediate);
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
        slab.setOpacity(0, immediate);
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
      slab.setOpacity(backdrop, immediate);
    }

    /* prototypes — the grid reflows between two flat layouts on the
       same radius, so expanding never puts a card behind another */
    const count = visibleHobbyCount();
    const hobbySlots = stage.slots.hobby(
      stage.hobbySlabs.length,
      state.hobbyExpanded
    );
    stage.hobbySlabs.forEach((slab, i) => {
      const shown = i < count;
      // Hidden slabs snap to their slot so revealing them is a fade
      // into place rather than a flight across the grid.
      slab.seat(hobbySlots[i], immediate || !shown);
      slab.setVisible(shown);
      slab.setOpacity(shown ? backdrop : 0, immediate);
    });

    /* controls */
    stage.moreChip.seat(stage.slots.moreCap(), immediate);
    stage.moreChip.setAlt(state.hobbyExpanded);
    stage.moreChip.setVisible(true);
    stage.moreChip.setOpacity(backdrop, immediate);

    stage.recenterChip.seat(stage.slots.recenter(), immediate);
    stage.recenterChip.setVisible(true);
    stage.recenterChip.setOpacity(backdrop, immediate);

    ambient.setEyeHeight(stage.eyeHeight);
    ambient.setDimmed(focusing);
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
      if (node.action === "recenter") {
        onRecenter?.();
        return { action: "recenter" };
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
      unfocus();
      applyLayout();
    },

    update(dt) {
      stage.update(dt);
      panel.update(dt);
      ambient.update(dt);
    },

    dispose() {
      panel.dispose();
      ambient.dispose();
    },
  };
}
