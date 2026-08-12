/* =========================================================
   TextPainter — Canvas2D surfaces that become GPU textures.

   Chosen over an SDF text library because the design language *is*
   the glass card: rounded rect, translucent fill, hairline border,
   gradient accent bar, mono tag pills. A glyph renderer would only
   solve the smallest part of that, and would reintroduce the
   third-party runtime dependency that vendoring three.js avoided.
   The text here is also static — painted once, never retyped — so
   there is nothing to gain from per-frame glyph work.

   Everything reads its colours from Theme.js so the 3D world and
   the 2D shell cannot drift apart.
   ========================================================= */

import * as THREE from "three";
import { COLOR, FONT, GRADIENT, TEX, TYPE } from "../core/Theme.js";

/* Font sizes are chosen for an angular target, not a pixel one:
   below roughly 0.8 deg body text is unreadable in the headset no
   matter how many texels back it. */
const TITLE_DEG = 1.5;
const TAG_DEG = 0.75;

function canvas2d(width, height) {
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  const ctx = el.getContext("2d");
  ctx.textBaseline = "alphabetic";
  return { el, ctx };
}

function texture(el, { mipmaps = true } = {}) {
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace; // without this everything washes out
  tex.generateMipmaps = mipmaps;
  tex.minFilter = mipmaps
    ? THREE.LinearMipmapLinearFilter
    : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function linearGradient(ctx, stops, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  return g;
}

/**
 * Fonts must be resolved before the first paint. A canvas painted
 * with a fallback face bakes that fallback into a GPU texture that
 * is never repainted — the mistake is permanent and silent.
 */
export async function waitForFonts() {
  const faces = [
    `700 64px ${FONT.display}`,
    `600 52px ${FONT.display}`,
    `400 40px ${FONT.sans}`,
    `600 40px ${FONT.sans}`,
    `500 28px ${FONT.mono}`,
  ];
  try {
    await Promise.all(faces.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
  } catch {
    // Painting with fallbacks is worse than waiting, but better than
    // never drawing at all.
  }
}

/** Pixels per metre for a surface, used to size type by angle. */
export function pxPerMetre(pixels, metres) {
  return pixels / metres;
}

/** Font size in canvas px that subtends `deg` at `distance` metres. */
export function sizeForAngle(deg, distance, pxm) {
  const metres = 2 * distance * Math.tan((deg * Math.PI) / 360);
  return Math.round(metres * pxm);
}

/* ---------------------------------------------------------
   Card chrome — the glass panel behind a slab.

   Shared per aspect ratio rather than per card, so 25 slabs cost
   two textures rather than 25.
   --------------------------------------------------------- */

const chromeCache = new Map();

export function cardChromeTexture(aspect, { accent = COLOR.accent } = {}) {
  const key = `${aspect.toFixed(3)}|${accent}`;
  if (chromeCache.has(key)) return chromeCache.get(key);

  const W = 512;
  const H = Math.round(W / aspect);
  const { el, ctx } = canvas2d(W, H);
  const pad = 4;
  const radius = Math.round(W * 0.045);

  // Glass fill, brightened slightly toward the top like the 2D cards.
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, radius);
  ctx.fillStyle = linearGradient(
    ctx,
    [
      [0, "rgba(255,255,255,0.075)"],
      [1, "rgba(255,255,255,0.035)"],
    ],
    0,
    0,
    0,
    H
  );
  ctx.fill();

  // Hairline border.
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 2;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, radius);
  ctx.stroke();

  // Accent bar along the bottom edge — the one piece of brand colour
  // on a resting card.
  const barH = Math.max(3, Math.round(H * 0.012));
  const barW = W * 0.34;
  ctx.fillStyle = linearGradient(
    ctx,
    GRADIENT.brand,
    (W - barW) / 2,
    0,
    (W + barW) / 2,
    0
  );
  roundRect(ctx, (W - barW) / 2, H - pad - barH - 2, barW, barH, barH / 2);
  ctx.fill();

  const tex = texture(el);
  chromeCache.set(key, tex);
  return tex;
}

/* ---------------------------------------------------------
   Label atlas — one strip per slab, packed into a single texture.

   A 2048x1152 canvas per card would cost 282 MB across the gallery.
   Packed strips cost about 11 MB for the whole set.
   --------------------------------------------------------- */

