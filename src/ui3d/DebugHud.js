/* =========================================================
   DebugHud — state readout inside the session, behind ?debug=1.

   A phone in immersive AR has no reachable console without a USB
   cable and chrome://inspect, which makes "it stops after a while"
   the kind of report that can only be answered by guessing. This
   puts the answer in the headset.

   The distinction it exists to make: PAUSED means something stopped
   the video, FROZEN means the video is playing fine and the texture
   is not being uploaded. Those look identical to a viewer and have
   completely different causes.
   ========================================================= */

import * as THREE from "three";
import { COLOR, FONT } from "../core/Theme.js";
import { arcSlot } from "./Layout.js";

const WIDTH = 512;
const HEIGHT = 288;
const PANEL_W = 0.46;
const ANGLE = -16; // on the spine, between the two banks
const RADIUS = 1.25;
const Y = 1.02;
const REPAINT_HZ = 4;

export function createDebugHud() {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W, (PANEL_W * HEIGHT) / WIDTH),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false, // always readable, even behind a panel
      toneMapped: false,
    })
  );
  mesh.renderOrder = 999;

  let elapsed = 0;
  let lastRealPaint = 0;
  let frames = 0;
  let fpsWindow = 0;
  let fps = 0;

  function paint(lines) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(5,7,13,0.88)";
    ctx.beginPath();
    ctx.roundRect(0, 0, WIDTH, HEIGHT, 14);
    ctx.fill();
    ctx.strokeStyle = COLOR.accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Shrink until the widest line fits. A diagnostic panel that
    // clips its own text is worse than useless — you cannot tell a
    // missing field from a field that is empty.
    const pad = 18;
    const maxWidth = WIDTH - pad * 2;
    let size = 28;
    for (; size > 14; size -= 1) {
      ctx.font = `500 ${size}px ${FONT.mono}`;
      const widest = Math.max(...lines.map(([t]) => ctx.measureText(t).width));
      if (widest <= maxWidth) break;
    }

    ctx.font = `500 ${size}px ${FONT.mono}`;
    const lineHeight = size * 1.3;
    let y = Math.max(size * 1.4, (HEIGHT - lineHeight * lines.length) / 2 + size);
    for (const [text, colour] of lines) {
      ctx.fillStyle = colour ?? COLOR.text;
      ctx.fillText(text, pad, y);
      y += lineHeight;
    }
    texture.needsUpdate = true;
  }

  return {
    object3d: mesh,

    setEyeHeight(eyeY) {
      const slot = arcSlot(ANGLE, RADIUS, Y, eyeY);
      mesh.position.copy(slot.position);
      mesh.rotation.copy(slot.rotation);
    },

    /**
     * @param {number} dt
     * @param {{atlas:object, loop:object, renderer:object}} sources
     */
    update(dt, { atlas, loop, renderer }) {
      elapsed += dt;
      frames++;
      fpsWindow += dt;
      if (fpsWindow >= 0.5) {
        fps = frames / fpsWindow;
        frames = 0;
        fpsWindow = 0;
      }

      // Judged against the wall clock, not accumulated dt. "currentTime
      // has not moved" only means something when real time has passed;
      // driven frame-by-frame it is always true, and a diagnostic that
      // cries wolf is worse than none.
      const now = performance.now();
      if (now - lastRealPaint < 1000 / REPAINT_HZ) return;
      const realElapsed = now - lastRealPaint;
      lastRealPaint = now;
      const canJudgeMotion = realElapsed >= 150;

      const s = atlas.stats;
      const good = COLOR.accent;
      const bad = "#fca5a5";
      const warn = "#fbbf24";

      // The verdict line, which is the whole point of this panel.
      let verdict = "OK play + upload";
      let verdictColour = good;
      if (s.state !== "video") {
        verdict = "POSTER (no video)";
        verdictColour = warn;
      } else if (s.paused) {
        verdict = "VIDEO PAUSED";
        verdictColour = bad;
      } else if (canJudgeMotion && this._lastTime === s.currentTime) {
        verdict = "VIDEO STALLED";
        verdictColour = bad;
      } else if (canJudgeMotion && this._lastUploads === s.uploads) {
        verdict = "TEXTURE FROZEN";
        verdictColour = bad;
      }
      const rvfcDelta = s.rvfcCount - (this._lastRvfc ?? 0);
      this._lastTime = s.currentTime;
      this._lastUploads = s.uploads;
      this._lastRvfc = s.rvfcCount;

      paint([
        [verdict, verdictColour],
        [`${s.state} pause=${s.paused ? 1 : 0} rdy=${s.readyState}`],
        [`t=${s.currentTime.toFixed(1)}/${s.duration.toFixed(1)}s`],
        [
          `tex=${s.uploads} rVFC=${s.rvfcCount} +${rvfcDelta}`,
          rvfcDelta === 0 ? warn : COLOR.textMuted,
        ],
        [
          `lvl=${loop.level} ref=${loop.referenceMs?.toFixed(1) ?? "-"} fps=${fps.toFixed(0)}`,
        ],
        [
          // The reported rate is not used for anything; it is here
          // because a platform lying about it is exactly what caused
          // the atlas to be paused on a healthy phone.
          `claimed=${loop.reportedFrameRate ?? "-"}Hz`,
          COLOR.textMuted,
        ],
        [
          `vis=${document.visibilityState} xr=${renderer.xr.isPresenting ? 1 : 0} ${elapsed.toFixed(0)}s`,
          COLOR.textMuted,
        ],
      ]);
    },

    dispose() {
      mesh.geometry.dispose();
      mesh.material.dispose();
      texture.dispose();
    },
  };
}
