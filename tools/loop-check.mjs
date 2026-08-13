#!/usr/bin/env node
/* Checks the perf guardrail against synthesised frame-time sequences.
   Run: node tools/loop-check.mjs

   Exists because the guardrail's thresholds used to be absolute
   constants tuned for 72 fps, which meant a phone running WebXR AR
   perfectly well at 30 fps was judged to be struggling and had its
   atlas video paused. That is not reproducible on a desktop and was
   only ever going to be caught on a device — so the state machine is
   now separable from three.js and driven directly here. */
import {
  createFrameMonitor,
  frameBudget,
  baselineFrom,
  clampRef,
} from "../src/core/Loop.js";

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
};

/** Feed `seconds` of frames at `fps * (1/factor)` into a monitor. */
function feed(m, fps, seconds, factor = 1, spikes = 0) {
  const nativeMs = 1000 / fps;
  const events = [];
  const total = Math.round(fps * seconds);
  for (let i = 0; i < total; i++) {
    const ms = i < spikes ? nativeMs * 4 : nativeMs * factor;
    const e = m.sample(ms);
    if (e) events.push(e);
  }
  return events;
}

console.log("1. Steady at native cadence must NEVER degrade");
console.log("   (the reported bug: 30/60/72fps all degraded under the old fixed 12ms)");
for (const fps of [30, 60, 72, 90, 120]) {
  const m = createFrameMonitor();
  const events = feed(m, fps, 40);
  const degrades = events.filter((e) => e.action === "degrade");
  ok(
    degrades.length === 0,
    `${String(fps).padStart(3)}fps steady for 40s`,
    `ref=${m.referenceMs.toFixed(1)}ms degrades=${degrades.length}`
  );
}

console.log("\n2. A sudden drop is still noticed");
for (const fps of [30, 60, 72, 90]) {
  const m = createFrameMonitor();
  feed(m, fps, 15);
  const events = feed(m, fps, 6, 2.5); // brief, sharp slowdown
  ok(
    events.filter((e) => e.action === "degrade").length >= 1,
    `${String(fps).padStart(3)}fps hits a slow patch`,
    `ref=${m.referenceMs.toFixed(1)}ms level=${m.level}`
  );
}

console.log("\n2b. A SUSTAINED rate change becomes the new normal");
console.log("    (Android runs 60fps until ARCore settles it to 30 — locking");
console.log("     onto the fast start made the settled rate look like failure)");
{
  const m = createFrameMonitor();
  feed(m, 60, 10);        // the brief fast start
  feed(m, 30, 60);        // the rate it actually settles at
  ok(
    m.level === 0,
    "60fps start then sustained 30fps",
    `ref=${m.referenceMs.toFixed(1)}ms level=${m.level}`
  );
  ok(
    Math.abs(m.referenceMs - 1000 / 30) < 2,
    "reference follows the settled rate",
    `ref=${m.referenceMs.toFixed(1)}ms`
  );
}

console.log("\n3. Startup spikes must not leave a lasting mark");
for (const [label, spikeFrames] of [["2s", 120], ["1s", 60], ["none", 0]]) {
  const m = createFrameMonitor();
  feed(m, 60, 40, 1, spikeFrames);
  const expected = 1000 / 60;
  ok(
    Math.abs(m.referenceMs - expected) < 1.0 && m.level === 0,
    `60fps with ${label} of 4x startup spikes`,
    `ref=${m.referenceMs.toFixed(1)}ms level=${m.level}`
  );
}

console.log("\n4. A platform over-reporting its frame rate must not degrade us");
console.log("   (Android reports the 90Hz panel while WebXR AR delivers 30fps —");
console.log("    trusting that paused the atlas on hardware running perfectly)");
{
  const m = createFrameMonitor();
  m.noteReportedFrameRate(90); // what Android claims
  const events = feed(m, 30, 40); // what it actually delivers
  ok(
    events.filter((e) => e.action === "degrade").length === 0 && m.level === 0,
    "claims 90Hz, delivers 30fps",
    `ref=${m.referenceMs.toFixed(1)}ms claimed=${m.reportedFrameRate}Hz level=${m.level}`
  );
  ok(
    Math.abs(m.referenceMs - 1000 / 30) < 1,
    "reference follows measurement, not the claim",
    `ref=${m.referenceMs.toFixed(1)}ms`
  );
}

console.log("\n5. Degrade then recover");
{
  const m = createFrameMonitor();
  feed(m, 72, 15);
  const events = feed(m, 72, 6, 2.5);
  const dropped = events.some((e) => e.action === "degrade");
  feed(m, 72, 40);
  ok(dropped && m.level === 0, "72fps: degrades then returns to 0", `now=${m.level}`);
}

console.log("\n6. Long stalls are ignored, not treated as slowness");
{
  const m = createFrameMonitor();
  feed(m, 90, 10);
  // A 5s tab-switch style stall, then healthy frames again.
  for (let i = 0; i < 5; i++) m.sample(5000);
  const events = feed(m, 90, 20);
  ok(
    events.filter((e) => e.action === "degrade").length === 0,
    "90fps with a 5s stall mid-session",
    `level=${m.level}`
  );
}

console.log("\n7. Uneven delivery must not read as slowness");
console.log("   (bursts of fast frames with long waits — what Android WebXR AR");
console.log("    actually does. A steady sequence can never catch this.)");
for (const [label, pattern] of [
  ["3 fast + 1 long (avg 30fps)", [11, 11, 11, 100]],
  ["1 fast + 1 long (avg 30fps)", [11, 55.6]],
  ["jittery 60fps", [8, 8, 30, 8, 8, 30]],
]) {
  const m = createFrameMonitor();
  let events = [];
  for (let i = 0; i < 4000; i++) {
    const e = m.sample(pattern[i % pattern.length]);
    if (e) events.push(e);
  }
  const degrades = events.filter((e) => e.action === "degrade");
  ok(
    degrades.length === 0 && m.level === 0,
    label,
    `ref=${m.referenceMs.toFixed(1)}ms level=${m.level}`
  );
}

console.log("\n8. The guardrail can never stop playback");
{
  const m = createFrameMonitor();
  feed(m, 60, 15);
  feed(m, 60, 60, 8); // catastrophically slow, sustained
  ok(
    m.level <= 1,
    "never escalates past foveation, however bad it gets",
    `level=${m.level}`
  );
}

console.log("\n9. Helpers");
ok(baselineFrom([40, 33, 34, 33.5]) === 33.75, "reference is the median of recent windows");
ok(clampRef(1) === 6 && clampRef(999) === 45, "clampRef bounds");
for (const fps of [30, 60, 90]) {
  const b = frameBudget(1000 / fps);
  const degradeFps = 1000 / b.degradeMs;
  ok(
    degradeFps < fps * 0.8 && degradeFps > fps * 0.5,
    `${fps}fps degrades only well below native`,
    `at ${degradeFps.toFixed(0)}fps (${b.degradeMs.toFixed(1)}ms)`
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures ? 1 : 0);