function truncate(ctx, text, maxWidth, forceEllipsis = false) {
  if (ctx.measureText(text).width <= maxWidth) {
    return forceEllipsis ? `${text.trimEnd()}…` : text;
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + "…";
}

/**
 * Wrap into at most `maxLines`. Returns { lines, overflowed } — the
 * flag matters because silently dropping the tail of a title is how
 * you end up shipping "Turn Your Memories" instead of "Turn Your
 * Memories into 3D Gaussian Splatting".
 */
function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  let consumed = 0;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      consumed++;
      continue;
    }
    lines.push(line);
    line = word;
    consumed++;
    if (lines.length === maxLines) {
      // No room for the line we just started, let alone the rest.
      return {
        lines: [
          ...lines.slice(0, -1),
          truncate(ctx, lines[maxLines - 1], maxWidth, true),
        ],
        overflowed: true,
      };
    }
  }
  if (line) lines.push(line);

  let overflowed = consumed < words.length;
  if (overflowed && lines.length) {
    lines[lines.length - 1] = truncate(
      ctx,
      lines[lines.length - 1],
      maxWidth,
      true
    );
  }

  // A single word wider than the box is placed anyway by the `!line`
  // clause above — otherwise it would be dropped entirely. That means
  // a title with no spaces ("Snap2VoxelAR") can leave here wider than
  // maxWidth with overflowed still false, and in a packed atlas it
  // paints straight into the neighbouring tile. Any line that does not
  // fit is an overflow, however it got here.
  for (let i = 0; i < lines.length; i++) {
    if (ctx.measureText(lines[i]).width > maxWidth) {
      lines[i] = truncate(ctx, lines[i], maxWidth);
      overflowed = true;
    }
  }
  return { lines, overflowed };
}

/**
 * Largest font size at which `text` fits in `maxLines`, stepping down
 * from `preferred` but never past `floor`. Keeps short titles large
 * and only shrinks the ones that genuinely need it.
 */
function fitTitle(ctx, text, maxWidth, maxLines, preferred, floor, fontFamily) {
  for (let size = preferred; size >= floor; size -= 2) {
    ctx.font = `600 ${size}px ${fontFamily}`;
    const { overflowed } = wrap(ctx, text, maxWidth, maxLines);
    if (!overflowed) return size;
  }
  return floor;
}

/**
 * @param {Array<{title:string, tags?:string[], eyebrow?:string,
 *                widthMetres:number, distance:number}>} entries
 *        One entry per slab, in slab order. widthMetres and distance
 *        drive the angular type sizing.
 * @returns {THREE.CanvasTexture}
 */
export function paintLabelAtlas(entries) {
  const { cols, rows, tileW, tileH, width, height } = TEX.label;
  const { el, ctx } = canvas2d(width, height);

  const capacity = cols * rows;
  if (entries.length > capacity) {
    throw new Error(
      `Label atlas overflow: ${entries.length} strips exceed ${cols}x${rows}. ` +
        `Grow TEX.label in Theme.js.`
    );
  }

  entries.forEach((entry, i) => {
    const x = (i % cols) * tileW;
    const y = Math.floor(i / cols) * tileH;
    ctx.save();
    ctx.translate(x, y);
    if (entry.variant === "chip") paintChip(ctx, entry, tileW, tileH);
    else paintLabel(ctx, entry, tileW, tileH);
    ctx.restore();
  });

  return texture(el);
}

/** In-world control captions: centred, mono, uppercase. Controls have
 *  to be 3D because dom-overlay is not granted on Quest hardware. */
function paintChip(ctx, entry, W, H) {
  const { title, widthMetres, distance, accent = COLOR.accent } = entry;
  const pxm = pxPerMetre(W, widthMetres);
  const pad = Math.round(H * 0.09);
  const radius = (H - pad * 2) / 2;
  const label = String(title).toUpperCase();

  // Shrink to fit the pill. The angular ideal is a starting point,
  // not a guarantee: a long caption like RECENTER overruns a chip
  // sized for AR or VR and would render clipped.
  const inner = W - pad * 2 - radius * 1.2;
  let size = Math.max(26, sizeForAngle(TITLE_DEG * 0.8, distance, pxm));
  for (; size > 20; size -= 2) {
    ctx.font = `500 ${size}px ${FONT.mono}`;
    ctx.letterSpacing = `${Math.round(size * 0.14)}px`;
    if (ctx.measureText(label).width <= inner) break;
  }
  ctx.letterSpacing = "0px";

  // A filled pill rather than bare floating text — over passthrough,
  // unbacked glyphs on a busy room read as noise.
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, radius);
  ctx.fillStyle = "rgba(10,14,26,0.86)";
  ctx.fill();

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(2, Math.round(H * 0.022));
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, radius);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = `500 ${size}px ${FONT.mono}`;
  ctx.letterSpacing = `${Math.round(size * 0.14)}px`;
  ctx.textAlign = "center";
  ctx.fillStyle = accent;
  // Nudge right by half the trailing letter-space so the tracked text
  // still reads as centred.
  ctx.fillText(label, W / 2 + Math.round(size * 0.07), H / 2 + size * 0.36);
  ctx.textAlign = "left";
  ctx.letterSpacing = "0px";
}

