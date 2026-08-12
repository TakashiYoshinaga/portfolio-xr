/* =========================================================
   Theme — the single source of truth for colour and type.

   These values are mirrored in css/tokens.css. The 2D UI reads
   the CSS custom properties; the Canvas2D painters that produce
   3D textures read this module. Keep the two in sync — if you
   change a colour here, change it there too.
   ========================================================= */

export const COLOR = {
  bg0: "#05070d",
  bg1: "#0a0e1a",
  bg2: "#111627",

  surface: "rgba(255, 255, 255, 0.04)",
  surfaceStrong: "rgba(255, 255, 255, 0.07)",
  border: "rgba(148, 163, 184, 0.18)",
  borderStrong: "rgba(148, 163, 184, 0.28)",

  text: "#e6edf7",
  textMuted: "#94a3b8",
  textDim: "#64748b",

  accent: "#22d3ee",
  accent2: "#60a5fa",
  accent3: "#a78bfa",
  accentText: "#818cf8",
};

/* Gradient stops, as [offset, color] pairs. Canvas2D needs them
   split out; CSS uses the composed linear-gradient() in tokens.css. */
export const GRADIENT = {
  brand: [
    [0.0, "#22d3ee"],
    [0.5, "#60a5fa"],
    [1.0, "#a78bfa"],
  ],
  text: [
    [0.0, "#22d3ee"],
    [0.6, "#818cf8"],
    [1.0, "#a78bfa"],
  ],
};

