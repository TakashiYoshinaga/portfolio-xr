/* =========================================================
   Chip — an in-world control.

   Everything the user can press during a session has to exist in 3D:
   dom-overlay is granted on Android but not on Quest hardware, so a
   DOM button would simply be invisible in the headset.

   A chip is a slab without the media quad — chrome plus a label
   strip from the same atlas — so the controls read as part of the
   same system as the cards.
   ========================================================= */

import * as THREE from "three";
import { COLOR, TEX } from "../core/Theme.js";

const LERP = 10;
const HOVER_SCALE = 1.08;

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

function setQuadUV(geometry, { u0, u1, v0, v1 }) {
  const uv = geometry.attributes.uv;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

export class Chip {
  /**
   * @param {object} opts
   * @param {string} opts.action  what selecting it means ('more', 'tag', …)
   * @param {number} opts.labelIndex  slot in the label atlas
   * @param {number[]} opts.labelIndexAlt  optional second slot, for
   *        chips that toggle between two captions (MORE / LESS)
   */
  constructor({
    key,
    action,
    payload = null,
    labelIndex,
    labelIndexAlt = null,
    labelTexture,
    width,
    height,
    accent = COLOR.accent,
  }) {
    this.key = key;
    this.kind = "chip";
    this.action = action;
    this.payload = payload;
    this.labelIndex = labelIndex;
    this.labelIndexAlt = labelIndexAlt;
    this.alt = false;
    this.active = false;

    this.group = new THREE.Group();
    this.group.name = `chip:${key}`;
    this.width = width;
    this.height = height;

    // The pill itself is painted into the label strip, so there is no
    // separate backing quad to keep aligned with it.
    this.labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.label = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      this.labelMaterial
    );
    this.label.position.z = 0.002;
    this.label.renderOrder = 2;
    setQuadUV(this.label.geometry, labelUV(labelIndex));
    this.group.add(this.label);

    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.08, height * 1.14),
      this.glowMaterial
    );
    this.glow.position.z = -0.002;
    this.glow.renderOrder = 0;
    this.group.add(this.glow);

    this.hitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.1, height * 1.35),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitArea.position.z = 0.006;
    this.hitArea.userData.slab = this; // same duck type the Pointer expects
    this.hitArea.userData.pickable = true;
    this.group.add(this.hitArea);

    this.targetPosition = new THREE.Vector3();
    this.targetQuaternion = new THREE.Quaternion();
    this.targetOpacity = 1;
    this.opacity = 1;
    this.hovered = false;
    this.visible = true;
  }

  seat({ position, rotation }, immediate = false) {
    this.targetPosition.copy(position);
    this.targetQuaternion.setFromEuler(rotation);
    if (immediate) {
      this.group.position.copy(position);
      this.group.quaternion.copy(this.targetQuaternion);
    }
    return this;
  }

  /** Swap to the alternate caption (MORE <-> LESS). */
  setAlt(on) {
    if (this.labelIndexAlt == null || this.alt === on) return;
    this.alt = on;
    setQuadUV(
      this.label.geometry,
      labelUV(on ? this.labelIndexAlt : this.labelIndex)
    );
  }

  /** Latched state, for the tag filters. */
  setActive(on) {
    this.active = on;
  }

  setHovered(on) {
    this.hovered = on;
  }

  setOpacity(value) {
    this.targetOpacity = value;
  }

  setVisible(on) {
    this.visible = on;
    if (!on) this.targetOpacity = 0;
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

    this.opacity += (this.targetOpacity - this.opacity) * k;
    this.labelMaterial.opacity = this.opacity;

    const glowTarget = this.hovered ? 0.55 : this.active ? 0.3 : 0;
    this.glowMaterial.opacity +=
      (glowTarget * this.opacity - this.glowMaterial.opacity) * k;

    this.group.visible = this.opacity > 0.01;
    this.hitArea.userData.pickable = this.visible && this.opacity > 0.35;
  }

  dispose() {
    for (const mesh of [this.label, this.glow, this.hitArea]) {
      mesh.geometry.dispose();
    }
    for (const m of [
      this.labelMaterial,
      this.glowMaterial,
      this.hitArea.material,
    ]) {
      m.dispose();
    }
  }
}