function paintLabel(ctx, entry, W, H) {
  const { title, meta, eyebrow, widthMetres, distance } = entry;
  const pxm = pxPerMetre(W, widthMetres);
  const tagSize = Math.max(18, sizeForAngle(TAG_DEG, distance, pxm));

  const padX = Math.round(W * 0.035);
  const innerW = W - padX * 2;
  const padY = Math.round(H * 0.05);
  let cursorY = padY;

  // Subtle band behind the text so titles stay legible over whatever
  // the passthrough camera happens to be showing.
  ctx.fillStyle = "rgba(5,7,13,0.55)";
  ctx.fillRect(0, 0, W, H);

  if (eyebrow) {
    ctx.font = `500 ${Math.round(tagSize * 0.9)}px ${FONT.mono}`;
    ctx.fillStyle = COLOR.accent;
    ctx.letterSpacing = `${Math.round(tagSize * 0.12)}px`;
    cursorY += Math.round(tagSize * 0.9);
    ctx.fillText(eyebrow.toUpperCase(), padX, cursorY);
    ctx.letterSpacing = "0px";
    cursorY += Math.round(tagSize * 0.35);
  }

  // Title. Try the angular ideal first and shrink only as far as the
  // legibility floor allows; a long title going to two smaller lines
  // beats a short truncated one.
  const tagBandH = meta ? tagSize * 2.2 : 0;
  const available = H - cursorY - tagBandH - padY;
  const preferred = Math.max(24, sizeForAngle(TITLE_DEG, distance, pxm));
  const floor = Math.max(22, Math.round(preferred * 0.62));

  let titleSize = preferred;
  let lines;
  for (const maxLines of [1, 2]) {
    const lineHeight = Math.round(preferred * 1.12);
    if (maxLines * lineHeight > available && maxLines > 1) break;
    titleSize = fitTitle(
      ctx,
      title,
      innerW,
      maxLines,
      preferred,
      floor,
      FONT.display
    );
    ctx.font = `600 ${titleSize}px ${FONT.display}`;
    const result = wrap(ctx, title, innerW, maxLines);
    lines = result.lines;
    if (!result.overflowed) break;
  }

  ctx.font = `600 ${titleSize}px ${FONT.display}`;
  ctx.fillStyle = COLOR.text;
  const lineHeight = Math.round(titleSize * 1.14);
  for (const line of lines) {
    cursorY += lineHeight;
    ctx.fillText(line, padX, cursorY - Math.round(titleSize * 0.22));
  }

  if (!meta) return;

  // A single caption pill, mono and uppercase like the 2D site's
  // labels. Used for a theme's project count; prototypes carry none.
  cursorY = H - Math.round(H * 0.08);
  ctx.font = `500 ${tagSize}px ${FONT.mono}`;
  ctx.letterSpacing = `${Math.round(tagSize * 0.1)}px`;

  const label = String(meta).toUpperCase();
  const pillW = Math.min(
    ctx.measureText(label).width + tagSize * 1.1,
    innerW
  );
  const pillH = tagSize * 1.6;

  ctx.globalAlpha = 0.16;
  ctx.fillStyle = COLOR.accent;
  roundRect(ctx, padX, cursorY - pillH, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLOR.accent;
  ctx.fillText(label, padX + tagSize * 0.55, cursorY - pillH * 0.32);
  ctx.letterSpacing = "0px";
}

/* ---------------------------------------------------------
   Spine plate — the identity marker between the two banks.

   Its own small texture rather than a label-atlas slot: it is a
   different shape from every card label, and one 512x256 canvas is
   cheaper than distorting the atlas tile aspect for a single item.
   --------------------------------------------------------- */

export function spinePlateTexture({ name, subtitle, widthMetres, distance }) {
  const W = 512;
  const H = 256;
  const { el, ctx } = canvas2d(W, H);
  const pxm = pxPerMetre(W, widthMetres);

  const nameSize = Math.max(30, sizeForAngle(1.35, distance, pxm));
  const subSize = Math.max(20, sizeForAngle(0.78, distance, pxm));

  ctx.textAlign = "center";

  ctx.font = `700 ${nameSize}px ${FONT.display}`;
  ctx.fillStyle = COLOR.text;
  ctx.fillText("TAKASHI YOSHINAGA", W / 2, H * 0.42);

  // Gradient hairline between the two lines, echoing the 2D site's
  // brand gradient.
  const ruleW = W * 0.46;
  ctx.fillStyle = linearGradient(
    ctx,
    GRADIENT.brand,
    (W - ruleW) / 2,
    0,
    (W + ruleW) / 2,
    0
  );
  ctx.fillRect((W - ruleW) / 2, H * 0.52, ruleW, Math.max(2, H * 0.012));

  ctx.font = `500 ${subSize}px ${FONT.mono}`;
  ctx.letterSpacing = `${Math.round(subSize * 0.24)}px`;
  ctx.fillStyle = COLOR.textMuted;
  ctx.fillText(subtitle, W / 2 + subSize * 0.12, H * 0.74);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";

  return texture(el);
}

/* ---------------------------------------------------------
   Detail panel — one canvas, repainted only when focus changes.
   --------------------------------------------------------- */

let panelSurface = null;

export function panelTexture() {
  if (!panelSurface) {
    panelSurface = canvas2d(TEX.panel.width, TEX.panel.height);
    panelSurface.texture = texture(panelSurface.el);
  }
  return panelSurface.texture;
}

/**
 * @param {{eyebrow?:string, title:string, subtitle?:string,
 *          body:string, tags?:string[], footer?:string}} item
 * @param {{heroHeightRatio:number}} opts fraction of the panel the
 *        hero video quad covers, so text starts below it
 */
export function paintPanel(item, { heroHeightRatio = 0.52 } = {}) {
  const tex = panelTexture();
  const { el, ctx } = panelSurface;
  const W = el.width;
  const H = el.height;

  ctx.clearRect(0, 0, W, H);

  const pad = Math.round(W * 0.035);
  const radius = Math.round(W * 0.022);

  roundRect(ctx, 0, 0, W, H, radius);
  ctx.fillStyle = linearGradient(
    ctx,
    [
      [0, "rgba(17,22,39,0.94)"],
      [1, "rgba(10,14,26,0.96)"],
    ],
    0,
    0,
    0,
    H
  );
  ctx.fill();

  ctx.strokeStyle = COLOR.borderStrong;
  ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, radius);
  ctx.stroke();

  // Text begins under the hero quad.
  let y = Math.round(H * heroHeightRatio) + pad;

  if (item.eyebrow) {
    ctx.font = `500 ${TYPE.panel.mono}px ${FONT.mono}`;
    ctx.letterSpacing = "4px";
    ctx.fillStyle = COLOR.accent;
    y += TYPE.panel.mono;
    ctx.fillText(item.eyebrow.toUpperCase(), pad, y);
    ctx.letterSpacing = "0px";
    y += Math.round(TYPE.panel.mono * 0.7);
  }

  ctx.font = `700 ${TYPE.panel.title}px ${FONT.display}`;
  ctx.fillStyle = COLOR.text;
  const { lines: titleLines } = wrap(ctx, item.title, W - pad * 2, 2);
  for (const line of titleLines) {
    y += Math.round(TYPE.panel.title * 1.1);
    ctx.fillText(line, pad, y);
  }

  if (item.subtitle) {
    ctx.font = `500 ${Math.round(TYPE.panel.mono * 1.05)}px ${FONT.mono}`;
    ctx.fillStyle = COLOR.textMuted;
    y += Math.round(TYPE.panel.mono * 1.5);
    ctx.fillText(item.subtitle, pad, y);
  }

  // The body gets whatever vertical space is left after the footer is
  // reserved. Without an explicit budget a long description simply
  // runs over the footer, which is exactly what it did.
  const footerHeight = item.footer ? Math.round(TYPE.panel.mono * 2.2) : 0;
  const bottom = H - pad - footerHeight;
  y += Math.round(TYPE.panel.body * 0.9);

  ctx.fillStyle = COLOR.textMuted;
  let bodySize = TYPE.panel.body;
  let bodyLines = [];
  const floor = Math.round(TYPE.panel.body * 0.72);
  for (; bodySize >= floor; bodySize -= 2) {
    ctx.font = `400 ${bodySize}px ${FONT.sans}`;
    const lineHeight = Math.round(bodySize * 1.42);
    const fits = Math.max(1, Math.floor((bottom - y) / lineHeight));
    const result = wrap(ctx, item.body, W - pad * 2, fits);
    bodyLines = result.lines;
    if (!result.overflowed) break;
  }
  ctx.font = `400 ${bodySize}px ${FONT.sans}`;
  const bodyLineHeight = Math.round(bodySize * 1.42);
  for (const line of bodyLines) {
    y += bodyLineHeight;
    if (y > bottom) break;
    ctx.fillText(line, pad, y);
  }

  if (item.footer) {
    ctx.font = `500 ${TYPE.panel.mono}px ${FONT.mono}`;
    ctx.letterSpacing = "3px";
    ctx.fillStyle = COLOR.accent2;
    ctx.fillText(
      truncate(ctx, item.footer.toUpperCase(), W - pad * 2),
      pad,
      H - pad
    );
    ctx.letterSpacing = "0px";
  }

  tex.needsUpdate = true;
  return tex;
}
