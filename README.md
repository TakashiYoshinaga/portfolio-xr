# portfolio-xr

The spatial edition of [takashiyoshinaga.github.io/portfolio](https://takashiyoshinaga.github.io/portfolio/) —
AR research and XR prototypes arranged around you in your own room.

**Requires WebXR: Meta Quest 3 (Horizon Browser) or Android Chrome with ARCore.**
iOS Safari has no WebXR, so the 2D portfolio only links here from devices that
can actually run it.

---

## The experience

On entry the gallery appears immediately in front of you — no tap-to-place, no
hit-test, no setup. Everything sits on a 1.6 m arc spanning about 105°, which
fits inside Quest 3's field of view, so all of it is readable without turning
around.

```
     RESEARCH (3 themes)            PROTOTYPES (8 of 22)
         ┌──────────┐          │    ┌────┐ ┌────┐ ┌────┐
         │ THEME 01 │          │    └────┘ └────┘ └────┘
         └──────────┘          │    ┌────┐ ┌────┐ ┌────┐
         ┌──────────┐        SPINE  └────┘ └────┘ └────┘
         │ THEME 02 │          │    ┌────┐ ┌────┐ ┌────┐
         └──────────┘          │    └────┘ └────┘ │ +14│
         ┌──────────┐          │                  └────┘
         │ THEME 03 │          │
         └──────────┘          │
              θ=-40°          0°     +8°   +27°   +46°
                      ── R = 1.6 m ──
```

The corridor is not there on arrival — it *grows*. Expanding a research theme
sends its projects receding into depth; `+14 MORE` grows the prototype grid into
concentric ranks, each one further out and higher so it clears the rank in front.
Selecting anything brings it to 1.05 m and unfolds it into a detail panel.

## Architecture notes

No build step. ES modules with an import map, three.js r185 vendored, fonts
self-hosted. The files in this repo are what the browser runs.

Three decisions carry most of the weight:

**One video decodes every thumbnail.** All 30 thumbnails live in a single
`atlas.mp4` as a 6×5 sprite grid, and each slab samples its own tile's UVs.
Thirty `<video>` elements would not be slow — it would be broken. Meta's guidance
for Quest Browser is to play one video at a time, and Chromium on Android ships
no software video decode, so exceeding the MediaCodec ceiling produces black
quads rather than dropped frames. Concurrent decoders are capped at two: the
atlas plus one hero clip.

**Stills are the floor, video is the upgrade.** `posters.jpg` loads first and the
gallery is fully usable on it alone. `atlas.mp4` swaps in only once frames are
actually arriving, and the perf guardrail can drop back to stills mid-session.
A missing decoder degrades to an image, never to a black rectangle.

**Text is sized by angle, not pixels.** Type is scaled to subtend a target angle
at each slab's real viewing distance, so slabs in the outer ranks stay as legible
as the near ones. Below roughly 0.8° body text is unreadable in a headset no
matter how many texels back it.

```
index.html          import map, entry screen, dom-overlay target
css/                design tokens (mirrored from the 2D site), self-hosted fonts
data/               the content, ported from the 2D site + the atlas tile order
src/core/           renderer, animation loop + perf guardrail, theme constants
src/xr/             capability probe, session ladders, placement, unified pointer
src/media/          sprite atlas, hero video pool, decoder budget
src/ui3d/           layout maths, slabs, Canvas2D painters
src/preview/        ?preview=1 developer view — not a product feature
tools/              media pipeline, run by hand
```

---

## Preparing the media

The gallery ships with poster stills already built, so it works before any of
this. These steps add the video.

### 1. Install yt-dlp

```bash
brew install yt-dlp
```

ffmpeg is also required and is usually already present (`brew install ffmpeg`).

### 2. Download the sources

```bash
tools/fetch.sh
```

Sources land in `~/portfolio-xr-raw/`, **outside this repository, on purpose**.
Git history counts toward the 1 GB GitHub Pages limit and never forgets — every
re-encode of a source committed here would cost another permanent copy. Only the
finished clips in `media/` get committed.

### 3. Pick the in-points — the one manual judgement

Edit the `in` column of [`tools/clips.tsv`](tools/clips.tsv). Each row is one
project; the timecode is where its highlight starts, and it drives both the 8 s
atlas loop and the 20 s hero clip. Everything defaults to `00:00:10`, so only
change the ones where the demo reads better elsewhere.

Re-running `node tools/manifest.mjs` merges in new rows and never overwrites a
timecode you have already set.

### 4. Encode

```bash
tools/encode.sh
```

Roughly 150–200 MB total. If it lands over ~300 MB, shorten `HERO_SECONDS` or
raise `-crf` in the script.

### 5. Publish

Commit `media/`, then enable GitHub Pages on **main / root** in the repository
settings. `.nojekyll` is already present.

---

## Development

```bash
python3 -m http.server 8777
```

then open `http://localhost:8777/?preview=1`.

`?preview=1` is a developer view — the same scene graph and the same pointer
abstraction, driven by an orbit camera instead of a headset. It is not offered on
the published site. `?fov=quest` reframes it at Quest 3's field of view, which is
the only way to check that the console really is readable without turning around.
Keys: `F` eye view, `O` overview, `G` toggle ground.

**WebXR needs a secure context.** `localhost` counts; pointing a headset at your
laptop's LAN IP over plain http does not, and that trips up almost everyone on
their first device test. The quickest path is to push to GitHub Pages and iterate
there.

`package.json` exists only to mark `.js` as ES modules so `tools/` can import
`data/` in Node. There are no dependencies and no install step — `npm install`
does nothing.

## License

MIT — see [LICENSE](LICENSE).
