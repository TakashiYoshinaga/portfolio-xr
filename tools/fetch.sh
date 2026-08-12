#!/usr/bin/env bash
# =========================================================
# fetch — download the source videos from YouTube.
#
# Downloads land in $RAW (default ~/portfolio-xr-raw), which is
# OUTSIDE the repository on purpose. Git history counts toward the
# 1 GB GitHub Pages limit and never forgets, so every re-encode of a
# source file committed here would cost another permanent copy.
# Only the finished clips in media/ get committed.
#
# Usage:  tools/fetch.sh [--force]
# =========================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
RAW="${RAW:-$HOME/portfolio-xr-raw}"
FORCE="${1:-}"

if ! command -v yt-dlp >/dev/null 2>&1; then
  cat >&2 <<'EOF'
error: yt-dlp is not installed.

  brew install yt-dlp

EOF
  exit 1
fi

if [[ ! -f "$HERE/clips.tsv" ]]; then
  echo "error: tools/clips.tsv missing. Run: node tools/manifest.mjs" >&2
  exit 1
fi

mkdir -p "$RAW"
echo "downloading to $RAW"

total=0
fetched=0
skipped=0

while IFS=$'\t' read -r -u 3 tile key inpoint kind title; do
  [[ -z "${tile:-}" || "$tile" == \#* ]] && continue
  [[ "$kind" != "video" ]] && continue
  total=$((total + 1))

  out="$RAW/$key.mp4"
  if [[ -f "$out" && "$FORCE" != "--force" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  echo "  [$tile] $key — $title"
  # Cap at 1080p: the encoder never outputs above 720p, so pulling 4K
  # only costs bandwidth and disk.
  yt-dlp \
    --no-playlist \
    --format 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]' \
    --merge-output-format mp4 \
    --output "$out" \
    "https://www.youtube.com/watch?v=$key" || {
      echo "  ! failed: $key (continuing)" >&2
      continue
    }
  fetched=$((fetched + 1))
done 3< "$HERE/clips.tsv"

echo
echo "done — $fetched downloaded, $skipped already present, $total total"
echo "next: edit tools/clips.tsv in-points, then run tools/encode.sh"
