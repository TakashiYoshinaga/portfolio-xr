#!/usr/bin/env bash
# =========================================================
# encode — turn the raw downloads into what the gallery ships.
#
# Produces:
#   media/video/atlas.mp4    30 tiles in a 6x5 grid, 8 s, silent
#   media/video/<key>.mp4    20 s hero clip per project, with audio
#   media/video/prime.mp4    1 s black stub for autoplay priming
#
# Why the atlas exists: the gallery animates up to 30 thumbnails at
# once. Thirty <video> elements would not be slow, it would be broken
# — Meta's guidance is to play one video at a time, and Chromium on
# Android ships no software video decode, so passing the MediaCodec
# ceiling yields black quads. One atlas video means one decoder for
# every thumbnail on screen.
#
# Usage:  tools/encode.sh [--force] [--atlas-only] [--heroes-only]
# =========================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
RAW="${RAW:-$HOME/portfolio-xr-raw}"
WORK="$HERE/work"
OUT="$ROOT/media/video"
POSTER="$ROOT/media/poster"

# Must match TEX.atlas in src/core/Theme.js.
TILE_W=384
TILE_H=216
COLS=6
ROWS=5
ATLAS_SECONDS=8
ATLAS_FPS=24
HERO_SECONDS=20

FORCE=""
DO_ATLAS=1
DO_HEROES=1
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --atlas-only) DO_HEROES=0 ;;
    --heroes-only) DO_ATLAS=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

command -v ffmpeg >/dev/null 2>&1 || { echo "error: ffmpeg not found" >&2; exit 1; }
[[ -f "$HERE/clips.tsv" ]] || { echo "error: tools/clips.tsv missing. Run: node tools/manifest.mjs" >&2; exit 1; }

mkdir -p "$WORK" "$OUT" "$POSTER"

fresh() { # fresh <output> -> 0 if it needs building
  [[ -n "$FORCE" || ! -f "$1" ]]
}

# --- 1. per-project outputs ---------------------------------
slots=0
missing=()

