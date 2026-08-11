/* =========================================================
   main — bootstrap and session lifecycle.

   Routes on capability, owns the renderer and the loop, and wires
   the Pointer to the Stage. Everything device-specific lives behind
   xr/; everything visual lives behind ui3d/.
   ========================================================= */

import * as THREE from "three";
import { probe, isPreviewRequested, isLocalDev } from "./xr/Capabilities.js";
import {
  request as requestSession,
  explainSessionError,
  hasDomOverlay,
} from "./xr/Session.js";
import { createRenderer, attachSession } from "./core/Renderer.js";
import { createLoop } from "./core/Loop.js";
import { createPlacement } from "./xr/Placement.js";
import { createPointer } from "./xr/Pointer.js";
import { createStage } from "./ui3d/Stage.js";
import { waitForFonts } from "./ui3d/TextPainter.js";
import { createEntryScreen } from "./ui2d/EntryScreen.js";
import { createPreview } from "./preview/PreviewMode.js";

const canvas = document.getElementById("xr-canvas");
const overlayRoot = document.getElementById("xr-overlay");

const renderer = createRenderer(canvas);
const scene = new THREE.Scene();

// three.js drives this camera from the XR pose and builds its stereo
// ArrayCamera around it. It never needs manual positioning.
const xrCamera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);

let stage = null;
let placement = null;
let pointer = null;
let preview = null;
let xrSession = null;

/* --------------------------------------------------------
   XR entry. The click that reaches here is the only user
   activation we get — Phase 3 primes the video pool at the
   top of this function, before requestSession can eat it.
   -------------------------------------------------------- */
async function enterXR(mode, setStatus) {
  let session;
  try {
    setStatus("Requesting session…");
    session = await requestSession(mode, overlayRoot);
  } catch (err) {
    throw new Error(explainSessionError(err, mode));
  }

  try {
    const refSpaceType = await attachSession(renderer, session);
    placement.setReferenceSpaceType(refSpaceType);
  } catch (err) {
    session.end().catch(() => {});
    throw new Error(explainSessionError(err, mode));
  }

  xrSession = session;
  placement.recenter();

  entry.hide();
  if (hasDomOverlay(session)) overlayRoot.classList.add("is-active");

  session.addEventListener("end", onSessionEnd, { once: true });
}

function onSessionEnd() {
  xrSession = null;
  overlayRoot.classList.remove("is-active");
  pointer?.setEnabled(true);
  entry.show();
  entry.setStatus("");
}

const entry = createEntryScreen({ onEnter: enterXR });

document.getElementById("ov-exit")?.addEventListener("click", () => {
  xrSession?.end();
});
document.getElementById("ov-recenter")?.addEventListener("click", () => {
  placement?.recenter();
});

/* --------------------------------------------------------
   Boot
   -------------------------------------------------------- */
(async function boot() {
  const wantsPreview = isPreviewRequested();
  const [caps] = await Promise.all([probe(), waitForFonts()]);

  // The stage paints its label atlas on construction, so it must come
  // after the fonts resolve — a canvas drawn with a fallback face
  // bakes that fallback into a texture that is never repainted.
  stage = createStage();
  scene.add(stage.rig);
  placement = createPlacement(stage.rig);

  pointer = createPointer(renderer, scene, () => stage.pickables, {
    onHover(object, previous) {
      stage.slabFor(previous)?.setHovered(false);
      stage.slabFor(object)?.setHovered(true);
    },
    onSelect(object) {
      const slab = stage.slabFor(object);
      if (!slab) return;
      // Phase 4 replaces this with the corridor and focus states.
      console.log("[select]", slab.kind, slab.key, slab.data?.title ?? "");
    },
  });

  startLoop();

  window.__xr = { renderer, scene, stage, placement, pointer, THREE };

  if (wantsPreview) {
    preview = createPreview(renderer, scene);
    placement.placeForPreview();
    stage.setEyeHeight(1.6, true);
    entry.hide();
    wirePreviewInput();
    window.__xr.preview = preview;
    // Headless and backgrounded tabs throttle rAF to a standstill, so
    // offer a way to draw one frame on demand when verifying.
    window.__xr.renderOnce = (dt = 1 / 60) => {
      preview.update();
      stage.update(dt);
      renderer.render(scene, preview.camera);
    };
    console.info(
      "[preview] developer mode — F: eye view · O: overview · G: toggle ground"
    );
    return;
  }

  entry.render(caps, { previewAvailable: isLocalDev() });
})();

function startLoop() {
  createLoop(renderer, {
    onFrame(dt, frame) {
      if (renderer.xr.isPresenting) {
        const refSpace = renderer.xr.getReferenceSpace();
        if (placement.update(frame, refSpace)) {
          stage.setEyeHeight(placement.headHeight, true);
        }
        pointer.updateXR();
        stage.update(dt);
        renderer.render(scene, xrCamera);
      } else if (preview) {
        preview.update();
        stage.update(dt);
        renderer.render(scene, preview.camera);
      }
    },
    onDegrade(level, avg) {
      console.warn(
        `[perf] frame time ${avg.toFixed(1)}ms — quality level ${level}`
      );
    },
    onRecover(level, avg) {
      console.info(
        `[perf] recovered to ${avg.toFixed(1)}ms — quality level ${level}`
      );
    },
  });
}

function wirePreviewInput() {
  const ndc = new THREE.Vector2();
  const toNdc = (e) => {
    ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    return ndc;
  };
  let dragged = false;
  canvas.addEventListener("pointermove", (e) => {
    // Only a move with a button held counts as a drag — otherwise
    // plain hovering would suppress every click.
    if (e.buttons !== 0) dragged = true;
    pointer.updatePreview(preview.camera, toNdc(e));
  });
  canvas.addEventListener("pointerdown", () => {
    dragged = false;
  });
  canvas.addEventListener("pointerup", (e) => {
    // OrbitControls consumes drags; only a clean tap is a select.
    if (!dragged) pointer.selectPreview(preview.camera, toNdc(e));
    dragged = false;
  });
}
