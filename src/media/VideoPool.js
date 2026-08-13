/* =========================================================
   VideoPool — the hero clips, and the decoder budget.

   Two rules drive every decision here.

   1. Cap concurrent decoders hard. Meta's own guidance for Quest
      Browser is to play one video at a time, and Chromium on Android
      ships no software video decode — so exceeding the MediaCodec
      ceiling is not a slowdown, it is a black rectangle. With the
      sprite atlas animating every thumbnail on one decoder, a cap of
      one hero costs the gallery nothing.

   2. pause() does not free a decoder. Only detaching the source and
      calling load() does. And elements must be pooled, never created
      per item: churned elements hold their decoders until GC, which
      is how a session drifts into the ceiling after a few minutes of
      browsing rather than failing immediately.
   ========================================================= */

const PRIME_URL = "./media/video/prime.mp4";
const heroUrl = (key) => `./media/video/${key}.mp4`;

function releaseDecoder(el) {
  el.pause();
  el.removeAttribute("src");
  el.load(); // aborts resource selection — this is what frees it
}

function makeElement() {
  const el = document.createElement("video");
  el.playsInline = true;
  el.loop = true;
  el.preload = "none";
  el.crossOrigin = "anonymous";
  el.muted = true;
  el.disableRemotePlayback = true;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.appendChild(el);
  return el;
}

/**
 * @param {number} size how many hero videos may decode at once.
 *        1 in an XR session, 2 on desktop where there is headroom.
 */
export function createVideoPool(size = 1) {
  const slots = Array.from({ length: size }, () => ({
    el: makeElement(),
    key: null,
    lastUsed: 0,
  }));

  let clock = 0;

  function slotFor(key) {
    return slots.find((s) => s.key === key) ?? null;
  }

  function evictable() {
    return slots.reduce((oldest, s) =>
      s.key === null ? s : oldest.key === null ? oldest : s.lastUsed < oldest.lastUsed ? s : oldest
    );
  }

  return {
    /**
     * Unlock autoplay on every pooled element.
     *
     * This MUST run inside the entry click handler, before
     * requestSession. On Quest the session request can resolve
     * seconds later behind a spatial-data consent dialog, and user
     * activation is long gone by then — a hero opened 40 seconds into
     * a session would never get audio. Playing and immediately
     * pausing a 2 KB stub is the pattern the immersive-web samples
     * themselves use.
     */
    async prime() {
      const results = await Promise.all(
        slots.map(async (slot) => {
          try {
            slot.el.src = PRIME_URL;
            await slot.el.play();
            slot.el.pause();
            return true;
          } catch {
            return false;
          } finally {
            releaseDecoder(slot.el);
            slot.key = null;
          }
        })
      );
      return results.some(Boolean);
    },

    /**
     * Get a playing element for `key`, evicting the least recently
     * used slot if the pool is full.
     * @returns {Promise<{el:HTMLVideoElement, ok:boolean, reason?:string}>}
     */
    async acquire(key, { muted = false, onError } = {}) {
      clock += 1;

      const existing = slotFor(key);
      if (existing) {
        existing.lastUsed = clock;
        existing.el.muted = muted;
        try {
          await existing.el.play();
        } catch {
          /* already playing, or blocked — the caller sees the state */
        }
        return { el: existing.el, ok: true };
      }

      const slot = evictable();
      if (slot.key !== null) releaseDecoder(slot.el);

      slot.key = key;
      slot.lastUsed = clock;
      slot.el.muted = muted;
      slot.el.src = heroUrl(key);
      slot.el.load();

      const ready = await new Promise((resolve) => {
        let settled = false;
        const finish = (ok, reason) => {
          if (settled) return;
          settled = true;
          slot.el.removeEventListener("loadeddata", onData);
          slot.el.removeEventListener("error", onFail);
          slot.el.removeEventListener("stalled", onFail);
          resolve({ ok, reason });
        };
        const onData = () => finish(true);
        const onFail = () => finish(false, "decode");
        slot.el.addEventListener("loadeddata", onData, { once: true });
        slot.el.addEventListener("error", onFail, { once: true });
        slot.el.addEventListener("stalled", onFail, { once: true });
        setTimeout(() => finish(false, "timeout"), 8000);
      });

      if (!ready.ok) {
        onError?.(ready.reason);
        releaseDecoder(slot.el);
        slot.key = null;
        return { el: null, ok: false, reason: ready.reason };
      }

      try {
        await slot.el.play();
      } catch (err) {
        // Unmuted playback rejected: the priming did not survive, or
        // never happened. Retry muted so the visual still works, and
        // let the caller offer an explicit unmute.
        if (!muted) {
          slot.el.muted = true;
          try {
            await slot.el.play();
            return { el: slot.el, ok: true, reason: "muted-fallback" };
          } catch {
            /* fall through */
          }
        }
        onError?.("autoplay");
        return { el: slot.el, ok: false, reason: "autoplay" };
      }

      return { el: slot.el, ok: true };
    },

    /** Free a key's decoder outright. Panels always release rather
     *  than pause: with a ceiling of one hero, holding a decoder for a
     *  clip nobody is looking at is the whole budget. */
    release(key) {
      const slot = slotFor(key);
      if (!slot) return;
      releaseDecoder(slot.el);
      slot.key = null;
    },

    releaseAll() {
      for (const slot of slots) {
        releaseDecoder(slot.el);
        slot.key = null;
      }
    },

    dispose() {
      for (const slot of slots) {
        releaseDecoder(slot.el);
        slot.el.remove();
      }
      slots.length = 0;
    },
  };
}
