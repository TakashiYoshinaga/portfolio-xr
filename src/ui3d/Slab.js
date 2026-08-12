/* =========================================================
   Slab — one card in the gallery.

   Three quads stacked front to back:
     chrome  the glass panel (one shared texture per aspect ratio)
     media   the video, sampling one tile of the sprite atlas
     label   the title and tags, sampling one strip of the label atlas

   Note on draw calls: these are individual meshes rather than one
   merged buffer. 25 slabs is ~75 draw calls, comfortably inside
   Quest 3's budget, and it buys per-slab transforms and opacity for
   free — which the focus and dim states need every frame. Merging
   only starts to pay at hundreds of cards.

   Transparent overdraw is the real cost on a headset, so the three
   quads deliberately do not overlap: media occupies the upper band,
   label the lower, and only the chrome sits behind both.
   ========================================================= */

import * as THREE from "three";
import { COLOR, TEX } from "../core/Theme.js";
import { tileUV } from "../../data/atlas.js";

const HOVER_SCALE = 1.06;
const HOVER_LIFT = 0.025;
const LERP = 8; // per-second approach rate for the eased transitions

/** Rewrite a plane's UVs to sample one tile of an atlas.
 *  PlaneGeometry vertex order is TL, TR, BL, BR. */
function setQuadUV(geometry, { u0, u1, v0, v1 }) {
  const uv = geometry.attributes.uv;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

/** Label atlas rects. Unlike the video atlas this needs no texel
 *  inset — CanvasTexture keeps mipmaps, and the strips are painted
 *  with their own internal padding. */
function labelUV(index) {
  const { cols, rows } = TEX.label;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    u0: col / cols,
    u1: (col + 1) / cols,
    v0: 1 - (row + 1) / rows,
    v1: 1 - row / rows,
  };
}

function quad(width, height, material, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.z = z;
  return mesh;
}

