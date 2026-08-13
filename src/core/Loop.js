/* =========================================================
   Loop — one animation loop for both modes.

   renderer.setAnimationLoop() swaps itself to the XRSession's rAF
   when a session is active, so there is exactly one implementation.

   It also carries the perf guardrail: a rolling frame-time average
   that steps foveation up rather than letting the device drop frames.
   Framebuffer scale can't change mid-session and the atlas video is
   deliberately not a lever, so foveation is the only one there is.

   The guardrail no longer switches the atlas video off. That lever
   misjudged a healthy phone four separate times, each ending with a
   frozen gallery, and was never once observed to help:

     1. An absolute 12 ms constant tuned for 72 fps, which quietly
        asked "slower than a Quest?" rather than "failing to keep up?"
     2. XRSession.frameRate as the reference — on Android that is the
        panel's refresh rate, not the rate WebXR AR delivers at (and
        on the reporting phone it was not exposed at all).
     3. A baseline taken as a low percentile of individual frame times
        while the test was a window mean — different statistics, so on
        Android's uneven delivery the test exceeded the reference
        unconditionally.
     4. A baseline taken as the fastest warm-up window, which locked
        onto the 60 fps the session briefly runs at before ARCore
        settles it to 30, making the settled rate look like a 2x
        regression.

   Every one of those is a different way of guessing a number that no
   API will tell us and that legitimately changes mid-session. The
   conclusion is that the premise was wrong, not the tuning: a
   heuristic with a destructive action and no way to be sure should
   not have the destructive action. Foveation still steps up — it is
   free and reversible — and the readings feed the debug panel.

   What remains is deliberately a DEVIATION detector, not an absolute
   one: the reference is a rolling median of recent windows, so a
   sustained change in cadence becomes the new normal instead of a
   permanent accusation.
   ========================================================= */

const WINDOW = 90; // frames in the rolling average
const HISTORY = 12; // window averages kept for the rolling reference
const MIN_HISTORY = 4; // nothing is judged before this much settles

/* Plausible bounds for a measured frame interval, so a pathological
   startup can never install a nonsense baseline. 6ms = 165fps,
   45ms = 22fps. */
const REF_MIN_MS = 6;
const REF_MAX_MS = 45;

/**
 * Thresholds for a device whose baseline window average is `refMs`.
 *
 * Exported so they can be checked directly against synthesised
 * frame-time sequences rather than only on a device.
 *
 * The gap between the two is hysteresis: a window has to run half
 * again slower than recent ones to read as a deviation, and back
 * within a fifth of them to read as recovered, so a device sitting
 * near the line does not oscillate.
 */
export function frameBudget(refMs) {
  return { degradeMs: refMs * 1.5, recoverMs: refMs * 1.2 };
}

/**
 * The reference: the median of recent window averages.
 *
 * Same statistic as the thing being judged, and rolling rather than
 * fixed. A fixed baseline has to answer "what is this device capable
 * of", which nothing can tell us and which changes mid-session — a
 * WebXR AR session on Android runs at 60 fps until ARCore settles it
 * to 30. A rolling median simply asks "is this window unlike the
 * recent past", so that transition moves the reference instead of
 * being read as a permanent 2x regression.
 */
export function baselineFrom(windowAverages) {
  if (!windowAverages.length) return null;
  const sorted = [...windowAverages].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function clampRef(ms) {
  return Math.min(Math.max(ms, REF_MIN_MS), REF_MAX_MS);
}

/**
 * The guardrail as a plain state machine, independent of three.js and
 * of any clock, so it can be driven frame by frame in a test.
 */
export function createFrameMonitor({ maxLevel = 1 } = {}) {
  let acc = 0;
  let count = 0;
  let level = 0;
  let cooldown = 0;
  let refMs = null;
  let reportedRate = null;
  const history = [];

  return {
    get level() {
      return level;
    },
    get referenceMs() {
      return refMs;
    },

    get reportedFrameRate() {
      return reportedRate;
    },

    /**
     * Recorded for diagnostics ONLY — deliberately not used as the
     * reference.
     *
     * XRSession.frameRate was treated as authoritative first, and on
     * Android it reports the panel's refresh rate (90) while WebXR AR
     * actually delivers frames at the camera's cadence (30). That
     * makes the device look three times slower than its own baseline,
     * which back when the guardrail still had a media lever was enough
     * to switch the atlas off on hardware that was running perfectly.
     *
     * What the guardrail needs is what the device actually delivers,
     * and the only honest source for that is measurement. A reported
     * rate faster than reality causes false degradation; measuring
     * can at worst adopt a struggling baseline and do nothing, which
     * is the safe direction to be wrong in.
     */
    noteReportedFrameRate(rate) {
      if (rate && rate > 0) reportedRate = rate;
    },

    /**
     * @returns {null | {action:'degrade'|'recover', level:number,
     *                   avgMs:number, refMs:number}}
     */
    sample(frameMs) {
      // Discard obvious stalls (tab switch, session interruption);
      // they say nothing about steady-state performance.
      if (!(frameMs > 0) || frameMs >= 200) return null;

      acc += frameMs;
      count++;
      if (count < WINDOW) return null;

      const avgMs = acc / count;
      acc = 0;
      count = 0;

      history.push(avgMs);
      if (history.length > HISTORY) history.shift();
      if (history.length < MIN_HISTORY) return null;
      refMs = clampRef(baselineFrom(history));

      const { degradeMs, recoverMs } = frameBudget(refMs);

      if (cooldown > 0) {
        cooldown--;
        return null;
      }
      if (avgMs > degradeMs && level < maxLevel) {
        level++;
        cooldown = 2;
        return { action: "degrade", level, avgMs, refMs };
      }
      if (avgMs < recoverMs && level > 0) {
        level--;
        cooldown = 2;
        return { action: "recover", level, avgMs, refMs };
      }
      return null;
    },
  };
}

export function createLoop(renderer, { onFrame, onDegrade, onRecover }) {
  const monitor = createFrameMonitor();
  let last = 0;
  let askedForRate = false;

  renderer.setAnimationLoop((time, frame) => {
    const dt = last ? (time - last) / 1000 : 0;
    const frameMs = last ? time - last : 0;
    last = time;

    onFrame(dt, frame, time);

    // The session only exists once presenting starts, so this cannot
    // be read at construction time.
    if (!askedForRate && renderer.xr.isPresenting) {
      askedForRate = true;
      monitor.noteReportedFrameRate(renderer.xr.getSession()?.frameRate);
    }

    const change = monitor.sample(frameMs);
    if (!change) return;

    applyLevel(renderer, change.level);
    // refFps, not nativeFps: refMs is the median of recent windows,
    // which is what this device has been doing lately and not a rate
    // any API vouches for.
    const report = {
      level: change.level,
      avgMs: change.avgMs,
      refMs: change.refMs,
      refFps: 1000 / change.refMs,
    };
    if (change.action === "degrade") onDegrade?.(report);
    else onRecover?.(report);
  });

  return {
    get level() {
      return monitor.level;
    },
    get referenceMs() {
      return monitor.referenceMs;
    },
    /** What the platform claims, for the debug readout. Not used to
     *  judge anything — see noteReportedFrameRate. */
    get reportedFrameRate() {
      return monitor.reportedFrameRate;
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
