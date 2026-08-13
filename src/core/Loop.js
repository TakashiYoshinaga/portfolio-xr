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

   Two ways of getting this wrong have already shipped. First an
   absolute 12 ms constant tuned for 72 fps, which quietly asked
   "slower than a Quest?" rather than "failing to keep up?" — so a
   phone running WebXR AR perfectly well at 30 fps was judged to be
   struggling and had its atlas video paused. Then XRSession.frameRate
   as the reference, which on Android reports the panel's refresh rate
   (90) while WebXR AR delivers at the camera's cadence (30) — same
   outcome, three times over.

   Measurement is the only honest answer to "what is this device
   actually doing", so that is what is used. frameRate is recorded for
   diagnostics and nothing else.
   ========================================================= */

const WINDOW = 90; // frames in the rolling average
const WARMUP_WINDOWS = 2; // no judgement while startup costs settle

/* Plausible bounds for a measured frame interval, so a pathological
   startup can never install a nonsense baseline. 6ms = 165fps,
   45ms = 22fps. */
const REF_MIN_MS = 6;
const REF_MAX_MS = 45;

/**
 * Degrade and recover thresholds for a device whose native frame
 * interval is `refMs`.
 *
 * Exported so the thresholds can be checked directly against
 * synthesised frame-time sequences rather than only on a headset.
 */
export function frameBudget(refMs) {
  return {
    degradeMs: refMs * 1.5, // a third below native before we act
    recoverMs: refMs * 1.2,
  };
}

/**
 * A low percentile, not a mean and not a median.
 *
 * The first seconds include texture uploads, shader compiles and the
 * video decoder spinning up. A mean bakes those spikes in; a median
 * does too as soon as the spikes outnumber the settled frames, which
 * they easily can inside a short warm-up. What we want is the pace
 * the device hits when nothing is wrong — the floor it settles to —
 * and that is the fast end of the distribution.
 */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * p))
  );
  return sorted[index];
}

const REF_PERCENTILE = 0.25;

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
  const warmupSamples = [];

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
      if (refMs === null) warmupSamples.push(frameMs);
      if (count < WINDOW) return null;

      const avgMs = acc / count;
      acc = 0;
      count = 0;
      windows++;

      if (windows <= WARMUP_WINDOWS) {
        if (refMs === null && windows === WARMUP_WINDOWS) {
          refMs = clampRef(percentile(warmupSamples, REF_PERCENTILE));
        }
        return null;
      }
      if (refMs === null) refMs = clampRef(percentile(warmupSamples, REF_PERCENTILE));

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
