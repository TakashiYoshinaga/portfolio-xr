/* =========================================================
   EntryScreen — the door.

   Two jobs, and the second one is load-bearing:
     1. Route by capability (ar / vr / none / insecure).
     2. Own the single user gesture. requestSession() can resolve
        seconds after the click (Quest interposes a spatial-data
        consent dialog), by which time user activation is gone —
        so any media that will ever need to play must be primed
        inside the handler, BEFORE the session is requested.
   ========================================================= */

import { URLS } from "../core/Theme.js";

const REQUIREMENT =
  "Immersive mode needs Meta Quest Browser or Android Chrome with ARCore. " +
  "iPhone and desktop browsers do not support WebXR.";

export function createEntryScreen({ onEnter }) {
  const root = document.getElementById("entry");
  const cta = document.getElementById("entry-cta");
  const note = document.getElementById("entry-note");
  const status = document.getElementById("entry-status");
  const lede = document.getElementById("entry-lede");

  let busy = false;

  function setStatus(text, isError = false) {
    status.textContent = text || "";
    status.classList.toggle("entry__status--error", Boolean(isError));
  }

  function markDevice(id, ok) {
    document.getElementById(id)?.setAttribute("data-ok", ok ? "yes" : "no");
  }

  function button(label, { primary = true, onClick }) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `btn ${primary ? "btn--primary" : "btn--ghost"}`;
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  function link(label, href) {
    const el = document.createElement("a");
    el.className = "btn btn--ghost";
    el.href = href;
    el.textContent = label;
    return el;
  }

  /** The gesture handler. Everything that must survive the wait for
   *  requestSession() has to happen synchronously-ish in here. */
  function enterHandler(mode, btn) {
    return async () => {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      setStatus("Preparing…");
      try {
        await onEnter(mode, setStatus);
        // Success: the session took over and hid this screen.
      } catch (err) {
        setStatus(err?.message || String(err), true);
        btn.disabled = false;
      } finally {
        busy = false;
      }
    };
  }

  return {
    /** @param {{mode:'ar'|'vr'|'none'|'insecure'}} caps */
    render(caps, { previewAvailable }) {
      cta.replaceChildren();
      note.replaceChildren();
      setStatus("");

      markDevice("dev-quest", caps.mode === "ar" || caps.mode === "vr");
      markDevice("dev-android", caps.mode === "ar");

      if (caps.mode === "insecure") {
        note.textContent =
          "WebXR requires a secure connection. Open this page over https.";
        cta.append(link("Open over HTTPS", location.href.replace(/^http:/, "https:")));
        return;
      }

      if (caps.mode === "none") {
        lede.textContent =
          "This is the spatial edition of my portfolio. It runs in the headset — or in your hand — rather than in a page.";
        note.textContent = REQUIREMENT;
        cta.append(link("Open the main portfolio", URLS.site));
        if (previewAvailable) {
          cta.append(link("Developer preview", "?preview=1"));
        }
        return;
      }

      const label = caps.mode === "ar" ? "Enter AR" : "Enter VR";
      const btn = button(label, { primary: true, onClick: null });
      btn.addEventListener(
        "click",
        enterHandler(caps.mode === "ar" ? "immersive-ar" : "immersive-vr", btn)
      );
      cta.append(btn, link("Main portfolio", URLS.site));

      note.textContent =
        caps.mode === "ar"
          ? "Put the headset on, or hold your phone up — the gallery appears in front of you. No setup, no tapping to place."
          : "AR passthrough is not available here, so the gallery opens in VR.";
    },

    hide() {
      root.hidden = true;
      document.getElementById("bg-fx")?.setAttribute("hidden", "");
    },

    show() {
      root.hidden = false;
      document.getElementById("bg-fx")?.removeAttribute("hidden");
    },

    setStatus,
  };
}
