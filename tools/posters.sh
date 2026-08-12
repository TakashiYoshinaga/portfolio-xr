#!/usr/bin/env bash
# =========================================================
# posters — build the still atlas from YouTube thumbnails.
#
# Two jobs:
#   1. It is the fallback the gallery swaps in when video decode
#      fails or the perf guardrail pauses the atlas video. A missing
#      decoder should degrade to a still, never to a black rectangle.
#   2. It needs neither yt-dlp nor the raw downloads, so the gallery
#      has real imagery before any video work happens.
#
# encode.sh later overwrites media/poster/posters.jpg with frames
# taken from atlas.mp4 itself, which guarantees the still and the
# video share pixel-identical UVs. Until then, this stands in.
#
# Usage:  tools/posters.sh [--force]
# =========================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
WORK="$HERE/work/poster"
POSTER="$ROOT/media/poster"

TILE_W=384
TILE_H=216
COLS=6
ROWS=5

FORCE="${1:-}"

command -v ffmpeg >/dev/null 2>&1 || { echo "error: ffmpeg not found" >&2; exit 1; }
[[ -f "$HERE/clips.tsv" ]] || { echo "error: tools/clips.tsv missing. Run: node tools/manifest.mjs" >&2; exit 1; }

mkdir -p "$WORK" "$POSTER"

slots=0
while IFS=$'\t' read -r -u 3 tile key inpoint kind title; do
  [[ -z "${tile:-}" || "$tile" == \#* ]] && continue
  slots=$((slots + 1))
  out="$WORK/tile_${tile}.png"
  [[ -f "$out" && "$FORCE" != "--force" ]] && continue

  src="$WORK/src_${tile}"
  if [[ "$kind" == "image" ]]; then
    for ext in jpg png; do
      if [[ -f "$ROOT/media/img/${key}.${ext}" ]]; then
        cp "$ROOT/media/img/${key}.${ext}" "$src"
        break
      fi
    done
    if [[ ! -f "$src" ]]; then
      echo "  [$tile] $key — MISSING still, using placeholder" >&2
      ffmpeg -nostdin -y -loglevel error -f lavfi -i "color=c=0x111627:s=${TILE_W}x${TILE_H}" -frames:v 1 "$out"
      continue
    fi
  else
    # maxresdefault is a clean 16:9; hqdefault is 4:3 with letterbox
    # bars, so only fall back to it when maxres does not exist.
    if ! curl -fsSL "https://img.youtube.com/vi/${key}/maxresdefault.jpg" -o "$src"; then
      curl -fsSL "https://img.youtube.com/vi/${key}/hqdefault.jpg" -o "$src" || {
        echo "  [$tile] $key — thumbnail unavailable" >&2
        ffmpeg -nostdin -y -loglevel error -f lavfi -i "color=c=0x111627:s=${TILE_W}x${TILE_H}" -frames:v 1 "$out"
        continue
      }
      # hqdefault: crop the 4:3 frame back to the 16:9 centre.
      ffmpeg -nostdin -y -loglevel error -i "$src" \
        -vf "crop=iw:iw*9/16,scale=${TILE_W}:${TILE_H}:flags=lanczos" -frames:v 1 "$out"
      echo "  [$tile] $key (hqdefault)"
      continue
    fi
  fi

  ffmpeg -nostdin -y -loglevel error -i "$src" \
    -vf "scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=increase,crop=${TILE_W}:${TILE_H}" \
    -frames:v 1 "$out"
  echo "  [$tile] $key"
done 3< "$HERE/clips.tsv"

expected=$((COLS * ROWS))
if (( slots != expected )); then
  echo "error: clips.tsv has $slots rows but the grid is ${COLS}x${ROWS} = $expected." >&2
  exit 1
fi

echo "  assembling ${COLS}x${ROWS} poster atlas"
inputs=()
labels=""
for ((i = 0; i < expected; i++)); do
  inputs+=(-i "$WORK/$(printf 'tile_%02d.png' "$i")")
  labels+="[${i}:v]"
done

ffmpeg -nostdin -y -loglevel error "${inputs[@]}" \
  -filter_complex "${labels}xstack=inputs=${expected}:grid=${COLS}x${ROWS}:fill=black[v]" \
  -map "[v]" -frames:v 1 -c:v mjpeg -q:v 4 "$POSTER/posters.jpg"

echo
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 \
  "$POSTER/posters.jpg" | sed 's/^/  posters.jpg: /'
echo "  size: $(du -h "$POSTER/posters.jpg" | cut -f1)"
