#!/usr/bin/env node
/* =========================================================
   manifest — generate the encoder's work list from the same
   module the renderer samples.

   The tile a slab reads and the tile ffmpeg writes must agree. Rather
   than maintain that mapping twice, this imports data/atlas.js and
   emits everything downstream from it:

     tools/clips.tsv   in-points, one row per tile   (NEVER overwritten)
     tools/urls.txt    YouTube URLs for fetch.sh
     tools/tiles.txt   resolved tile order for encode.sh

   clips.tsv holds hand-picked timecodes, so a re-run merges new rows
   in and leaves existing ones alone.

   Usage:  node tools/manifest.mjs
   ========================================================= */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ATLAS_SLOTS, ATLAS_CAPACITY } from "../data/atlas.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIPS = resolve(HERE, "clips.tsv");
const URLS = resolve(HERE, "urls.txt");
const TILES = resolve(HERE, "tiles.txt");

const DEFAULT_IN = "00:00:10";

const HEADER = `# Hand-picked in-points for the XR gallery's clips.
#
# One row per atlas tile. 'in' is the timecode where that project's
# highlight starts; it drives BOTH the 8 s atlas loop and the 20 s
# hero clip, so pick the moment the demo actually reads.
#
# Only the 'in' column is meant to be edited. Re-running
# node tools/manifest.mjs merges new rows in and never touches
# timecodes you have already set.
#
# tile\tkey\tin\tkind\ttitle`;

/* --- read any existing hand-edited timecodes ---------------- */
const existing = new Map();
if (existsSync(CLIPS)) {
  for (const line of readFileSync(CLIPS, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [, key, inPoint] = line.split("\t");
    if (key && inPoint) existing.set(key.trim(), inPoint.trim());
  }
}

/* --- emit ---------------------------------------------------- */
const rows = ATLAS_SLOTS.map((slot, i) => {
  const tile = String(i).padStart(2, "0");
  const inPoint = existing.get(slot.key) ?? DEFAULT_IN;
  return [tile, slot.key, inPoint, slot.kind, slot.title].join("\t");
});

writeFileSync(CLIPS, `${HEADER}\n${rows.join("\n")}\n`);

const videoKeys = ATLAS_SLOTS.filter((s) => s.kind === "video").map((s) => s.key);
writeFileSync(
  URLS,
  videoKeys.map((k) => `https://www.youtube.com/watch?v=${k}`).join("\n") + "\n"
);

writeFileSync(
  TILES,
  ATLAS_SLOTS.map((s, i) => `${String(i).padStart(2, "0")}\t${s.key}\t${s.kind}`).join(
    "\n"
  ) + "\n"
);

const kept = ATLAS_SLOTS.filter((s) => existing.has(s.key)).length;
console.log(
  `${ATLAS_SLOTS.length} tiles of ${ATLAS_CAPACITY} slots ` +
    `(${videoKeys.length} videos, ${ATLAS_SLOTS.length - videoKeys.length} stills)`
);
console.log(`clips.tsv: ${kept} existing in-points kept, ${rows.length - kept} defaulted`);
console.log(`wrote ${CLIPS}\n      ${URLS}\n      ${TILES}`);
