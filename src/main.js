// ── Use CDN imports for InfinityFree ──
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

// ── Your local imports ──
import { Engine } from './core/Engine.js';
import { LoadingScreen } from './ui/LoadingScreen.js';
import { PlayerController } from './player/PlayerController.js';
import { RealEstate } from './world/RealEstate.js';

const loadingScreen = new LoadingScreen();
loadingScreen.show();

const container = document.getElementById('app');
const engine = new Engine(container);
const { scene, camera, renderer } = engine;

const realEstate = new RealEstate(scene, renderer, camera);
let player = null;

// ── Check if mobile ──
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

async function init() {
    try {
        await realEstate.load();
        
        const groundY = 4;
        
        console.log(`📍 Ground Y: ${groundY}`);
        
        player = new PlayerController(camera, renderer.domElement, groundY);
        player.enable();
        
        camera.position.set(0, groundY, 0);
        console.log(`📍 Player spawned at: (0, ${groundY}, 0)`);
        
        setTimeout(() => {
            loadingScreen.hide();
            showHUD();
        }, 500);
        
    } catch (error) {
        console.error('Failed to load:', error);
        document.getElementById('loading-screen').innerHTML = `
            <div style="color: white; text-align: center; padding: 20px;">
                <h2>❌ Failed to load</h2>
                <p>${error.message}</p>
                <p style="font-size: 12px; color: #888;">Check console for details</p>
            </div>
        `;
    }
}

function showHUD() {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const hud = document.createElement('div');
    hud.id = 'hud';
    
    if (isMobile) {
        hud.innerHTML = '📱 Use joystick to move · Touch screen to look around';
    } else {
        hud.innerHTML = '🖱️ Click to lock · WASD move · Walk near markers for info';
    }
    
    document.body.appendChild(hud);
    setTimeout(() => hud.classList.add('hidden'), 6000);
}

init();

function animate() {
    requestAnimationFrame(animate);
    if (player) {
        player.update();
        
        // ── 🔥 Check proximity to widgets ──
        const playerPos = camera.position.clone();
        if (realEstate.checkProximity) {
            realEstate.checkProximity(playerPos);
        }
    }
    
    // Animate widgets (pulsing effect)
    if (realEstate.interactivePoints) {
        const time = Date.now() * 0.001;
        realEstate.interactivePoints.forEach((point, index) => {
            if (point.userData.isWidget && point.geometry && point.geometry.type === 'SphereGeometry') {
                // Only pulse if not highlighted
                if (point.scale.x < 1.2) {
                    const pulse = 1 + Math.sin(time * 2 + index) * 0.1;
                    point.scale.set(pulse, pulse, pulse);
                }
            }
        });
    }
    
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
});