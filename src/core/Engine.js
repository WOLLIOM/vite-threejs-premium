import * as THREE from 'three';

export class Engine {
  constructor(container) {
    this.container = container;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111118);

    // Camera
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    this.camera.position.set(0, 1.7, 5); // eye height

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── 🔥 MOBILE OPTIMIZATION 🔥 ──
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isMobile) {
        this.renderer.setPixelRatio(1); // Lower resolution on mobile
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows = faster
        this.renderer.toneMappingExposure = 0.8; // Slightly darker for mobile screens
        console.log('📱 Mobile mode enabled - optimized for performance');
    }
    // ────────────────────────────────

    container.appendChild(this.renderer.domElement);
  }
}