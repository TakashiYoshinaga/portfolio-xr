/* =========================================================
   Slab — one card in the gallery.

   A slab is a small group: a glass frame (label atlas texture) with
   a media quad in front of it (sprite-atlas video texture). Both
   quads bake their atlas UVs into their own geometry, so every slab
   shares the same two textures.

   Note on draw calls: these are individual meshes rather than one
   merged buffer. 22-30 slabs means ~60 draw calls, comfortably
   inside Quest 3's budget, and it buys per-slab transforms and
   opacity for free — which the focus and dim states need on every
   frame. Merging only starts to pay at hundreds of cards.
   ========================================================= */

import * as THREE from "three";
import { COLOR } from "../core/Theme.js";
import { tileUV } from "../../data/atlas.js";

const HOVER_SCALE = 1.06;
const HOVER_LIFT = 0.02;
const LERP = 8; // per-second approach rate for the eased transitions

/** Rewrite a plane's UV attribute to sample one atlas tile. */
function applyTileUV(geometry, index, atlasW, atlasH) {
  const { u0, u1, v0, v1 } = tileUV(index, atlasW, atlasH);
  const uv = geometry.attributes.uv;
  // PlaneGeometry vertex order: TL, TR, BL, BR
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

/** Same idea for the label atlas, which is a plain grid of strips. */
function applyLabelUV(geometry, index, cols, rows) {
  const col = index % cols;
  const row = Math.floor(index / cols);
  const u0 = col / cols;
  const u1 = (col + 1) / cols;
  // CanvasTexture is not flipped the way VideoTexture is, but three
  // flips canvas textures on upload, so rows still count from the top.
  const v0 = 1 - (row + 1) / rows;
  const v1 = 1 - row / rows;
  const uv = geometry.attributes.uv;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

export class Slab {
  /**
   * @param {object} opts
   * @param {string} opts.key            atlas key (YouTube id or 'chuo-univ')
   * @param {'research'|'hobby'|'project'|'ui'} opts.kind
   * @param {number} opts.tileIndex      slot in the sprite atlas
   * @param {number} opts.labelIndex     slot in the label atlas
   * @param {THREE.Texture} opts.mediaTexture
   * @param {THREE.Texture} opts.labelTexture
   * @param {{width:number,height:number}} opts.atlasSize
   * @param {{cols:number,rows:number}} opts.labelGrid
   */
  constructor(opts) {
    const {
      key,
      kind,
      tileIndex,
      labelIndex,
      mediaTexture,
      labelTexture,
      atlasSize,
      labelGrid,
      width,
      height,
      mediaWidth,
      mediaHeight,
      data,
    } = opts;

    this.key = key;
    this.kind = kind;
    this.data = data ?? null;
    this.tileIndex = tileIndex;
    this.labelIndex = labelIndex;

    this.group = new THREE.Group();
    this.group.name = `slab:${key}`;

    // --- frame / label ---
    const frameGeo = new THREE.PlaneGeometry(width, height);
    if (labelTexture && labelIndex != null) {
      applyLabelUV(frameGeo, labelIndex, labelGrid.cols, labelGrid.rows);
    }
    this.frameMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture ?? null,
      color: labelTexture ? 0xffffff : new THREE.Color(COLOR.bg2),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    this.frame = new THREE.Mesh(frameGeo, this.frameMaterial);
    this.frame.renderOrder = 1;
    this.group.add(this.frame);

    // --- media quad, sitting just proud of the frame ---
    const mw = mediaWidth ?? width * 0.94;
    const mh = mediaHeight ?? mw * (9 / 16);
    const mediaGeo = new THREE.PlaneGeometry(mw, mh);
    if (mediaTexture && tileIndex != null) {
      applyTileUV(mediaGeo, tileIndex, atlasSize.width, atlasSize.height);
    }
    this.mediaMaterial = new THREE.MeshBasicMaterial({
      map: mediaTexture ?? null,
      color: mediaTexture ? 0xffffff : new THREE.Color(COLOR.bg1),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      toneMapped: false,
    });
    this.media = new THREE.Mesh(mediaGeo, this.mediaMaterial);
    // Media sits above the label strip, which occupies the lower band.
    this.media.position.set(0, (height - mh) / 2 - height * 0.045, 0.004);
    this.media.renderOrder = 2;
    this.group.add(this.media);

    // Picking target: one invisible quad covering the whole slab, so
    // the raycast does not have to consider two overlapping meshes.
    this.hitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitArea.position.z = 0.006;
    this.hitArea.userData.slab = this;
    this.group.add(this.hitArea);

    this.width = width;
    this.height = height;

    // --- animation state ---
    this.homePosition = new THREE.Vector3();
    this.homeQuaternion = new THREE.Quaternion();
    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.targetScale = 1;
    this.targetOpacity = 1;
    this.hovered = false;
    this.visible = true;
  }

  /** Park the slab in a layout slot and treat that as its home. */
  seat({ position, rotation }, immediate = false) {
    this.homePosition.copy(position);
    this.homeQuaternion.setFromEuler(rotation);
    this.targetPosition.copy(position);
    this.targetQuaternion.copy(this.homeQuaternion);
    if (immediate) {
      this.group.position.copy(position);
      this.group.quaternion.copy(this.homeQuaternion);
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

  setOpacity(value) {
    this.targetOpacity = value;
  }

  setVisible(on) {
    this.visible = on;
    this.group.visible = on || this.frameMaterial.opacity > 0.01;
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

    const wantScale = this.hovered ? HOVER_SCALE : 1;
    const s = this.group.scale.x + (wantScale - this.group.scale.x) * k;
    this.group.scale.setScalar(s);

    // Hovering nudges the slab toward the viewer along its own normal.
    if (this.hovered) {
      const lift = new THREE.Vector3(0, 0, HOVER_LIFT).applyQuaternion(
        this.group.quaternion
      );
      this.group.position.add(lift.multiplyScalar(k));
    }

    const o = this.frameMaterial.opacity;
    const next = o + (this.targetOpacity - o) * k;
    this.frameMaterial.opacity = next;
    this.mediaMaterial.opacity = next;
    this.group.visible = this.visible || next > 0.01;
    this.hitArea.userData.pickable = this.visible && next > 0.35;
  }

  dispose() {
    this.frame.geometry.dispose();
    this.media.geometry.dispose();
    this.hitArea.geometry.dispose();
    this.frameMaterial.dispose();
    this.mediaMaterial.dispose();
    this.hitArea.material.dispose();
  }
}
