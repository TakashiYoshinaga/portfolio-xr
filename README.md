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
      ── RESEARCH ──               ── PROTOTYPES ──
        (3 themes)                    (9 of 22)
         ┌──────────┐          │    ┌────┐ ┌────┐ ┌────┐
         │ THEME 01 │          │    └────┘ └────┘ └────┘
         └──────────┘          │    ┌────┐ ┌────┐ ┌────┐
         ┌──────────┐        SPINE  └────┘ └────┘ └────┘
         │ THEME 02 │          │    ┌────┐ ┌────┐ ┌────┐
         └──────────┘          │    └────┘ └────┘ └────┘
         ┌──────────┐          │
         │ THEME 03 │          │   [RECENTER]     [+ MORE]
         └──────────┘          │
              θ=-40°          0°     +8°   +27°   +46°
                      ── R = 1.6 m ──
```

Nothing else is there on arrival — it *grows*. Expanding a research theme rushes
its projects in from depth to settle in the space the other themes vacate;
`+ MORE` reflows the prototype grid from 3×3 to 4×6 and scales the cards down to
fit. Selecting anything brings it to arm's length and unfolds it into a detail
panel; selecting again anywhere at all closes it, and a `‹ BACK` control under
the panel says so for anyone who would rather not guess.

The panel always opens upright, at the same height and the same distance,
in front of whichever way you are facing. Only yaw is taken from the head —
keeping pitch, as this first did, meant looking down at a low card threw the
panel down along that gaze and tilted it to match.

Both prototype grids sit on the same 1.6 m radius, so expanding can never put a
card behind another. Concentric ranks were tried first — further out and higher
so each was meant to clear the one in front — and they read as clutter no matter
how you offset them: the eye cannot separate "further away" from "overlapping"
when every card is the same shape.

The corridor is the transition, not the resting state. A receding line of cards
was built first and does not work: four cards down one axis each need roughly
their own angular width (~20°) of separation to avoid occluding each other, and
fanning them wide enough pushes the far one past 60° off-centre. The grid keeps
every project legible standing, seated, or on a phone — none of which can rely
on the viewer walking.

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

**Video textures upload on our own schedule.** three.js's `VideoTexture` drives
`needsUpdate` purely from `requestVideoFrameCallback` when the browser has it,
and its `update()` becomes a no-op in that case. rVFC fires when a frame is
presented for composition — which an invisible 1×1 element inside an immersive
session may never be, so the texture freezes on its last frame while the video
plays on. Indistinguishable from stopped playback, and it is why the phone
looked broken while Quest did not. `AtlasMedia.tick()` and the detail panel
compare `currentTime` instead: no rVFC dependency, and exactly one upload per
new frame.

**Stills are the floor, video is the upgrade.** `posters.jpg` loads first and the
gallery is fully usable on it alone. `atlas.mp4` swaps in only once frames are
actually arriving, and the perf guardrail can drop back to stills mid-session.
A missing decoder degrades to an image, never to a black rectangle.

**Text is sized by angle, not pixels.** Type is scaled to subtend a target angle
at the slab's real viewing distance and size, rather than to a pixel height.
Below roughly 0.8° body text is unreadable in a headset no matter how many texels
back it.

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
project; the timecode is where its highlight starts, and it drives both the atlas
loop and the hero clip (`ATLAS_SECONDS` and `HERO_SECONDS` in `tools/encode.sh`,
currently 16 s and 40 s). Everything defaults to `00:00:10`, so only change the
ones where the demo reads better elsewhere.

An in-point that leaves less than the full length before the end of the source is
pulled back automatically, and the shift is reported — a timecode near the end
would otherwise yield a fraction-of-a-second clip that loops as a stutter. Where
the source is simply shorter than `HERO_SECONDS`, the clip is whatever the video
has.

Re-running `node tools/manifest.mjs` merges in new rows and never overwrites a
timecode you have already set.

### 4. Encode

```bash
tools/encode.sh
```

About 160 MB: a 12.6 MB atlas plus 29 hero clips at 1280×720, crf 27. If it lands over
~300 MB, shorten `HERO_SECONDS` or raise `-crf` in the script.

Note that a re-encode commits a whole second copy of `media/` into git history,
which never shrinks and counts toward the 1 GB limit. Prefer settling the lengths
and in-points before committing.

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

`?debug=1` puts a state readout inside the session — playing vs. paused vs.
texture-frozen, upload and rVFC counts, perf level, visibility. A phone in
immersive AR has no reachable console without a USB cable, which otherwise makes
"it stops after a while" a report you can only answer by guessing.

**WebXR needs a secure context.** `localhost` counts; pointing a headset at your
laptop's LAN IP over plain http does not, and that trips up almost everyone on
their first device test.

To test on a real device without publishing, forward the port over USB —
Chrome's forwarding presents the server as `localhost` on the device, which
satisfies the secure-context rule:

```
chrome://inspect#devices → Port forwarding → 8777 : localhost:8777
```

Then open `http://localhost:8777/` on the phone or headset. The same page gives
you its console, which is the only way to see the `[perf]` logs from a session.

```bash
node tools/loop-check.mjs
```

checks the perf guardrail against synthesised frame-time sequences. It exists
because the guardrail's thresholds were once absolute constants tuned for 72 fps
— which meant "slower than a Quest" rather than "failing to keep up", so a phone
running perfectly well at its native 30 fps was judged to be struggling and had
its atlas video paused twelve seconds in. That is invisible on a desktop, so the
state machine is separable from three.js and driven directly by the check.

`package.json` exists only to mark `.js` as ES modules so `tools/` can import
`data/` in Node. There are no dependencies and no install step — `npm install`
does nothing.

## License

MIT — see [LICENSE](LICENSE).
