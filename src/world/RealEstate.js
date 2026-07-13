import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export class RealEstate {
    constructor(scene, renderer, camera) {
        this.scene = scene;
        this.renderer = renderer;
        this.camera = camera;
        this.model = null;
        this.collisionMeshes = [];
        this.groundY = 4;
        this.interactivePoints = [];
        this.widgetData = [];
        this.activeWidgetIndex = -1;
        this.lastWidgetIndex = -1;
        this.proximityDistance = 1.5;
        this.infoPanel = null;
        this.infoTimeout = null;
    }

    async load() {
        await this.loadEXR();
        await this.loadGLB();
        this.setupCollision();
        this.createInteractiveWidgets();
        return this.model;
    }

    async loadEXR() {
        return new Promise((resolve) => {
            const loader = new EXRLoader();
            loader.load(
                '/environments/background.exr',
                (texture) => {
                    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
                    const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                    this.scene.environment = envMap;
                    this.scene.background = envMap;
                    texture.dispose();
                    pmremGenerator.dispose();
                    resolve();
                    console.log('✅ EXR loaded successfully!');
                },
                undefined,
                (error) => {
                    console.warn('⚠️ EXR load failed, using RoomEnvironment fallback', error);
                    // ── FALLBACK: Use RoomEnvironment ──
                    import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
                        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
                        const envTexture = pmremGenerator.fromScene(
                            new RoomEnvironment(this.renderer),
                            0.04
                        ).texture;
                        this.scene.environment = envTexture;
                        this.scene.background = new THREE.Color(0x1a1a1a);
                        pmremGenerator.dispose();
                        resolve();
                        console.log('✅ Using RoomEnvironment fallback');
                    }).catch(() => {
                        // Ultra fallback - basic lighting
                        this.scene.background = new THREE.Color(0x1a1a1a);
                        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
                        this.scene.add(ambient);
                        const dir = new THREE.DirectionalLight(0xffffff, 1);
                        dir.position.set(5, 10, 7);
                        this.scene.add(dir);
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
            
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
            loader.setDRACOLoader(dracoLoader);

            loader.load(
                '/models/home.glb',
                (gltf) => {
                    this.model = gltf.scene;
                    
                    const box = new THREE.Box3().setFromObject(this.model);
                    const modelBottom = box.min.y;
                    
                    console.log('📐 Original Bottom Y:', modelBottom);
                    
                    const raiseAmount = 1 - modelBottom;
                    this.model.position.y = raiseAmount;
                    
                    console.log(`📍 Model raised by: ${raiseAmount.toFixed(2)} units`);
                    
                    this.model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            if (child.geometry) {
                                this.collisionMeshes.push(child);
                            }
                        }
                    });

                    this.scene.add(this.model);
                    this.groundY = 4;
                    
                    console.log('📏 New Ground Y:', this.groundY);
                    console.log('✅ Model loaded successfully!');
                    
                    resolve(this.model);
                },
                (progress) => {
                    const percent = (progress.loaded / progress.total) * 100;
                    console.log(`Loading: ${Math.round(percent)}%`);
                },
                (error) => {
                    console.error('❌ GLB load failed:', error);
                    reject(error);
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
        ground.position.y = 4;
        ground.name = 'collision_ground';
        this.scene.add(ground);
        this.collisionMeshes.push(ground);
        
        console.log(`🟢 Collision ground at Y: 4`);
        
        const gridHelper = new THREE.GridHelper(20, 20, 0xff0000, 0x00ff00);
        gridHelper.position.y = 4;
        this.scene.add(gridHelper);
        console.log('📐 Grid helper added at Y=4');
        
        const axesHelper = new THREE.AxesHelper(2);
        axesHelper.position.y = 4;
        this.scene.add(axesHelper);
        console.log('🧭 Axes helper added at Y=4');
    }

    createInteractiveWidgets() {
        this.widgetData = [
            {
                position: new THREE.Vector3(2, 4.5, 2),
                title: "🏠 Living Room",
                description: "Spacious living area with natural light and fireplace",
                color: 0x4CAF50
            },
            {
                position: new THREE.Vector3(-2, 4.5, 1.5),
                title: "🍽️ Kitchen",
                description: "Modern kitchen with granite countertops and premium appliances",
                color: 0xFF9800
            },
            {
                position: new THREE.Vector3(0, 4.5, -2.5),
                title: "🛏️ Master Bedroom",
                description: "Luxurious master suite with walk-in closet and balcony",
                color: 0xE91E63
            },
            {
                position: new THREE.Vector3(3, 4.5, -1),
                title: "🛁 Bathroom",
                description: "Spa-inspired bathroom with soaking tub and rainfall shower",
                color: 0x2196F3
            },
            {
                position: new THREE.Vector3(-3, 4.5, -1.5),
                title: "📺 Media Room",
                description: "Home theater with 4K projector and surround sound",
                color: 0x9C27B0
            }
        ];

        this.widgetData.forEach((data, index) => {
            // Glowing sphere marker
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

            // Ring around marker
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
            ring.lookAt(new THREE.Vector3(0, 4, 0));
            ring.userData = {
                isWidget: true,
                parentIndex: index
            };
            this.scene.add(ring);
            this.interactivePoints.push(ring);

            // Label sprite
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            
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
            
            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.beginPath();
            ctx.roundRect(0, 0, 256, 64, 10);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(data.title, 128, 32);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                depthTest: false,
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.copy(data.position);
            sprite.position.y += 0.8;
            sprite.scale.set(1.5, 0.4, 1);
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
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(20px);
            padding: 24px 32px;
            border-radius: 16px;
            border: 2px solid #${color.toString(16).padStart(6, '0')};
            color: white;
            font-family: system-ui, sans-serif;
            max-width: 400px;
            width: 90%;
            z-index: 1000;
            animation: slideUp 0.3s ease-out;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            pointer-events: auto;
            transition: opacity 0.3s ease;
        `;

        panel.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="font-size: 24px;">${title.split(' ')[0]}</div>
                <h3 style="margin: 0; font-size: 20px; font-weight: 600;">${title}</h3>
            </div>
            <p style="margin: 8px 0 0 0; opacity: 0.8; font-size: 14px; line-height: 1.5;">${description}</p>
            <div style="margin-top: 12px; display: flex; gap: 8px;">
                <span style="font-size: 12px; opacity: 0.5;">💡 Walk away to close</span>
            </div>
        `;

        document.body.appendChild(panel);
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

    getGroundHeight() {
        return 4;
    }

    dispose() {
        this.hideWidgetInfo();
    }
}