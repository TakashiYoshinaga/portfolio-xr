/* =========================================================
   Loop — one animation loop for both modes.

   renderer.setAnimationLoop() swaps itself to the XRSession's rAF
   when a session is active, so there is exactly one implementation.

   It also carries the perf guardrail: a rolling frame-time average
   that steps quality down rather than letting the headset drop
   frames. Framebuffer scale can't change mid-session, so the levers
   are foveation first, then the atlas video.
   ========================================================= */

const TARGET_MS = 13.7; // 72 fps
const DEGRADE_MS = 12.0;
const RECOVER_MS = 9.0;
const WINDOW = 90; // frames in the rolling average

export function createLoop(renderer, { onFrame, onDegrade, onRecover }) {
  let acc = 0;
  let count = 0;
  let last = 0;
  let level = 0; // 0 = full, 1 = heavy foveation, 2 = atlas paused
  let cooldown = 0;

  renderer.setAnimationLoop((time, frame) => {
    const dt = last ? (time - last) / 1000 : 0;
    const frameMs = last ? time - last : 0;
    last = time;

    onFrame(dt, frame, time);

    if (frameMs > 0 && frameMs < 200) {
      acc += frameMs;
      count++;
    }
    if (count >= WINDOW) {
      const avg = acc / count;
      acc = 0;
      count = 0;
      if (cooldown > 0) {
        cooldown--;
      } else if (avg > DEGRADE_MS && level < 2) {
        level++;
        cooldown = 2;
        applyLevel(renderer, level);
        onDegrade?.(level, avg);
      } else if (avg < RECOVER_MS && level > 0) {
        level--;
        cooldown = 2;
        applyLevel(renderer, level);
        onRecover?.(level, avg);
      }
    }
  });

  return {
    get level() {
      return level;
    },
    get targetMs() {
      return TARGET_MS;
    },
    stop() {
      renderer.setAnimationLoop(null);
    },
  };
}

function applyLevel(renderer, level) {
  if (!renderer.xr.isPresenting) return;
  renderer.xr.setFoveation(level === 0 ? 0.6 : 1.0);
}