while IFS=$'\t' read -r tile key inpoint kind title; do
  [[ -z "${tile:-}" || "$tile" == \#* ]] && continue
  slots=$((slots + 1))
  tile_out="$WORK/tile_${tile}.mp4"

  if [[ "$kind" == "image" ]]; then
    # The one project that never had a video: hold its still for the
    # loop's duration so the atlas grid stays uniform.
    src="$ROOT/media/img/${key}.jpg"
    [[ -f "$src" ]] || src="$ROOT/media/img/${key}.png"
    if [[ ! -f "$src" ]]; then
      missing+=("$key (still image — save it to media/img/${key}.jpg)")
      continue
    fi
    if fresh "$tile_out"; then
      echo "  [$tile] $key — still"
      ffmpeg -y -loglevel error -loop 1 -t "$ATLAS_SECONDS" -i "$src" \
        -vf "scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=increase,crop=${TILE_W}:${TILE_H},fps=${ATLAS_FPS},format=yuv420p" \
        -an -c:v libx264 -preset veryslow -crf 20 "$tile_out"
    fi
    continue
  fi

  src="$RAW/$key.mp4"
  if [[ ! -f "$src" ]]; then
    missing+=("$key ($title)")
    continue
  fi

  # -- atlas tile: 8 s silent loop --
  if [[ "$DO_ATLAS" == 1 ]] && fresh "$tile_out"; then
    echo "  [$tile] $key — tile"
    ffmpeg -y -loglevel error -ss "$inpoint" -t "$ATLAS_SECONDS" -i "$src" \
      -vf "scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=increase,crop=${TILE_W}:${TILE_H},fps=${ATLAS_FPS},setpts=PTS-STARTPTS,format=yuv420p" \
      -an -c:v libx264 -preset veryslow -crf 18 "$tile_out"
  fi

  # -- hero clip: 20 s, 720p, with audio --
  hero_out="$OUT/$key.mp4"
  if [[ "$DO_HEROES" == 1 ]] && fresh "$hero_out"; then
    echo "  [$tile] $key — hero"
    # -ss before -i is a keyframe-accurate fast seek; +faststart moves
    # the moov atom to the head so playback starts before the whole
    # file lands, which static hosting otherwise makes you wait for.
    ffmpeg -y -loglevel error -ss "$inpoint" -t "$HERO_SECONDS" -i "$src" \
      -vf "scale=1280:-2:flags=lanczos,fps=30,format=yuv420p" \
      -c:v libx264 -profile:v high -level:v 4.0 -preset slow -crf 24 \
      -maxrate 3000k -bufsize 6000k -g 60 -keyint_min 60 -sc_threshold 0 \
      -c:a aac -b:a 96k -ac 2 -ar 48000 \
      -movflags +faststart "$hero_out"
  fi
done < "$HERE/clips.tsv"

if (( ${#missing[@]} > 0 )); then
  echo
  echo "error: ${#missing[@]} source(s) missing from $RAW:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  echo >&2
  echo "run tools/fetch.sh first" >&2
  exit 1
fi

# --- 2. assemble the atlas ----------------------------------
if [[ "$DO_ATLAS" == 1 ]]; then
  expected=$((COLS * ROWS))
  if (( slots != expected )); then
    echo "error: clips.tsv has $slots rows but the grid is ${COLS}x${ROWS} = $expected." >&2
    echo "       xstack needs exactly one input per cell." >&2
    exit 1
  fi

  echo "  assembling ${COLS}x${ROWS} atlas"
  inputs=()
  labels=""
  for ((i = 0; i < expected; i++)); do
    inputs+=(-i "$WORK/$(printf 'tile_%02d.mp4' "$i")")
    labels+="[${i}:v]"
  done

  ffmpeg -y -loglevel error "${inputs[@]}" \
    -filter_complex "${labels}xstack=inputs=${expected}:grid=${COLS}x${ROWS}:fill=black[v]" \
    -map "[v]" -an \
    -c:v libx264 -profile:v high -level:v 4.2 -preset veryslow \
    -crf 22 -maxrate 6000k -bufsize 12000k \
    -g 48 -keyint_min 48 -sc_threshold 0 \
    -pix_fmt yuv420p -movflags +faststart \
    "$OUT/atlas.mp4"

  # Poster atlas from the atlas's own first frame, so the still and
  # the video share pixel-identical UVs by construction.
  echo "  poster atlas"
  ffmpeg -y -loglevel error -i "$OUT/atlas.mp4" -frames:v 1 \
    -c:v mjpeg -q:v 4 "$POSTER/posters.jpg"
fi

# --- 3. autoplay priming stub -------------------------------
# Named prime.mp4, not _prime.mp4: Jekyll drops underscore-prefixed
# paths, and .nojekyll should not be the only thing standing between
# the site and a broken video.
if fresh "$OUT/prime.mp4"; then
  echo "  prime stub"
  ffmpeg -y -loglevel error -f lavfi -i color=c=black:s=64x64:r=1:d=1 \
    -f lavfi -i anullsrc=r=48000:cl=stereo -t 1 \
    -c:v libx264 -crf 40 -pix_fmt yuv420p -c:a aac -b:a 8k \
    -movflags +faststart "$OUT/prime.mp4"
fi

# --- 4. report ----------------------------------------------
echo
echo "output:"
if [[ -f "$OUT/atlas.mp4" ]]; then
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height,codec_name,profile,r_frame_rate \
    -show_entries format=duration,size -of default=nw=1 "$OUT/atlas.mp4" |
    sed 's/^/  atlas: /'
fi
heroes=$(find "$OUT" -name '*.mp4' ! -name 'atlas.mp4' ! -name 'prime.mp4' | wc -l | tr -d ' ')
echo "  hero clips: $heroes"
echo "  media total: $(du -sh "$ROOT/media" | cut -f1)"
echo
echo "GitHub Pages soft-limits the repo at 1 GB and bandwidth at 100 GB/month."
echo "If media/ is over ~300 MB, shorten HERO_SECONDS or raise -crf."
