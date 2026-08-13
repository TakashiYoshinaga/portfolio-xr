/* =========================================================
   Loop — one animation loop for both modes.

   renderer.setAnimationLoop() swaps itself to the XRSession's rAF
   when a session is active, so there is exactly one implementation.

   It also carries the perf guardrail: a rolling frame-time average
   that steps quality down rather than letting the device drop frames.
   Framebuffer scale can't change mid-session, so the levers are
   foveation first, then the atlas video.

   The guardrail's thresholds are RELATIVE to the cadence the device
   is measured to actually deliver.

   Three ways of getting this wrong have shipped, each ending with a
   black gallery on a healthy phone:

     1. An absolute 12 ms constant tuned for 72 fps, which quietly
        asked "slower than a Quest?" rather than "failing to keep up?"
     2. XRSession.frameRate as the reference — on Android that is the
        panel's refresh rate, not the rate WebXR AR delivers at.
     3. A baseline taken as a low percentile of individual frame times
        while the test was a window mean. Different statistics, so on
        a device with uneven delivery the test exceeded the reference
        unconditionally.

   Hence: measured, never reported; and the baseline is the same
   statistic as the thing being judged. frameRate is read for the
   debug readout and nothing else.
   ========================================================= */

const WINDOW = 90; // frames in the rolling average
const WARMUP_WINDOWS = 4; // no judgement while startup costs settle

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
 * Level 2 is the step that switches the atlas video off, and it is
 * deliberately much harder to reach than level 1. Every instance of
 * this guardrail misfiring has ended with a black gallery on healthy
 * hardware, and there is no observed case of it having helped, so the
 * bar for the destructive lever is the device running at half its own
 * measured pace.
 */
export function frameBudget(refMs, level = 0) {
  return {
    degradeMs: refMs * (level >= 1 ? 2.0 : 1.5),
    recoverMs: refMs * 1.2,
  };
}

/**
 * The baseline: the best WINDOW AVERAGE the device managed while
 * warming up.
 *
 * The statistic has to match the one being judged, and that is what
 * went wrong before. The reference was the 25th percentile of
 * individual frame times while the test was a window mean. On a
 * device that delivers frames unevenly — bursts of fast frames with
 * long waits between, which is what Android WebXR AR does — the mean
 * sits far above the 25th percentile no matter how healthy the
 * device is, so the comparison degraded unconditionally. Measured on
 * the phone: p25 of 11.0 ms against a mean of 33.3 ms, a ratio of
 * three, on hardware doing exactly what it should.
 *
 * Taking the minimum across warm-up windows rather than the median
 * discounts the startup window, where texture uploads and shader
 * compiles land, without needing to guess how long startup takes.
 */
export function baselineFrom(windowAverages) {
  if (!windowAverages.length) return null;
  return Math.min(...windowAverages);
}

export function clampRef(ms) {
  return Math.min(Math.max(ms, REF_MIN_MS), REF_MAX_MS);
}

/**
 * The guardrail as a plain state machine, independent of three.js and
 * of any clock, so it can be driven frame by frame in a test.
 */
export function createFrameMonitor({ maxLevel = 2 } = {}) {
  let acc = 0;
  let count = 0;
  let windows = 0;
  let level = 0;
  let cooldown = 0;
  let refMs = null;
  let reportedRate = null;
  const warmupAverages = [];

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
     * which degraded the guardrail straight to level 2 and paused the
     * atlas video on hardware that was running perfectly.
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
      windows++;

      if (windows <= WARMUP_WINDOWS) {
        warmupAverages.push(avgMs);
        if (windows === WARMUP_WINDOWS) {
          refMs = clampRef(baselineFrom(warmupAverages));
        }
        return null;
      }

      const { degradeMs, recoverMs } = frameBudget(refMs, level);

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
    const report = {
      level: change.level,
      avgMs: change.avgMs,
      refMs: change.refMs,
      nativeFps: 1000 / change.refMs,
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
