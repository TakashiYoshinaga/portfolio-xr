/* =========================================================
   Renderer — one WebGLRenderer serving both XR and preview mode.
   ========================================================= */

import * as THREE from "three";
import { pickReferenceSpace } from "../xr/Session.js";

/** Window dimensions can still be 0 before the first layout pass,
 *  which would leave a 0x0 drawing buffer. */
function viewportSize() {
  return [window.innerWidth || 1280, window.innerHeight || 720];
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(...viewportSize());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearAlpha(0); // transparent so passthrough shows through
  renderer.xr.enabled = true;

  window.addEventListener("resize", () => {
    // While presenting, the XR device owns the framebuffer size.
    if (renderer.xr.isPresenting) return;
    renderer.setSize(...viewportSize());
  });

  return renderer;
}

/**
 * Hand a live XRSession to three.js.
 * setReferenceSpaceType MUST precede setSession — three.js configures
 * the space on attach and throws if the type is unavailable.
 * @returns {Promise<'local-floor'|'local'|'viewer'>} the type actually used
 */
export async function attachSession(renderer, session) {
  const type = await pickReferenceSpace(session);
  renderer.xr.setReferenceSpaceType(type);
  // Framebuffer scale can only be set before presenting starts, and
  // cannot be changed mid-session — so it is not a runtime lever.
  renderer.xr.setFramebufferScaleFactor(1.0);
  await renderer.xr.setSession(session);
  renderer.xr.setFoveation(0.6);
  return type;
}
