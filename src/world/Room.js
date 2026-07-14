import * as THREE from 'three';

export class Room {
  build(scene) {
    // ── Floor ──
    const floorGeo = new THREE.PlaneGeometry(8, 8);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      roughness: 0.3,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // ── Walls (simple box) ──
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x333340, roughness: 0.5, metalness: 0.1 });
    const wallHeight = 2.8;
    const wallThick = 0.1;
    const halfSize = 4;

    // Back wall
    const back = new THREE.Mesh(new THREE.BoxGeometry(8, wallHeight, wallThick), wallMat);
    back.position.set(0, wallHeight/2, -halfSize);
    back.receiveShadow = true;
    scene.add(back);

    // Left wall
    const left = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, 8), wallMat);
    left.position.set(-halfSize, wallHeight/2, 0);
    left.receiveShadow = true;
    scene.add(left);

    // Right wall
    const right = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallHeight, 8), wallMat);
    right.position.set(halfSize, wallHeight/2, 0);
    right.receiveShadow = true;
    scene.add(right);

    // ── Table ──
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x5c4b3a, roughness: 0.4, metalness: 0.3 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), tableMat);
    tableTop.position.set(0, 0.8, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    scene.add(tableTop);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3a2c1e, roughness: 0.6, metalness: 0.2 });
    const legPositions = [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]];
    legPositions.forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8), legMat);
      leg.position.set(x, 0.35, z);
      leg.castShadow = true;
      scene.add(leg);
    });

    // ── Chair ──
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.5 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), chairMat);
    seat.position.set(1.3, 0.43, 0.8);
    seat.castShadow = true;
    seat.receiveShadow = true;
    scene.add(seat);

    const chairLegPos = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
    chairLegPos.forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), chairMat);
      leg.position.set(1.3 + x, 0.2, 0.8 + z);
      leg.castShadow = true;
      scene.add(leg);
    });

    // ── Vase / decorative object ──
    const vaseMat = new THREE.MeshStandardMaterial({
      color: 0x6c5ce7,
      roughness: 0.2,
      metalness: 0.7,
      envMapIntensity: 1.2,
    });
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.4, 16), vaseMat);
    vase.position.set(-1.4, 0.2, 1.2);
    vase.castShadow = true;
    vase.receiveShadow = true;
    scene.add(vase);

    // ── Small sphere (reflective) ──
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xfd79a8,
      roughness: 0.1,
      metalness: 0.9,
      envMapIntensity: 1.5,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 32), sphereMat);
    sphere.position.set(1.8, 0.2, -1.0);
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    scene.add(sphere);

    // ── Ceiling light (emissive) ──
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      emissive: 0xffaa66,
      emissiveIntensity: 0.3,
    });
    const lightMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), lightMat);
    lightMesh.position.set(0, 2.7, 0);
    scene.add(lightMesh);

    // ── Ambient particles (dust) ──
    const particleCount = 200;
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 6;
      if (i % 3 === 1) posArray[i] += 1.2; // Y offset
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xaaaaaa,
      size: 0.015,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(pGeo, pMat);
    particles.position.y = 0.5;
    scene.add(particles);
  }
}