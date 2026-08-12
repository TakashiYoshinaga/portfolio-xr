/* =========================================================
   DetailPanel — the focused item.

   One panel exists for the whole session and is repainted when the
   focus changes, rather than one canvas per card. At this panel's
   resolution the per-card approach would cost ~270 MB of texture
   memory for a gallery you can only look at one item of at a time.

   The hero quad starts on the item's own tile from the poster atlas
   and only switches to full-frame video UVs once the clip is
   decoding. That means opening an item never shows a black rectangle
   while five megabytes arrive — and if the decode never succeeds, the
   still simply stays.
   ========================================================= */

import * as THREE from "three";
import { COLOR, LAYOUT, TEX } from "../core/Theme.js";
import { paintPanel, panelTexture } from "./TextPainter.js";
import { tileUV } from "../../data/atlas.js";

const LERP = 9;
const FULL_UV = { u0: 0, u1: 1, v0: 0, v1: 1 };

function setQuadUV(geometry, { u0, u1, v0, v1 }) {
  const uv = geometry.attributes.uv;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

export function createDetailPanel({ heroPool, atlas, backChip }) {
  const { focus } = LAYOUT;

  const group = new THREE.Group();
  group.name = "detail-panel";
  group.visible = false;

  /* --- painted panel ------------------------------------- */
  const panelMaterial = new THREE.MeshBasicMaterial({
    map: panelTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(focus.panelWidth, focus.panelHeight),
    panelMaterial
  );
  panel.renderOrder = 20;
  group.add(panel);

  /* --- hero media ---------------------------------------- */
  const heroMaterial = new THREE.MeshBasicMaterial({
    map: atlas.texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const hero = new THREE.Mesh(
    new THREE.PlaneGeometry(focus.heroWidth, focus.heroHeight),
    heroMaterial
  );
  hero.position.set(
    0,
    focus.panelHeight / 2 - focus.pad - focus.heroHeight / 2,
    0.004
  );
  hero.renderOrder = 21;
  group.add(hero);

  /* One VideoTexture per pooled element, cached: the pool reuses its
     elements, so recreating a texture per open would leak GPU objects
     for no benefit. */
  const videoTextures = new WeakMap();
  function textureFor(el) {
    let texture = videoTextures.get(el);
    if (!texture) {
      texture = new THREE.VideoTexture(el);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      videoTextures.set(el, texture);
    }
    return texture;
  }

  /* --- picking: the whole panel dismisses on select ------- */
  const hitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(focus.panelWidth, focus.panelHeight),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitArea.position.z = 0.01;
  hitArea.userData.pickable = false;
  group.add(hitArea);

  /* --- explicit back control -------------------------------
     Selecting anywhere already dismisses, which is fast once you know
     it. A labelled target makes that discoverable instead of
     something you have to guess at. Parented to the panel so it flies
     and fades with it rather than being animated separately. */
  if (backChip) {
    backChip.seat(
      {
        position: new THREE.Vector3(
          0,
          -focus.panelHeight / 2 - focus.pad - 0.03,
          0.01
        ),
        rotation: new THREE.Euler(0, 0, 0),
      },
      true
    );
    backChip.object3d.renderOrder = 22;
    group.add(backChip.object3d);
  }

  let current = null;
  let opacity = 0;
  let targetOpacity = 0;
  const targetPosition = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const targetScale = { value: 1 };

  function showPoster(key) {
    heroMaterial.map = atlas.texture;
    heroMaterial.needsUpdate = true;
    const index = tileIndexFor(key);
    setQuadUV(
      hero.geometry,
      index == null
        ? FULL_UV
        : tileUV(index, TEX.atlas.width, TEX.atlas.height)
    );
  }

  let tileLookup = null;
  function tileIndexFor(key) {
    return tileLookup?.get(key) ?? null;
  }

  return {
    object3d: group,

    get isOpen() {
      return current !== null;
    },

    get currentKey() {
      return current?.key ?? null;
    },

    /** The panel body and the back control. Both dismiss; the body is
     *  the shortcut, the chip is the signpost. */
    get pickables() {
      return backChip ? [hitArea, backChip.pickable] : [hitArea];
    },

    setTileLookup(map) {
      tileLookup = map;
    },

    /**
     * @param {{key:string, eyebrow?:string, title:string,
     *          subtitle?:string, body:string, footer?:string}} item
     * @param {{position:THREE.Vector3, rotation:THREE.Euler}} slot
     * @param {THREE.Vector3} from where it should appear to fly from
     */
    async open(item, slot, from) {
      current = item;

      paintPanel(item, {
        heroHeightRatio: (LAYOUT.focus.pad + LAYOUT.focus.heroHeight) / LAYOUT.focus.panelHeight,
      });
      panelMaterial.map = panelTexture();
      panelMaterial.needsUpdate = true;

      showPoster(item.key);

      // Start small at the slab's position so it reads as the card
      // opening rather than a panel appearing.
      group.position.copy(from);
      group.quaternion.setFromEuler(slot.rotation);
      group.scale.setScalar(0.35);
      group.visible = true;
      hitArea.userData.pickable = true;
      backChip?.setVisible(true);
      backChip?.setOpacity(0, true);

      targetPosition.copy(slot.position);
      targetQuaternion.setFromEuler(slot.rotation);
      targetScale.value = 1;
      targetOpacity = 1;

      if (!item.hasVideo) return { ok: true, reason: "still-only" };

      // Unmuted: the pool primed during the entry gesture, and falls
      // back to muted playback on its own if that did not survive.
      const result = await heroPool.acquire(item.key, { muted: false });
      if (current !== item) {
        // Focus moved on while the clip was loading.
        heroPool.release(item.key);
        return { ok: false, reason: "superseded" };
      }
      if (!result.ok || !result.el) {
        return { ok: false, reason: result.reason ?? "unavailable" };
      }

      heroMaterial.map = textureFor(result.el);
      heroMaterial.needsUpdate = true;
      setQuadUV(hero.geometry, FULL_UV);
      return { ok: true, muted: result.el.muted, reason: result.reason };
    },

    /** Turn audio on after a muted fallback. Selecting inside an XR
     *  session grants user activation, so this can succeed where the
     *  original attempt did not. */
    unmute() {
      if (!current) return false;
      const el = heroMaterial.map?.image;
      if (!el || !el.muted) return false;
      el.muted = false;
      el.play().catch(() => {
        el.muted = true;
      });
      return true;
    },

    close() {
      if (!current) return;
      heroPool.release(current.key);
      current = null;
      targetOpacity = 0;
      targetScale.value = 0.4;
      hitArea.userData.pickable = false;
      backChip?.setVisible(false);
    },

    update(dt) {
      if (!group.visible) return;
      const k = 1 - Math.exp(-LERP * dt);

      if (current) {
        group.position.lerp(targetPosition, k);
        group.quaternion.slerp(targetQuaternion, k);
      }
      const s = group.scale.x + (targetScale.value - group.scale.x) * k;
      group.scale.setScalar(s);

      opacity += (targetOpacity - opacity) * k;
      panelMaterial.opacity = opacity;
      heroMaterial.opacity = opacity;

      if (backChip) {
        backChip.setOpacity(current ? opacity : 0);
        backChip.update(dt);
      }

      if (!current && opacity < 0.01) {
        group.visible = false;
        // Drop back to the atlas so the next open does not flash the
        // previous item's last video frame.
        heroMaterial.map = atlas.texture;
        heroMaterial.needsUpdate = true;
      }
    },

    dispose() {
      panel.geometry.dispose();
      hero.geometry.dispose();
      hitArea.geometry.dispose();
      panelMaterial.dispose();
      heroMaterial.dispose();
      hitArea.material.dispose();
      backChip?.dispose();
    },
  };
}
