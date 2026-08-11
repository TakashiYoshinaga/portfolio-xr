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
    rowY: [1.92, 1.42, 0.92],
    width: 0.58,
    height: 0.4,
    mediaWidth: 0.56,
    mediaHeight: 0.315,
  },

  hobby: {
    angles: [8, 27, 46],
    width: 0.46,
    height: 0.34,
    mediaWidth: 0.44,
    mediaHeight: 0.247,
    /* Concentric ranks revealed by "+14 MORE". Each further rank
       sits higher as well as further out, so it clears the rank in
       front instead of hiding behind it. Rank 0 holds 8 items and
       reserves its 9th grid slot for the MORE/LESS cap.
       Capacities sum to 22. */
    ranks: [
      { radius: 1.6, rowY: [1.86, 1.44, 1.02], capacity: 8 },
      { radius: 2.5, rowY: [2.25, 1.8, 1.35], capacity: 9 },
      { radius: 3.4, rowY: [2.6, 2.15, 1.7], capacity: 5 },
    ],
  },

  /* State 1 — the corridor that grows from an expanded theme */
  corridor: {
    x: -0.85,
    y: 1.35,
    z: [-1.9, -2.75, -3.6, -4.45],
    yaw: 70, // degrees, turning each slab toward the centre line
    headerAngle: -30,
    headerRadius: 1.3,
  },

  /* State 2 — the focused detail panel */
  focus: {
    distance: 1.05,
    panelWidth: 1.2,
    panelHeight: 0.85,
    heroWidth: 0.92,
    heroHeight: 0.52,
  },

  tagRail: {
    y: 0.95,
    radius: 1.5,
    angles: [20, 30, 40, 50],
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
  /* Slab label strips, packed 4 cols x 8 rows */
  label: { cols: 4, rows: 8, tileW: 512, tileH: 128, width: 2048, height: 1024 },
  /* The one detail-panel canvas, repainted only on focus change */
  panel: { width: 2048, height: 1152 },
};

/* Font sizes in canvas pixels. Floors are set by legibility
   (body >= 0.8 deg, headings >= 1.6 deg at the viewing distance),
   not by resolution — going smaller than this is unreadable in
   the headset no matter how many texels you throw at it. */
export const TYPE = {
  panel: { title: 88, body: 40, mono: 32 },
  label: { title: 48, tag: 28 },
};

export const URLS = {
  site: "https://takashiyoshinaga.github.io/portfolio/",
  youtubeWatch: (id) => `https://www.youtube.com/watch?v=${id}`,
};
