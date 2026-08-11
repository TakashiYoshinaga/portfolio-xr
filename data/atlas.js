/* =========================================================
   Atlas ordering — the contract between the encoder and the renderer.

   All 30 thumbnails live in ONE video as a 6x5 sprite grid, so a
   single decoder animates the whole gallery. That is not an
   optimisation, it is a requirement: Meta's guidance is to play one
   video at a time, and Chromium on Android ships no software video
   decode, so exceeding the MediaCodec ceiling yields black quads
   rather than slow ones.

   The order is DERIVED here rather than hand-listed, and tools/
   generates its work list from this same module — so the tile a
   slab samples can never drift from the tile ffmpeg wrote.

   Slot 0..6   research videos, in theme order
   Slot 7      the one research project that only ever had a still
   Slot 8..29  prototypes, in HOBBY order
   ========================================================= */

import { WORK_PROJECTS } from "./works.js";
import { HOBBY } from "./hobby.js";

/** Every atlas slot, in encoder order. */
export const ATLAS_SLOTS = [
  ...WORK_PROJECTS.map((p) => ({
    key: p.id,
    title: p.title,
    kind: p.image ? "image" : "video",
    source: p.image ?? null,
  })),
  ...HOBBY.map((h) => ({
    key: h.id,
    title: h.title,
    kind: "video",
    source: null,
  })),
];

/** key -> tile index */
export const TILE_INDEX = new Map(ATLAS_SLOTS.map((s, i) => [s.key, i]));

/** Only the slots that need downloading and encoding from YouTube. */
export const VIDEO_KEYS = ATLAS_SLOTS.filter((s) => s.kind === "video").map(
  (s) => s.key
);

export const ATLAS_COLS = 6;
export const ATLAS_ROWS = 5;
export const ATLAS_CAPACITY = ATLAS_COLS * ATLAS_ROWS;

/**
 * UV rect for a tile, with a one-texel inset on every edge.
 *
 * The inset is not cosmetic. THREE.VideoTexture forces
 * generateMipmaps = false and LinearFilter, so without it a bilinear
 * tap at a tile border pulls in the neighbouring project's pixels.
 * VideoTexture also flips Y, hence the v inversion.
 */
export function tileUV(index, atlasWidth, atlasHeight) {
  const du = 1 / atlasWidth;
  const dv = 1 / atlasHeight;
  const col = index % ATLAS_COLS;
  const row = Math.floor(index / ATLAS_COLS);
  return {
    u0: col / ATLAS_COLS + du,
    u1: (col + 1) / ATLAS_COLS - du,
    v0: 1 - (row + 1) / ATLAS_ROWS + dv,
    v1: 1 - row / ATLAS_ROWS - dv,
  };
}

if (ATLAS_SLOTS.length > ATLAS_CAPACITY) {
  throw new Error(
    `Atlas overflow: ${ATLAS_SLOTS.length} items exceed the ${ATLAS_COLS}x${ATLAS_ROWS} grid. ` +
      `Grow the grid in this file and in tools/encode.sh together.`
  );
}
