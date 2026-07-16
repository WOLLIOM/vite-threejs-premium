import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export class RealEstate {
    constructor(scene, renderer, camera, basePath = '', isMobile = false) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.basePath = basePath;
        this.isMobile = isMobile;
        this.model = null;
        this.collisionMeshes = [];
        this.groundY = 0;
        this.interactivePoints = [];
        this.widgetData = [];
        this.activeWidgetIndex = -1;
        this.lastWidgetIndex = -1;
        this.proximityDistance = 1.5;
        this.infoPanel = null;
        this.infoTimeout = null;
        this.onModelLoaded = null;
        this.exrLoaded = false;
        this.collisionLoaded = false;

        // ── Everything is aligned to 0,0,0. modelRaiseAmount is computed
        // once from the GLB's own bounding box so the model, the collision
        // mesh, the invisible ground plane, and the widget markers all
        // agree on the same floor height automatically. ──
        this.modelRaiseAmount = 0;

        // Flip this to true only while tuning collision in dev.
        // In production it must stay false — it hides the magenta/cyan
        // debug overlay, the grid, and the axes helper.
        this.debugCollision = false;
    }

    async load() {
        // ── Let the browser paint the loading screen before we hand the
        // main thread to heavy synchronous work (EXR decode, Draco decode,
        // parsing). Previously this all started instantly, so the loading
        // screen existed in the DOM but the browser had no chance to
        // actually draw it before the thread got busy — that's what shows
        // up as "render delay" in a performance trace. ──
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        this.loadEXR();
        await this.loadGLB();      // model must finish first — collision reuses its raise amount
        await this.loadCollision();
        this.setupCollision();
        this.createInteractiveWidgets();
        return this.model;
    }

    loadEXR() {
        // ── Mobile CPUs choke on EXR's scanline/ZIP decompression —
        // that's the parseScanline / uncompressZIP cost from the trace.
        // Skip it entirely on mobile and go straight to the cheap
        // RoomEnvironment fallback, which is nearly instant. ──
        if (this.isMobile) {
            return new Promise((resolve) => {
                import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
                    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
                    const envTexture = pmremGenerator.fromScene(
                        new RoomEnvironment(this.renderer),
                        0.04
                    ).texture;
                    this.scene.environment = envTexture;
                    this.scene.background = new THREE.Color(0x1a1a1a);
                    pmremGenerator.dispose();
                    this.exrLoaded = true;
                    console.log('✅ Mobile: using lightweight RoomEnvironment (skipped EXR decode)');
                    resolve();
                });
            });
        }

        return new Promise((resolve) => {
            const loader = new EXRLoader();
            const exrPath = `${this.basePath}/environments/background.exr`;
            console.log('📂 Loading EXR from:', exrPath);

            loader.load(
                exrPath,
                (texture) => {
                    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
                    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                    this.scene.environment = envMap;
                    this.scene.background = envMap;
                    texture.dispose();
                    pmremGenerator.dispose();
                    this.exrLoaded = true;
                    resolve();
                    console.log('✅ EXR loaded successfully!');
                },
                undefined,
                (error) => {
                    console.warn('⚠️ EXR load failed, using RoomEnvironment fallback', error);
                    import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
                        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
                        const envTexture = pmremGenerator.fromScene(
                            new RoomEnvironment(this.renderer),
                            0.04
                        ).texture;
                        this.scene.environment = envTexture;
                        this.scene.background = new THREE.Color(0x1a1a1a);
                        pmremGenerator.dispose();
                        this.exrLoaded = true;
                        resolve();
                        console.log('✅ Using RoomEnvironment fallback');
                    }).catch(() => {
                        this.scene.background = new THREE.Color(0x1a1a1a);
                        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
                        this.scene.add(ambient);
                        const dir = new THREE.DirectionalLight(0xffffff, 1);
                        dir.position.set(5, 10, 7);
                        this.scene.add(dir);
                        this.exrLoaded = true;
                        resolve();
                        console.log('✅ Using basic lighting fallback');
                    });
                }
            );
        });
    }

    async loadGLB() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            const modelPath = `${this.basePath}/models/church-optimized.glb`;
            console.log('📂 Loading GLB from:', modelPath);

            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
            dracoLoader.setDecoderConfig({ type: 'wasm' });
            loader.setDRACOLoader(dracoLoader);

            loader.load(
                modelPath,
                (gltf) => {
                    this.model = gltf.scene;

                    // ── Align to 0,0,0 ──
                    // Compute how far the model's own lowest point sits from
                    // y=0, and shift it up by exactly that much. No manual
                    // magic numbers — this makes the model's floor sit
                    // precisely at world y=0, every time you re-export it.
                    const box = new THREE.Box3().setFromObject(this.model);
                    const modelBottom = box.min.y;
                    this.modelRaiseAmount = -modelBottom;
                    this.model.position.y = this.modelRaiseAmount;

                    console.log('📐 Original Bottom Y:', modelBottom);
                    console.log(`📍 Model raised to: ${this.model.position.y.toFixed(3)} units`);

                    this.model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });

                    this.scene.add(this.model);

                    // groundY is now derived, not hardcoded — everything
                    // downstream (collision plane, PlayerController,
                    // widget markers) reads this same value.
                    this.groundY = this.modelRaiseAmount;

                    console.log(`📏 Ground Y: ${this.groundY.toFixed(3)}`);
                    console.log(`✅ Model loaded!`);

                    resolve(this.model);
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    console.log(`Loading model: ${Math.round(percent)}%`);
                },
                (error) => {
                    console.error('❌ GLB load failed:', error);
                    reject(error);
                }
            );
        });
    }

    async loadCollision() {
        return new Promise((resolve, reject) => {
            const loader = new GLTFLoader();
            const collisionPath = `${this.basePath}/models/collision1.glb`;
            console.log('📂 Loading collision from:', collisionPath);

            loader.load(
                collisionPath,
                (gltf) => {
                    const collisionModel = gltf.scene;
                    console.log('✅ Collision GLB loaded!');

                    // ── Same raise as the visible model — this is what
                    // keeps them aligned. Since both meshes came out of the
                    // same scan/export at the same origin, using the exact
                    // same offset means they line up automatically. ──
                    collisionModel.position.y = this.modelRaiseAmount;
                    console.log(`📍 Collision raised to: ${this.modelRaiseAmount.toFixed(3)} units`);

                    let meshCount = 0;
                    collisionModel.traverse((child) => {
                        if (child.isMesh) {
                            meshCount++;

                            if (this.debugCollision) {
                                child.visible = true;
                                child.material = new THREE.MeshBasicMaterial({
                                    color: 0xff00ff,
                                    wireframe: false,
                                    transparent: true,
                                    opacity: 0.4,
                                    side: THREE.DoubleSide,
                                });

                                const wireframeMat = new THREE.MeshBasicMaterial({
                                    color: 0x00ffff,
                                    wireframe: true,
                                    transparent: true,
                                    opacity: 0.8,
                                });
                                const wireframe = new THREE.Mesh(child.geometry, wireframeMat);
                                wireframe.position.copy(child.position);
                                wireframe.rotation.copy(child.rotation);
                                wireframe.scale.copy(child.scale);
                                child.parent.add(wireframe);
                            } else {
                                // Invisible in production — it still blocks
                                // movement via raycasting, it just isn't drawn.
                                child.visible = false;
                            }

                            this.collisionMeshes.push(child);
                            child.userData.isCollidable = true;

                            const name = (child.name || '').toLowerCase();
                            if (name.includes('ground') || name.includes('floor')) {
                                child.userData.isGround = true;
                            }

                            console.log(`🟣 Collision: ${child.name} at Y: ${child.position.y.toFixed(2)}`);
                        }
                    });

                    this.scene.add(collisionModel);
                    this.collisionLoaded = true;

                    console.log(`✅ Collision loaded! ${meshCount} collision meshes at Y=${this.modelRaiseAmount.toFixed(2)}`);
                    resolve(this.collisionMeshes);
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    console.log(`Loading collision: ${Math.round(percent)}%`);
                },
                (error) => {
                    console.error('❌ Collision load failed:', error);
                    if (this.model) {
                        console.log('🔄 Using main model for collision fallback');
                        this.model.traverse((child) => {
                            if (child.isMesh) {
                                this.collisionMeshes.push(child);
                            }
                        });
                    }
                    resolve(this.collisionMeshes);
                }
            );
        });
    }

    setupCollision() {
        const groundSize = 100;
        const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
        const groundMat = new THREE.MeshStandardMaterial({
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = this.groundY;
        ground.name = 'collision_ground';
        ground.userData.isCollidable = true;
        ground.userData.isGround = true;
        this.scene.add(ground);
        this.collisionMeshes.push(ground);

        console.log(`🟢 Collision ground at Y: ${this.groundY.toFixed(3)}`);

        if (this.debugCollision) {
            const gridHelper = new THREE.GridHelper(20, 20, 0xff0000, 0x00ff00);
            gridHelper.position.y = this.groundY;
            this.scene.add(gridHelper);

            const axesHelper = new THREE.AxesHelper(2);
            axesHelper.position.y = this.groundY;
            this.scene.add(axesHelper);
            console.log('📐 Debug grid + axes added at ground level');
        }
    }

    getCollisionMeshes() {
        return this.collisionMeshes;
    }

    getGroundHeight() {
        return this.groundY;
    }

    createInteractiveWidgets() {
        // Widget heights are ground-relative offsets, not absolute
        // hardcoded numbers, so they follow wherever groundY lands.
        const g = this.groundY;

        this.widgetData = [
            {
                position: new THREE.Vector3(2, g + 0.5, 2),
                title: "LIVING ROOM",
                description: "Spacious living area with natural light and fireplace",
                color: 0xf5f4f2
            },
            {
                position: new THREE.Vector3(-2, g + 0.5, 1.5),
                title: "KITCHEN",
                description: "Modern kitchen with granite countertops and premium appliances",
                color: 0xf5f4f2
            },
            {
                position: new THREE.Vector3(0, g + 0.5, -2.5),
                title: "MASTER BEDROOM",
                description: "Luxurious master suite with walk-in closet and balcony",
                color: 0xf5f4f2
            },
            {
                position: new THREE.Vector3(3, g + 0.5, -1),
                title: "BATHROOM",
                description: "Spa-inspired bathroom with soaking tub and rainfall shower",
                color: 0xf5f4f2
            },
            {
                position: new THREE.Vector3(-3, g + 0.5, -1.5),
                title: "MEDIA ROOM",
                description: "Home theater with 4K projector and surround sound",
                color: 0xf5f4f2
            }
        ];

        this.widgetData.forEach((data, index) => {
            const geometry = new THREE.SphereGeometry(0.15, 16, 16);
            const material = new THREE.MeshStandardMaterial({
                color: data.color,
                emissive: data.color,
                emissiveIntensity: 0.5,
                roughness: 0.2,
                metalness: 0.8,
            });
            const marker = new THREE.Mesh(geometry, material);
            marker.position.copy(data.position);
            marker.userData = {
                isWidget: true,
                title: data.title,
                description: data.description,
                color: data.color,
                index: index
            };

            this.scene.add(marker);
            this.interactivePoints.push(marker);

            const ringGeometry = new THREE.RingGeometry(0.2, 0.35, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: data.color,
                transparent: true,
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.position.copy(data.position);
            ring.position.y += 0.05;
            ring.lookAt(new THREE.Vector3(0, this.groundY + 0.5, 0));
            ring.userData = {
                isWidget: true,
                parentIndex: index
            };
            this.scene.add(ring);
            this.interactivePoints.push(ring);

            const canvas = document.createElement('canvas');
            const scale = 3; // supersample so the sprite reads crisp up close, not blurry
            canvas.width = 340 * scale;
            canvas.height = 80 * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);

            if (!ctx.roundRect) {
                ctx.roundRect = function(x, y, w, h, r) {
                    if (r > w/2) r = w/2;
                    if (r > h/2) r = h/2;
                    this.moveTo(x + r, y);
                    this.arcTo(x + w, y, x + w, y + h, r);
                    this.arcTo(x + w, y + h, x, y + h, r);
                    this.arcTo(x, y + h, x, y, r);
                    this.arcTo(x, y, x + w, y, r);
                    return this;
                };
            }

            // Dark glass tag with a thin white hairline border — same
            // language as the site's UI cards, not a colorful rounded pill.
            ctx.fillStyle = 'rgba(10,10,10,0.82)';
            ctx.beginPath();
            ctx.roundRect(2, 2, 336, 76, 8);
            ctx.fill();
            ctx.strokeStyle = 'rgba(245,244,242,0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Small tick mark on the left, echoing the site's ".01" index style
            ctx.fillStyle = 'rgba(245,244,242,0.9)';
            ctx.fillRect(20, 40 - 8, 2, 16);

            ctx.fillStyle = '#f5f4f2';
            ctx.font = '600 26px "JetBrains Mono", "Courier New", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            // Manual letter-spacing — canvas has no native letter-spacing
            // in every browser, so pace the glyphs out by hand.
            let lx = 36;
            const label = data.title.toUpperCase();
            for (const ch of label) {
                ctx.fillText(ch, lx, 41);
                lx += ctx.measureText(ch).width + 3;
            }

            const texture = new THREE.CanvasTexture(canvas);
            texture.anisotropy = 4;
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false,
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.copy(data.position);
            sprite.position.y += 0.8;
            sprite.scale.set(1.5, 0.35, 1);
            sprite.userData = {
                isWidget: true,
                parentIndex: index
            };
            this.scene.add(sprite);
            this.interactivePoints.push(sprite);
        });

        console.log(`✅ Created ${this.widgetData.length} interactive widgets`);
    }

    checkProximity(playerPosition) {
        if (!playerPosition) return;

        let closestIndex = -1;
        let closestDistance = Infinity;

        this.widgetData.forEach((data, index) => {
            const distance = playerPosition.distanceTo(data.position);
            if (distance < this.proximityDistance && distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });

        this.interactivePoints.forEach((point) => {
            if (point.userData.isWidget && point.geometry && point.geometry.type === 'SphereGeometry') {
                const index = point.userData.index;
                if (index === closestIndex) {
                    point.material.emissiveIntensity = 1.0;
                    point.scale.set(1.3, 1.3, 1.3);
                } else {
                    point.material.emissiveIntensity = 0.5;
                    point.scale.set(1, 1, 1);
                }
            }
        });

        if (closestIndex !== -1) {
            const data = this.widgetData[closestIndex];
            this.showWidgetInfo(data.title, data.description, data.color);
        } else {
            this.hideWidgetInfo();
        }
    }

    showWidgetInfo(title, description, color) {
        if (this.infoTimeout) {
            clearTimeout(this.infoTimeout);
            this.infoTimeout = null;
        }

        if (this.infoPanel && this.infoPanel.dataset.title === title) {
            return;
        }

        this.hideWidgetInfo();

        const panel = document.createElement('div');
        panel.id = 'widget-info-panel';
        panel.dataset.title = title;
        panel.style.cssText = `
            position: absolute;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(10, 10, 10, 0.88);
            backdrop-filter: blur(20px);
            padding: 22px 28px;
            border-radius: 10px;
            border: 1px solid rgba(245,244,242,0.25);
            color: #f5f4f2;
            font-family: 'Inter', system-ui, sans-serif;
            max-width: 400px;
            width: 90%;
            z-index: 40;
            animation: slideUp 0.3s ease-out;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            pointer-events: auto;
            transition: opacity 0.3s ease;
        `;

        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <span style="width:6px; height:6px; border-radius:50%; background:#f5f4f2; display:inline-block;"></span>
                <h3 style="margin:0; font-size:12px; font-weight:600; letter-spacing:2px; font-family:'JetBrains Mono', monospace; color:rgba(245,244,242,0.9);">${title.toUpperCase()}</h3>
            </div>
            <p style="margin: 0; opacity: 0.75; font-size: 14px; line-height: 1.55;">${description}</p>
            <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(245,244,242,0.12);">
                <span style="font-size: 11px; letter-spacing: 1px; opacity: 0.45; font-family:'JetBrains Mono', monospace;">WALK AWAY TO CLOSE</span>
            </div>
        `;

        (document.getElementById('app') || document.body).appendChild(panel);
        this.infoPanel = panel;

        if (!document.getElementById('widget-info-style')) {
            const style = document.createElement('style');
            style.id = 'widget-info-style';
            style.textContent = `
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    hideWidgetInfo() {
        if (this.infoPanel) {
            this.infoPanel.remove();
            this.infoPanel = null;
        }
        if (this.infoTimeout) {
            clearTimeout(this.infoTimeout);
            this.infoTimeout = null;
        }
    }

    dispose() {
        this.hideWidgetInfo();
    }
}