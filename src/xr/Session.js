/* =========================================================
   Session — requesting an XR session in a way that works on both
   Quest 3 and an ARCore phone.

   Two ladders live here, and both matter:
     1. requestSession: ask hard for local-floor, then settle.
     2. reference space: probe local-floor -> local -> viewer, and
        tell three.js the answer BEFORE setSession (it throws if the
        configured type turns out to be unavailable).

   All of the Quest/Android divergence is contained in this file.
   ========================================================= */

const OPTIONAL = [
  "hand-tracking", // Quest
  "local-floor",
  "bounded-floor",
  "anchors",
  "layers",
  "dom-overlay", // Android in practice; Quest ignores it (see below)
];

/**
 * @param {'immersive-ar'|'immersive-vr'} mode
 * @param {HTMLElement} overlayRoot
 */
export async function request(mode, overlayRoot) {
  const base = {
    optionalFeatures: OPTIONAL,
    domOverlay: { root: overlayRoot },
  };

  try {
    // Floor-relative content is much nicer, so ask for it properly.
    return await navigator.xr.requestSession(mode, {
      requiredFeatures: ["local-floor"],
      ...base,
    });
  } catch {
    // Take whatever we can get rather than failing the whole entry.
    return await navigator.xr.requestSession(mode, {
      requiredFeatures: [],
      ...base,
    });
  }
}

/**
 * Find the best reference space this session will actually give us.
 * Requesting one twice is legal and cheap, so we throw the probe
 * result away and let three.js make its own.
 * @returns {Promise<'local-floor'|'local'|'viewer'>}
 */
export async function pickReferenceSpace(session) {
  for (const type of ["local-floor", "local", "viewer"]) {
    try {
      await session.requestReferenceSpace(type);
      return type;
    } catch {
      /* try the next one down */
    }
  }
  throw new Error("No usable reference space");
}

/** dom-overlay is granted on Android but not on Quest hardware —
 *  it works in Meta's emulator, which makes this easy to get wrong.
 *  Everything shown during a session must exist in 3D; the overlay
 *  is a bonus, never a dependency. */
export function hasDomOverlay(session) {
  return Boolean(session.domOverlayState?.type);
}

/** Turn the raw rejections into something a human can act on. */
export function explainSessionError(err, mode) {
  const name = err?.name || "";
  const msg = String(err?.message || err || "");

  if (name === "NotSupportedError") {
    return mode === "immersive-ar"
      ? "This browser reported AR support but could not start a session. On Android, check that Google Play Services for AR (ARCore) is installed and up to date."
      : "This browser could not start an immersive session.";
  }
  if (name === "SecurityError" || /permission|consent|denied/i.test(msg)) {
    return "Permission was declined. On Quest, the headset asks to share spatial data the first time — that has to be allowed for passthrough to work.";
  }
  if (name === "InvalidStateError") {
    return "A session is already running. Close it and try again.";
  }
  return msg || "The immersive session could not be started.";
}