export class Slab {
  constructor({
    key,
    kind,
    data,
    metrics,
    tileIndex = null,
    labelIndex = null,
    mediaTexture = null,
    labelTexture = null,
    chromeTexture = null,
  }) {
    this.key = key;
    this.kind = kind;
    this.data = data ?? null;
    this.tileIndex = tileIndex;
    this.labelIndex = labelIndex;
    this.metrics = metrics;

    const { width, height, mediaWidth, mediaHeight, labelWidth, labelHeight, inset, gap } =
      metrics;

    this.group = new THREE.Group();
    this.group.name = `slab:${key}`;
    this.width = width;
    this.height = height;

    this.materials = [];

    /* --- chrome ------------------------------------------ */
    this.chromeMaterial = new THREE.MeshBasicMaterial({
      map: chromeTexture,
      color: chromeTexture ? 0xffffff : new THREE.Color(COLOR.bg2),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.chrome = quad(width, height, this.chromeMaterial, 0);
    this.chrome.renderOrder = 1;
    this.group.add(this.chrome);
    this.materials.push(this.chromeMaterial);

    /* --- media ------------------------------------------- */
    this.mediaMaterial = new THREE.MeshBasicMaterial({
      map: mediaTexture,
      color: mediaTexture ? 0xffffff : new THREE.Color(COLOR.bg0),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.media = quad(mediaWidth, mediaHeight, this.mediaMaterial, 0.003);
    this.media.position.y = height / 2 - inset - mediaHeight / 2;
    this.media.renderOrder = 2;
    if (mediaTexture && tileIndex != null) {
      setQuadUV(
        this.media.geometry,
        tileUV(tileIndex, TEX.atlas.width, TEX.atlas.height)
      );
    }
    this.group.add(this.media);
    this.materials.push(this.mediaMaterial);

    /* --- label ------------------------------------------- */
    this.labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      visible: Boolean(labelTexture),
    });
    this.label = quad(labelWidth, labelHeight, this.labelMaterial, 0.003);
    this.label.position.y =
      height / 2 - inset - mediaHeight - gap - labelHeight / 2;
    this.label.renderOrder = 3;
    if (labelTexture && labelIndex != null) {
      setQuadUV(this.label.geometry, labelUV(labelIndex));
    }
    this.group.add(this.label);
    this.materials.push(this.labelMaterial);

    /* --- highlight ring, shown on hover ------------------ */
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLOR.accent),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    this.glow = quad(width * 1.045, height * 1.05, this.glowMaterial, -0.002);
    this.glow.renderOrder = 0;
    this.group.add(this.glow);

    /* --- picking ----------------------------------------- */
    // One invisible quad covering the slab, so a raycast never has to
    // reason about three overlapping meshes.
    this.hitArea = quad(
      width,
      height,
      new THREE.MeshBasicMaterial({ visible: false }),
      0.008
    );
    this.hitArea.userData.slab = this;
    this.hitArea.userData.pickable = true;
    this.group.add(this.hitArea);

    /* --- animation state --------------------------------- */
    this.homePosition = new THREE.Vector3();
    this.homeQuaternion = new THREE.Quaternion();
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.targetOpacity = 1;
    this.opacity = 1;
    this.baseScale = 1;
    this.hovered = false;
    this.visible = true;
  }

  /** Park the slab in a layout slot and treat that as its home.
   *  A slot may carry a scale — corridor bays grow with distance so
   *  each subtends roughly the same angle. */
  seat({ position, rotation, scale = 1 }, immediate = false) {
    this.homePosition.copy(position);
    this.homeQuaternion.setFromEuler(rotation);
    this.targetPosition.copy(position);
    this.targetQuaternion.copy(this.homeQuaternion);
    this.baseScale = scale;
    if (immediate) {
      this.group.position.copy(position);
      this.group.quaternion.copy(this.homeQuaternion);
      this.group.scale.setScalar(scale);
    }
    return this;
  }

  /** Send the slab somewhere other than home (focus, corridor, …). */
  moveTo(position, quaternion) {
    this.targetPosition.copy(position);
    this.targetQuaternion.copy(quaternion);
  }

  returnHome() {
    this.targetPosition.copy(this.homePosition);
    this.targetQuaternion.copy(this.homeQuaternion);
  }

  setHovered(on) {
    this.hovered = on;
  }

  /** `immediate` snaps rather than eases. Needed on the first layout:
   *  opacity starts at 1, so without it every hidden slab renders for
   *  half a second before fading out — a visible flash of the whole
   *  prototype set on arrival. */
  setOpacity(value, immediate = false) {
    this.targetOpacity = value;
    if (immediate) this.opacity = value;
  }

  setVisible(on) {
    this.visible = on;
    if (!on) this.targetOpacity = 0;
  }

  /** Swap in the real video atlas once it is decoding. */
  setMediaTexture(texture) {
    this.mediaMaterial.map = texture;
    this.mediaMaterial.color.set(0xffffff);
    this.mediaMaterial.needsUpdate = true;
    if (this.tileIndex != null) {
      setQuadUV(
        this.media.geometry,
        tileUV(this.tileIndex, TEX.atlas.width, TEX.atlas.height)
      );
    }
  }

  get object3d() {
    return this.group;
  }

  get pickable() {
    return this.hitArea;
  }

  update(dt) {
    const k = 1 - Math.exp(-LERP * dt);

    this.group.position.lerp(this.targetPosition, k);
    this.group.quaternion.slerp(this.targetQuaternion, k);

    const wantScale = this.baseScale * (this.hovered ? HOVER_SCALE : 1);
    const s = this.group.scale.x + (wantScale - this.group.scale.x) * k;
    this.group.scale.setScalar(s);

    // Hovering nudges the slab toward the viewer along its own normal.
    if (this.hovered) {
      const lift = new THREE.Vector3(0, 0, HOVER_LIFT).applyQuaternion(
        this.group.quaternion
      );
      this.group.position.add(lift.multiplyScalar(k));
    }

    this.opacity += (this.targetOpacity - this.opacity) * k;
    for (const material of this.materials) material.opacity = this.opacity;

    const glowTarget = this.hovered ? 0.5 : 0;
    this.glowMaterial.opacity +=
      (glowTarget * this.opacity - this.glowMaterial.opacity) * k;
    // A fully transparent quad still costs a draw call and, worse,
    // still shades every pixel it covers. With 27 slabs on screen
    // that is a quarter of the frame's draw calls spent on nothing.
    this.glow.visible = this.glowMaterial.opacity > 0.01;

    this.group.visible = this.opacity > 0.01;
    this.hitArea.userData.pickable = this.visible && this.opacity > 0.35;
  }

  dispose() {
    for (const mesh of [this.chrome, this.media, this.label, this.glow, this.hitArea]) {
      mesh.geometry.dispose();
    }
    for (const material of [...this.materials, this.glowMaterial, this.hitArea.material]) {
      material.dispose();
    }
  }
}
