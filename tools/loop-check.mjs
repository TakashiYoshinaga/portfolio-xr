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
  percentile,
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

console.log("\n2. Falling below an established baseline must still degrade");
console.log("   (warm up at native first — a device slow from frame 0 is");
console.log("    indistinguishable from one whose native rate is that)");
for (const fps of [30, 60, 72, 90]) {
  const m = createFrameMonitor();
  feed(m, fps, 10); // establish the baseline at native
  const events = feed(m, fps, 30, 2); // then halve the rate
  const degrades = events.filter((e) => e.action === "degrade");
  ok(
    degrades.length >= 2 && m.level === 2,
    `${String(fps).padStart(3)}fps drops to half`,
    `ref=${m.referenceMs.toFixed(1)}ms level=${m.level}`
  );
}

console.log("\n3. Warm-up spikes must not poison the baseline");
for (const [label, spikeFrames] of [["2s", 120], ["1s", 60], ["none", 0]]) {
  const m = createFrameMonitor();
  feed(m, 60, 40, 1, spikeFrames);
  const expected = 1000 / 60;
  ok(
    Math.abs(m.referenceMs - expected) < 1.0,
    `60fps with ${label} of 4x startup spikes`,
    `ref=${m.referenceMs.toFixed(1)}ms expected≈${expected.toFixed(1)}ms`
  );
}

console.log("\n4. Reported frameRate (Quest) wins over measurement");
{
  const m = createFrameMonitor();
  m.setReportedFrameRate(72);
  feed(m, 72, 40, 1, 200); // spikes that would otherwise skew it
  ok(
    Math.abs(m.referenceMs - 1000 / 72) < 0.01,
    "session.frameRate=72 honoured despite spikes",
    `ref=${m.referenceMs.toFixed(2)}ms`
  );
}

console.log("\n5. Degrade then recover");
{
  const m = createFrameMonitor();
  feed(m, 72, 10);
  feed(m, 72, 30, 2);
  const dropped = m.level;
  feed(m, 72, 30);
  ok(dropped === 2 && m.level === 0, "72fps: down to 2, back to 0", `dropped=${dropped} now=${m.level}`);
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

console.log("\n7. Helpers");
ok(percentile([1, 2, 3, 4], 0) === 1, "percentile p=0 is the min");
ok(percentile([1, 2, 3, 4], 1) === 4, "percentile p=1 is the max");
ok(clampRef(1) === 6 && clampRef(999) === 45, "clampRef bounds");
{
  const b = frameBudget(1000 / 30);
  ok(
    b.degradeMs > 1000 / 30 && b.degradeMs < 1000 / 20,
    "30fps degrade threshold sits between 30 and 20fps",
    `degrade=${b.degradeMs.toFixed(1)}ms`
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures ? 1 : 0);
