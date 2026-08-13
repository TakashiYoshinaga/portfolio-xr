/* =========================================================
   Capabilities — what can this device actually do?

   Feature detection only, never UA sniffing. iOS Safari has no
   WebXR today; if Apple ever ships it, this file needs no change.
   ========================================================= */

/**
 * @returns {Promise<{mode:'ar'|'vr'|'none'|'insecure'}>}
 */
export async function probe() {
  // WebXR is gated on secure context. *.github.io is https, but a
  // headset pointed at a laptop's LAN IP over plain http is not,
  // and that is the single most common way this fails in testing.
  if (!window.isSecureContext) return { mode: "insecure" };
  if (!navigator.xr) return { mode: "none" };

  if (await supports("immersive-ar")) return { mode: "ar" };
  if (await supports("immersive-vr")) return { mode: "vr" };
  return { mode: "none" };
}

/** isSessionSupported can reject (e.g. inside a permissions-restricted
 *  iframe) rather than resolve false, so never call it bare. */
async function supports(mode) {
  try {
    return await navigator.xr.isSessionSupported(mode);
  } catch {
    return false;
  }
}

/** The dev-only orbit preview. Not a product feature — it exists so
 *  the scene can be authored and verified without a headset. */
export function isPreviewRequested() {
  return new URLSearchParams(location.search).get("preview") === "1";
}

/** On-device state readout, for diagnosing a session on a phone
 *  where the console is not reachable without a USB cable. */
export function isDebugRequested() {
  return new URLSearchParams(location.search).get("debug") === "1";
}

/** Whether to advertise the preview on the entry screen. It stays
 *  reachable by URL anywhere, but the published page is XR-only and
 *  should not offer a second-class desktop path — non-XR visitors
 *  belong on the 2D portfolio. */
export function isLocalDev() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
}
