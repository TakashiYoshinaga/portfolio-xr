/* =========================================================
   AtlasMedia — the one texture every thumbnail samples.

   Progressive: the still atlas loads first and is always the floor,
   then the video atlas upgrades it if it decodes. The same object is
   handed to every slab, so upgrading is a single assignment rather
   than 30.

   Both textures use identical sampling settings — no mipmaps, linear
   filtering — so the one-texel inset baked into tileUV() behaves the
   same either way and a swap never shifts the image.
   ========================================================= */

import * as THREE from "three";
import { TEX } from "../core/Theme.js";

const POSTER_URL = "./media/poster/posters.jpg";
const VIDEO_URL = "./media/video/atlas.mp4";

/** VideoTexture forces these; matching them on the still keeps the
 *  two interchangeable. */
function matchVideoSampling(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
}

function loadPoster() {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      POSTER_URL,
      (texture) => {
        matchVideoSampling(texture);
        resolve(texture);
      },
      undefined,
      () => resolve(null)
    );
  });
}

export async function createAtlasMedia({ onTexture } = {}) {
  const poster = await loadPoster();

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true; // muted playback never needs user activation
  video.loop = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.disableRemotePlayback = true;
  video.setAttribute("aria-hidden", "true");
  video.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(video);

  let videoTexture = null;
  let active = poster;
  let state = poster ? "poster" : "empty";
  let watchdog = null;
  // Diagnostics for the frozen-texture case, which looks exactly like
  // stopped playback from the outside.
  let lastUploadTime = -1;
  let uploads = 0;
  let rvfcCount = 0;

  function publish(texture, nextState) {
    active = texture;
    state = nextState;
    onTexture?.(texture, nextState);
  }

  /**
   * Try to start playback, and keep trying if the browser says no.
   *
   * Muted playback needs no user activation, but it can still be
   * refused — a backgrounded tab defers it, and headsets can be slow
   * to hand over a decoder. Retrying on visibility and on the next
   * interaction is the difference between a live gallery and one
   * permanently stuck on stills for a reason that has since passed.
   */
  let retryArmed = false;
  async function attemptPlay() {
    try {
      await video.play();
      return true;
    } catch {
      armRetry();
      return false;
    }
  }

  function armRetry() {
    if (retryArmed) return;
    retryArmed = true;
    const retry = () => {
      video.play().then(
        () => {
          retryArmed = false;
          document.removeEventListener("visibilitychange", onVisible);
          window.removeEventListener("pointerdown", retry);
        },
        () => {}
      );
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retry();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", retry, { passive: true });
  }

  return {
    get texture() {
      return active;
    },
    get state() {
      return state;
    },
    get element() {
      return video;
    },

    /** Call inside the entry click, while user activation is live.
     *  Muted playback would not strictly need it, but priming costs
     *  nothing and removes one variable from a fragile area. */
    async prime() {
      try {
        video.src = VIDEO_URL;
        await video.play();
        video.pause();
        video.currentTime = 0;
        return true;
      } catch {
        return false;
      }
    },

    /** Start the atlas decoding and swap the texture once frames are
     *  actually arriving. Never rejects: if the video will not play,
     *  the gallery simply stays on stills. */
    async start() {
      if (!video.src) video.src = VIDEO_URL;

      // Load before playing. Calling play() on a video that has not
      // buffered anything races the load and can reject, which would
      // strand the gallery on stills even though the file was fine.
      await new Promise((resolve) => {
        if (video.readyState >= 2) return resolve();
        const done = () => {
          video.removeEventListener("loadeddata", done);
          video.removeEventListener("error", done);
          resolve();
        };
        video.addEventListener("loadeddata", done, { once: true });
        video.addEventListener("error", done, { once: true });
        setTimeout(done, 8000);
      });

      if (video.readyState < 2 || video.videoWidth === 0) return state;

      if (video.videoWidth !== TEX.atlas.width || video.videoHeight !== TEX.atlas.height) {
        console.warn(
          `[atlas] ${video.videoWidth}x${video.videoHeight} does not match ` +
            `TEX.atlas ${TEX.atlas.width}x${TEX.atlas.height} — tiles will be misaligned. ` +
            `Re-run tools/encode.sh or fix Theme.js.`
        );
      }

      // Publish on the 'playing' event rather than after play()
      // resolves, so the texture swaps exactly when frames start
      // arriving — whether that is now or after a later retry.
      video.addEventListener("playing", () => {
        if (!videoTexture) {
          videoTexture = new THREE.VideoTexture(video);
          matchVideoSampling(videoTexture);
        }
        if (state !== "video") publish(videoTexture, "video");
      });

      // A decoder can be lost mid-session (backgrounding, thermal
      // throttling). Fall back rather than showing black quads.
      video.addEventListener("error", () => {
        if (poster) publish(poster, "poster");
      });

      // Insurance for the whole "should be playing, isn't" class —
      // a platform where the loop attribute does not re-arm, or a
      // power saver that suspends the element behind our back. Both
      // look identical to the user: the thumbnails just stop.
      video.addEventListener("ended", () => {
        video.currentTime = 0;
        attemptPlay();
      });

      // Our own rVFC counter, independent of the one three.js installs.
      // If this stops climbing while currentTime keeps moving, the
      // texture is frozen rather than the video stopped.
      if ("requestVideoFrameCallback" in video) {
        const count = () => {
          rvfcCount++;
          video.requestVideoFrameCallback(count);
        };
        video.requestVideoFrameCallback(count);
      }

      if (!watchdog) {
        // Nothing in the app ever pauses this deliberately any more,
        // so the invariant is simply: it should be playing. If it is
        // not, whatever stopped it was not us.
        watchdog = setInterval(() => {
          if (state !== "video") return;
          if (video.paused || video.ended) attemptPlay();
        }, 2000);
      }

      await attemptPlay();
      return state;
    },

    /**
     * Upload a frame if the video has advanced. Call once per render.
     *
     * three.js's VideoTexture drives needsUpdate purely from
     * requestVideoFrameCallback whenever the browser has it, and its
     * update() is a no-op in that case. rVFC fires when a frame is
     * presented for composition — which an invisible 1x1 element
     * inside an immersive session may never be. When that happens the
     * texture freezes on its last frame while the video plays on, and
     * from the outside it is indistinguishable from playback stopping.
     *
     * Comparing currentTime costs nothing and uploads exactly once per
     * new frame, so this is no more work than rVFC would have done.
     */
    tick() {
      if (state !== "video" || !videoTexture) return false;
      if (video.readyState < 2 || video.currentTime === lastUploadTime) return false;
      lastUploadTime = video.currentTime;
      videoTexture.needsUpdate = true;
      uploads++;
      return true;
    },

    /** Snapshot for the on-device debug panel. */
    get stats() {
      return {
        state,
        paused: video.paused,
        ended: video.ended,
        currentTime: video.currentTime,
        duration: video.duration || 0,
        readyState: video.readyState,
        uploads,
        rvfcCount,
      };
    },



    dispose() {
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      videoTexture?.dispose();
      poster?.dispose();
    },
  };
}
