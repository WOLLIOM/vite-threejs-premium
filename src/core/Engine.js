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
    this.camera.position.set(0, 1.7, 5);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    
    // ── 🔥 OPTIMIZATION: Lower pixel ratio for performance ──
    const maxPixelRatio = 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    
    // ── 🔥 OPTIMIZATION: Shadows can be expensive ──
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.bias = 0.0001;
    
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // ── MOBILE OPTIMIZATION ──
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    
    if (isMobile) {
        this.renderer.setPixelRatio(1);
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMappingExposure = 0.8;
        console.log('📱 Mobile mode enabled - optimized for performance');
    }

    container.appendChild(this.renderer.domElement);
    this.renderer.setAnimationLoop(null);
    this.shadersPrecompiled = false;
  }

  precompileShaders(scene, camera) {
    // Note: no longer a one-shot guard. The first call (empty scene,
    // before assets load) is cheap and doesn't cover the real materials.
    // The call that actually matters is the one made after the model and
    // its textures exist — that's the one worth paying for.
    console.log('🔄 Pre-compiling shaders...');
    try {
      this.renderer.compile(scene, camera);
      this.shadersPrecompiled = true;
      console.log('✅ Shaders pre-compiled successfully!');
    } catch (error) {
      console.warn('⚠️ Shader pre-compilation warning:', error);
    }
  }

  // ── Async shader compile ──
  // renderer.compile() is a single long synchronous call — on a phone
  // that's exactly the kind of "long task" that freezes the page during
  // load. renderer.compileAsync() (three.js r160+) compiles shaders
  // without blocking the main thread for one giant stretch, so the
  // browser stays responsive (loading screen animation keeps running,
  // etc). Falls back to the sync version on older three.js builds.
  async precompileShadersAsync(scene, camera) {
    if (typeof this.renderer.compileAsync === 'function') {
      console.log('🔄 Pre-compiling shaders (async)...');
      try {
        await this.renderer.compileAsync(scene, camera);
        this.shadersPrecompiled = true;
        console.log('✅ Shaders pre-compiled (async) successfully!');
        return;
      } catch (error) {
        console.warn('⚠️ Async shader pre-compilation warning, falling back to sync:', error);
      }
    }
    this.precompileShaders(scene, camera);
  }

  warmupRenderer(scene, camera) {
    console.log('🔥 Warming up renderer...');
    try {
      this.renderer.render(scene, camera);
      console.log('✅ Renderer warmed up!');
    } catch(error) {
      console.warn('⚠️ Renderer warmup warning:', error);
    }
  }

  enableFrustumCulling(model) {
    console.log('🔄 Enabling frustum culling...');
    let meshCount = 0;
    model.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = true;
        meshCount++;
      }
    });
    console.log(`✅ Frustum culling enabled for ${meshCount} meshes`);
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}