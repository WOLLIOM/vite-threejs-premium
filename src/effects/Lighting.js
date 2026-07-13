import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupLighting(scene, renderer) {
  // HDR environment via RoomEnvironment
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envTexture = pmremGenerator.fromScene(
    new RoomEnvironment(renderer),
    0.04
  ).texture;
  scene.environment = envTexture;

  // Soft fill light (for extra shadow definition)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
  fillLight.position.set(2, 4, 3);
  fillLight.castShadow = true;
  fillLight.shadow.mapSize.width = 1024;
  fillLight.shadow.mapSize.height = 1024;
  fillLight.shadow.camera.near = 0.5;
  fillLight.shadow.camera.far = 10;
  fillLight.shadow.camera.left = -4;
  fillLight.shadow.camera.right = 4;
  fillLight.shadow.camera.top = 4;
  fillLight.shadow.camera.bottom = -4;
  scene.add(fillLight);

  // Warm accent light
  const accent = new THREE.PointLight(0xff8844, 0.3, 6);
  accent.position.set(-1, 2.5, 1.5);
  scene.add(accent);

  // Cool rim light
  const rim = new THREE.PointLight(0x4488ff, 0.2, 6);
  rim.position.set(1.5, 2, -2);
  scene.add(rim);
}