export const FONT = {
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: '"Space Grotesk", "Inter", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

/* Tag colours. The four-way vocabulary comes straight from the
   2D site's HOBBY data (ar / vr / ai / sensor). */
export const TAG_COLOR = {
  ar: COLOR.accent,
  vr: COLOR.accent3,
  ai: COLOR.accentText,
  sensor: COLOR.accent2,
};

/* ---------------------------------------------------------
   Spatial layout constants.

   Every distance is in metres. The governing constraint is the
   user's brief: on entry, with zero setup, content must already
   be readable within 1–2 m. So State 0 lives on a 1.6 m arc and
   the corridor only grows on demand.
   --------------------------------------------------------- */

export const LAYOUT = {
  /* State 0 — the near console.

     The whole console has to fit inside roughly one headset's field
     of view (Quest 3 is ~104 deg horizontally), otherwise "readable
     the moment you arrive" turns into "hunt for it by turning
     around". That budget is what drives the shapes below:
     research is a vertical stack (one column, mirroring the 2D
     site's accordion) and prototypes are a 3x3 grid, for five
     columns total spanning about 105 deg. */

  research: {
    angle: -40, // one column, left of centre
    radius: 1.55,
    rowY: [1.96, 1.44, 0.92],
    mediaWidth: 0.46,
  },

  hobby: {
    angles: [8, 27, 46],
    mediaWidth: 0.44,
    /* Concentric ranks revealed by "+14 MORE". Each further rank
       sits higher as well as further out, so it clears the rank in
       front instead of hiding behind it. Rank 0 holds 8 items and
       reserves its 9th grid slot for the MORE/LESS cap.
       Capacities sum to 22. */
    ranks: [
      { radius: 1.6, rowY: [1.95, 1.45, 0.95], capacity: 8 },
      { radius: 2.5, rowY: [2.35, 1.83, 1.31], capacity: 9 },
      { radius: 3.4, rowY: [2.7, 2.18, 1.66], capacity: 5 },
    ],
  },

  /* State 1 — a theme's projects.

     The corridor is the *transition*, not the resting state. Cards
     rush in from depth and settle into a readable grid where the
     collapsed themes were.

     A receding line was tried first and does not work: four cards
     down one axis each need roughly their own angular width (~20 deg)
     of separation to avoid occluding one another, which no straight
     corridor viewed from its mouth can provide. Fanning them wide
     enough to fix that pushes the far bay past 60 deg off-centre,
     out of comfortable view. The grid keeps every project legible
     from a standing position, seated, or on a phone — none of which
     can rely on the viewer walking. */
  projects: {
    angles: [-52, -28],
    rowY: [1.4, 0.92],
    radius: 1.5,
    mediaWidth: 0.44,
    /* How far back cards enter from. This is where the corridor
       survives: they arrive down the -Z axis rather than fading in. */
    flyDepth: 3.2,
    flyScale: 0.35,
  },

  /* State 2 — the focused detail panel.

     Panel and hero aspect ratios are load-bearing: the panel quad
     must match TEX.panel's aspect or the painted text stretches, and
     the hero must be 16:9 or the clip letterboxes itself. */
  focus: {
    distance: 1.15,
    panelWidth: 1.2,
    panelHeight: 1.2, // square, matching TEX.panel
    pad: 0.04,
    heroWidth: 1.12,
    heroHeight: 0.63, // 16:9
  },

  /* Filter chips, on their own rail below the prototype bank. They
     have to clear the bank's bottom row AND the MORE cap, which sits
     in the grid's unused ninth cell at (46 deg, 0.95). */
  tagRail: {
    y: 0.6,
    radius: 1.55,
    angles: [10, 22, 34, 46],
  },

  /* Recenter sits under the spine, between the two banks. It has to
     exist in-world: Quest never grants dom-overlay, and entering
     while facing a wall is the difference between a usable and an
     unusable session. */
  recenter: {
    angle: -16,
    radius: 1.6,
    y: 0.62,
  },

  /* Dimming levels for the non-focused world */
  dim: {
    collapsed: 0.2,
    filtered: 0.15,
    focusBackdrop: 0.12,
  },
};

/* ---------------------------------------------------------
   Texture resolution.

   Derived from Quest 3's ~25 pixels-per-degree:
     texels = 2 * atan(W / 2D) [deg] * 25
   See the plan for the full table. Sizes below already include
   the headroom for a user leaning in.
   --------------------------------------------------------- */

export const TEX = {
  /* Sprite-atlas video: 30 tiles in a 6x5 grid */
  atlas: { cols: 6, rows: 5, tileW: 384, tileH: 216, width: 2304, height: 1080 },
  /* Slab label strips, packed 4 cols x 12 rows = 48 slots. The set:
     3 research themes + 8 research projects + 22 prototypes + 6 UI
     chips = 39, leaving room to add work without a re-tune. The
     512x192 tile is sized so a two-line title at the legible minimum
     still clears the tag row underneath. */
  label: { cols: 4, rows: 12, tileW: 512, tileH: 192, width: 2048, height: 2304 },
  /* The one detail-panel canvas, repainted only on focus change.
     1600 across covers the ~1400 texels a 1.2 m panel needs at
     1.15 m on Quest 3; going to 2048 would only cost memory. Square,
     so the panel quad's aspect matches without a second constant. */
  panel: { width: 1600, height: 1600 },
};

/* Font sizes in canvas pixels. Floors are set by legibility
   (body >= 0.8 deg, headings >= 1.6 deg at the viewing distance),
   not by resolution — going smaller than this is unreadable in
   the headset no matter how many texels you throw at it. */
export const TYPE = {
  panel: { title: 88, body: 40, mono: 32 },
  label: { title: 48, tag: 28 },
};

/**
 * Every slab dimension follows from one number: how wide its video
 * is. The label band's aspect is fixed by the label atlas tile, so
 * deriving the rest here keeps the geometry and the texture from
 * drifting apart when either is retuned.
 */
export function slabMetrics(mediaWidth) {
  const mediaHeight = (mediaWidth * 9) / 16;
  const labelAspect = TEX.label.tileW / TEX.label.tileH;
  const labelWidth = mediaWidth;
  const labelHeight = labelWidth / labelAspect;
  const inset = mediaWidth * 0.028;
  const gap = mediaWidth * 0.016;
  return {
    mediaWidth,
    mediaHeight,
    labelWidth,
    labelHeight,
    inset,
    gap,
    width: mediaWidth + inset * 2,
    height: inset * 2 + mediaHeight + gap + labelHeight,
  };
}

export const URLS = {
  site: "https://takashiyoshinaga.github.io/portfolio/",
  youtubeWatch: (id) => `https://www.youtube.com/watch?v=${id}`,
};
