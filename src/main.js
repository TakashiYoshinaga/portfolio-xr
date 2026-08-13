/* =========================================================
   main — bootstrap and session lifecycle.

   Routes on capability, owns the renderer and the loop, and wires
   the Pointer to the Stage. Everything device-specific lives behind
   xr/; everything visual lives behind ui3d/.
   ========================================================= */

import * as THREE from "three";
import {
  probe,
  isPreviewRequested,
  isLocalDev,
  isDebugRequested,
} from "./xr/Capabilities.js";
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
import { createGallery } from "./ui3d/Gallery.js";
import { waitForFonts } from "./ui3d/TextPainter.js";
import { createEntryScreen } from "./ui2d/EntryScreen.js";
import { createPreview } from "./preview/PreviewMode.js";
import { createDebugHud } from "./ui3d/DebugHud.js";
import { createAtlasMedia } from "./media/AtlasMedia.js";
import { createVideoPool } from "./media/VideoPool.js";

const canvas = document.getElementById("xr-canvas");
const overlayRoot = document.getElementById("xr-overlay");

const renderer = createRenderer(canvas);
const scene = new THREE.Scene();

// three.js drives this camera from the XR pose and builds its stereo
// ArrayCamera around it. It never needs manual positioning.
const xrCamera = new THREE.PerspectiveCamera(62, 1, 0.05, 80);

let stage = null;
let gallery = null;
let placement = null;
let pointer = null;
let preview = null;
let xrSession = null;
let atlas = null;
let heroPool = null;
let debugHud = null;
let loop = null;

/** Where the viewer's head is, in world space. The XR camera during
 *  a session, the orbit camera in preview — the gallery does not
 *  need to know which. */
const _headPos = new THREE.Vector3();
const _headQuat = new THREE.Quaternion();
function currentHead() {
  const camera = renderer.xr.isPresenting
    ? renderer.xr.getCamera()
    : preview?.camera ?? xrCamera;
  camera.getWorldPosition(_headPos);
  camera.getWorldQuaternion(_headQuat);
  return { position: _headPos, quaternion: _headQuat };
}

/* --------------------------------------------------------
   XR entry. The click that reaches here is the only user
   activation we get — Phase 3 primes the video pool at the
   top of this function, before requestSession can eat it.
   -------------------------------------------------------- */
async function enterXR(mode, setStatus) {
  // Unlock media FIRST, while user activation from the click is still
  // live. requestSession can resolve seconds later behind Quest's
  // spatial-data consent dialog, by which point the activation is
  // gone and any video opened later would be silently blocked.
  setStatus("Preparing media…");
  await Promise.all([heroPool.prime(), atlas.prime()]);

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

  atlas.start(); // upgrades stills to video when frames arrive
  session.addEventListener("end", onSessionEnd, { once: true });
}

function onSessionEnd() {
  xrSession = null;
  overlayRoot.classList.remove("is-active");
  pointer?.setEnabled(true);
  // Hero decoders are worth nothing outside a session and holding
  // them just eats into the ceiling on the next entry.
  heroPool?.releaseAll();
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

  // Stills first, video later: the gallery is fully usable on the
  // poster atlas alone, so a missing or undecodable atlas.mp4
  // degrades to a still gallery rather than to black quads.
  atlas = await createAtlasMedia({
    onTexture: (texture) => stage?.setMediaTexture(texture),
  });
  // One hero decoder in XR; a second on desktop where there is
  // headroom and no compositor deadline to miss.
  heroPool = createVideoPool(wantsPreview ? 2 : 1);

  // The stage paints its label atlas on construction, so it must come
  // after the fonts resolve — a canvas drawn with a fallback face
  // bakes that fallback into a texture that is never repainted.
  stage = createStage({ mediaTexture: atlas.texture });
  scene.add(stage.rig);
  gallery = createGallery({
    stage,
    heroPool,
    atlas,
    onRecenter: () => placement.recenter(),
  });
  placement = createPlacement(stage.rig);

  pointer = createPointer(renderer, scene, () => gallery.pickables, {
    onHover(object, previous) {
      stage.nodeFor(previous)?.setHovered(false);
      stage.nodeFor(object)?.setHovered(true);
    },
    onSelect(object) {
      gallery.select(stage.nodeFor(object), currentHead());
    },
  });

  loop = startLoop();

  if (isDebugRequested()) {
    debugHud = createDebugHud();
    debugHud.setEyeHeight(stage.eyeHeight);
    stage.rig.add(debugHud.object3d);
  }

  window.__xr = {
    renderer, scene, stage, gallery, placement, pointer, atlas, heroPool, THREE,
    head: currentHead,
  };

  if (wantsPreview) {
    preview = createPreview(renderer, scene);
    placement.placeForPreview();
    stage.setEyeHeight(1.6);
    gallery.relayout(true);
    entry.hide();
    wirePreviewInput();
    atlas.start();
    window.__xr.preview = preview;
    // Headless and backgrounded tabs throttle rAF to a standstill, so
    // offer a way to draw one frame on demand when verifying.
    window.__xr.renderOnce = (dt = 1 / 60) => {
      preview.update();
      atlas.tick();
      gallery.update(dt);
      debugHud?.update(dt, { atlas, loop, renderer });
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
  return createLoop(renderer, {
    onFrame(dt, frame) {
      if (renderer.xr.isPresenting) {
        const refSpace = renderer.xr.getReferenceSpace();
        if (placement.update(frame, refSpace)) {
          // A 1.5 m and a 1.9 m viewer want different pitch on the
          // lower rows, so re-seat once the real head height lands.
          stage.setEyeHeight(placement.headHeight);
          gallery.relayout(true);
        }
        pointer.updateXR();
        atlas.tick();
        gallery.update(dt);
        debugHud?.update(dt, { atlas, loop, renderer });
        renderer.render(scene, xrCamera);
      } else if (preview) {
        preview.update();
        atlas.tick();
        gallery.update(dt);
        debugHud?.update(dt, { atlas, loop, renderer });
        renderer.render(scene, preview.camera);
      }
    },
    // Both logs quote the device's own cadence alongside the measured
    // average. Without it "33.3ms" is unreadable — that is a phone
    // running perfectly at 30 fps, and it used to be enough to get the
    // atlas paused.
    onDegrade({ level, avgMs, refMs, nativeFps }) {
      console.warn(
        `[perf] ${avgMs.toFixed(1)}ms avg vs ${refMs.toFixed(1)}ms native ` +
          `(${nativeFps.toFixed(0)}fps) — quality level ${level}`
      );
      // Deliberately no media lever here. Switching the atlas video
      // off used to be the level-2 response, and it misjudged healthy
      // hardware four times over without once being observed to help.
      // Foveation (handled in Loop) is free and reversible; this is
      // now reporting only.
    },
    onRecover({ level, avgMs, refMs, nativeFps }) {
      console.info(
        `[perf] recovered: ${avgMs.toFixed(1)}ms avg vs ${refMs.toFixed(1)}ms ` +
          `native (${nativeFps.toFixed(0)}fps) — quality level ${level}`
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
