import * as THREE from 'three';

/**
 * Sets up scene lighting and shadows.
 *
 * Note: this intentionally does NOT set scene.environment — RealEstate.js
 * already handles that (EXR on desktop, RoomEnvironment on mobile). Doing
 * it twice would run PMREMGenerator twice for no reason.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.WebGLRenderer} renderer
 * @param {Object} [houseBounds] - real house footprint, so the shadow
 *   camera frustum actually covers the model instead of a hardcoded ±4
 *   box. Pass { center: {x, z}, size: {width, depth} }. Falls back to a
 *   reasonable default if omitted.
 */
export function setupLighting(scene, renderer, houseBounds, isMobile = false) {
  const center = houseBounds?.center ?? { x: 0, z: 0 };
  const size = houseBounds?.size ?? { width: 10, depth: 10 };

  // Half-extents with a little padding so shadows don't clip at the
  // exact wall edge.
  const halfW = size.width / 2 + 1;
  const halfD = size.depth / 2 + 1;

  // ── Key light (the one that casts shadows) ──
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(center.x + 6, 10, center.z + 6);
  keyLight.target.position.set(center.x, 0, center.z);
  scene.add(keyLight.target);

  keyLight.castShadow = true;
  // Map size is higher than the original (2048 vs 1024) on desktop — safe
  // to afford because shadows are computed once, not every frame (see
  // main.js: renderer.shadowMap.autoUpdate = false). On mobile, drop back
  // down: a phone GPU pays more per-pixel for shadow rasterization even
  // for a one-time computation, and 1024 is plenty for a phone screen.
  const shadowRes = isMobile ? 1024 : 2048;
  keyLight.shadow.mapSize.width = shadowRes;
  keyLight.shadow.mapSize.height = shadowRes;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.camera.left = -halfW;
  keyLight.shadow.camera.right = halfW;
  keyLight.shadow.camera.top = halfD;
  keyLight.shadow.camera.bottom = -halfD;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  // ── Soft fill light — no shadow, just lifts the dark side a touch ──
  const fillLight = new THREE.DirectionalLight(0xcfe8ff, 0.35);
  fillLight.position.set(center.x - 6, 5, center.z - 4);
  scene.add(fillLight);

  // ── Warm accent light ──
  const accent = new THREE.PointLight(0xff8844, 0.35, 8);
  accent.position.set(center.x - 1, 2.5, center.z + 1.5);
  scene.add(accent);

  // ── Cool rim light ──
  const rim = new THREE.PointLight(0x4488ff, 0.25, 8);
  rim.position.set(center.x + 1.5, 2, center.z - 2);
  scene.add(rim);

  // ── Gentle ambient so shadow areas aren't pure black ──
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(ambient);

  return { keyLight, fillLight, accent, rim, ambient };
}