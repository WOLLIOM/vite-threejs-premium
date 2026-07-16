import * as THREE from 'three';
import { performanceMonitor } from './PerformanceMonitor.js';

// ── A field of circular "bubbles" filled with the domain-warped noise
// pattern, all drawn by ONE shared WebGL renderer/shader instead of one
// renderer per bubble. Multiple THREE.WebGLRenderer instances are
// expensive (each is its own GPU context) — six of those would hit
// weaker machines hard. One shared fullscreen shader that masks itself
// into several circles costs roughly the same as a single bubble did
// before. ──
export class BubbleField {
    constructor(containerEl, bubbleSpecs) {
        this.container = containerEl;
        if (!this.container) return;

        // bubbleSpecs: [{ xPct, yPct, sizePx, phase }, ...]
        // xPct/yPct are 0–1 position within the container; sizePx is the
        // bubble's diameter; phase offsets each bubble's idle bob so they
        // don't all float in unison.
        this.bubbles = bubbleSpecs;

        this.clock = new THREE.Clock();
        this.running = false;
        this.frameId = null;
        this.lowPower = false;

        this._buildScene();
        this._buildCanvas();
        this._bindEvents();
        this._observeVisibility();
        this._subscribeToPerformance();

        this._resize();
        this.start();
    }

    _buildCanvas() {
        const el = this.renderer.domElement;
        el.style.position = 'absolute';
        el.style.inset = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.pointerEvents = 'none';
        this.container.style.position = this.container.style.position || 'relative';
        this.container.prepend(el);
    }

    _buildScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        const MAX_BUBBLES = 8;
        const centers = new Array(MAX_BUBBLES * 2).fill(-999);
        const radii = new Array(MAX_BUBBLES).fill(0);

        this.uniforms = {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uMouse: { value: new THREE.Vector2(-999, -999) }, // px, container-relative
            uMouseVel: { value: 0 },
            uBubbleCount: { value: this.bubbles.length },
            uCenters: { value: centers },   // flat [x0,y0,x1,y1,...] in px
            uRadii: { value: radii },       // px

            // ── Deep space palette: blue / purple / cyan ──
            uColorRed:    { value: new THREE.Color('#9be8ff') },
            uColorMaroon: { value: new THREE.Color('#5b21b6') },
            uColorOrange: { value: new THREE.Color('#22d3ee') },
            uColorNavy:   { value: new THREE.Color('#0a0f2b') },
            uColorBlue:   { value: new THREE.Color('#3b5bdb') },
            uColorBg:     { value: new THREE.Color('#040309') },

            uSpeed:   { value: 1.1 },
            uScale:   { value: 2.4 },
            uWarp:    { value: 0.35 },
            uDetail:  { value: 0.65 },
            uNavyAmt:   { value: 0.55 },
            uBlueAmt:   { value: 0.22 },
            uOrangeAmt: { value: 0.12 },
            uMaroonAmt: { value: 0.38 },
            uRedAmt:    { value: 0.22 },
            uPushStr: { value: 0.85 },   // ↑ raised from 0.55 — more visible on small movement
            uPushRad: { value: 2.4 },    // ↑ slightly wider so the reaction reads even near bubble edges
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            vertexShader: /* glsl */ `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                precision highp float;
                varying vec2 vUv;
                uniform float uTime;
                uniform vec2 uResolution;
                uniform vec2 uMouse;
                uniform float uMouseVel;
                uniform int uBubbleCount;
                uniform vec2 uCenters[${MAX_BUBBLES}];
                uniform float uRadii[${MAX_BUBBLES}];
                uniform vec3 uColorRed, uColorMaroon, uColorOrange, uColorNavy, uColorBlue, uColorBg;
                uniform float uSpeed, uScale, uWarp, uDetail;
                uniform float uNavyAmt, uBlueAmt, uOrangeAmt, uMaroonAmt, uRedAmt;
                uniform float uPushStr, uPushRad;

                vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
                vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
                vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
                float snoise(vec2 v){
                    const vec4 C = vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
                    vec2 i  = floor(v + dot(v, C.yy));
                    vec2 x0 = v -   i + dot(i, C.xx);
                    vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
                    vec4 x12 = x0.xyxy + C.xxzz;
                    x12.xy -= i1;
                    i = mod289(i);
                    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))+ i.x + vec3(0.0, i1.x, 1.0 ));
                    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                    m = m*m; m = m*m;
                    vec3 x = 2.0 * fract(p * C.www) - 1.0;
                    vec3 h = abs(x) - 0.5;
                    vec3 ox = floor(x + 0.5);
                    vec3 a0 = x - ox;
                    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
                    vec3 g;
                    g.x  = a0.x  * x0.x  + h.x  * x0.y;
                    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                    return 130.0 * dot(m, g);
                }

                float fbm(vec2 p) {
                    float v = 0.0;
                    float amp = 0.5;
                    for (int i = 0; i < 5; i++) {
                        v += amp * snoise(p);
                        p *= 2.0;
                        amp *= 0.5;
                    }
                    return v;
                }

                void main() {
                    vec2 fragPx = vUv * uResolution;

                    // ── Union of all bubble circles, soft-edged ──
                    float mask = 0.0;
                    for (int i = 0; i < ${MAX_BUBBLES}; i++) {
                        if (i >= uBubbleCount) break;
                        float d = length(fragPx - uCenters[i]) - uRadii[i];
                        float edge = uRadii[i] * 0.04 + 1.5; // soft antialiased edge, scales with size
                        mask = max(mask, 1.0 - smoothstep(-edge, edge, d));
                    }
                    if (mask <= 0.001) { discard; }

                    vec2 uv = vUv;
                    vec2 p = uv * 2.0 - 1.0;
                    p.x *= uResolution.x / uResolution.y;
                    p *= uScale;

                    vec2 q = vec2(fbm(p + uTime * uSpeed * 0.03), fbm(p + vec2(5.2, 1.3) + uTime * uSpeed * 0.025));

                    // Mouse in the same px space as fragPx
                    vec2 toMouse = fragPx - uMouse;
                    float mouseDist = length(toMouse) / max(uResolution.y, 1.0);
                    float mousePush = uMouseVel * uPushStr * exp(-mouseDist * (2.5 / max(uPushRad, 0.05)));
                    q += normalize(toMouse + 0.001) * mousePush;

                    vec2 r = vec2(
                        fbm(p + uWarp * q + vec2(1.7, 9.2) + uTime * uSpeed * 0.015),
                        fbm(p + uWarp * q + vec2(8.3, 2.8) + uTime * uSpeed * 0.018)
                    );

                    float f = fbm(p + uDetail * r);

                    vec3 col = uColorBg;
                    col = mix(col, uColorNavy, smoothstep(-0.3 + uNavyAmt, 0.3 + uNavyAmt, f));
                    col = mix(col, uColorBlue, smoothstep(0.05 + uBlueAmt, 0.35 + uBlueAmt, length(q)) * 0.7);
                    col = mix(col, uColorOrange, smoothstep(uOrangeAmt, 0.4 + uOrangeAmt, r.x));
                    col = mix(col, uColorMaroon, smoothstep(uMaroonAmt, 0.35 + uMaroonAmt, r.y));
                    col = mix(col, uColorRed, smoothstep(uRedAmt, 0.4 + uRedAmt, f + r.x * 0.3));

                    gl_FragColor = vec4(col, mask);
                }
            `,
        });

        this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    }

    _bindEvents() {
        this._onResize = () => this._resize();
        window.addEventListener('resize', this._onResize);

        // ── Track on WINDOW, not the small container ──
        // This is the actual fix for "cursor feels laggy": before, the
        // listener only lived on the tiny circle element, so movement
        // anywhere else on the page produced zero events. Tracking on
        // window means the bubble field always knows exactly where the
        // cursor is, continuously, no matter how small the bubbles are.
        this.mouseX = -999;
        this.mouseY = -999;
        this.lastX = -999;
        this.lastY = -999;
        this.velEased = 0;

        this._onPointerMove = (e) => {
            const rect = this.container.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = rect.height - (e.clientY - rect.top); // flip to match GL's bottom-left origin
        };
        window.addEventListener('pointermove', this._onPointerMove, { passive: true });

        this._tick = () => {
            if (!this.running) return;
            this.frameId = requestAnimationFrame(this._tick);

            if (this.lastX === -999) { this.lastX = this.mouseX; this.lastY = this.mouseY; }
            const dx = this.mouseX - this.lastX;
            const dy = this.mouseY - this.lastY;
            // ↑ multiplier raised + sqrt curve: small movements now produce
            // a proportionally bigger response instead of needing a big
            // fast swipe before anything visible happens.
            const rawDist = Math.sqrt(dx * dx + dy * dy);
            const velRaw = Math.min(Math.pow(rawDist, 0.7) * 1.3, 4.0);
            this.lastX = this.mouseX; this.lastY = this.mouseY;
            this.velEased += (velRaw - this.velEased) * 0.22; // faster catch-up than before (was 0.12)
            this.velEased *= 0.965;

            this.uniforms.uTime.value = this.clock.getElapsedTime();
            this.uniforms.uMouse.value.set(this.mouseX, this.mouseY);
            this.uniforms.uMouseVel.value = this.velEased;

            this._updateBubblePositions();
            this.renderer.render(this.scene, this.camera);
        };
    }

    // Gentle idle bob, like bubbles drifting in water — purely cosmetic,
    // cheap (just a sine per bubble, computed on CPU not in the shader).
    _updateBubblePositions() {
        const t = this.uniforms.uTime.value;
        const w = this.uniforms.uResolution.value.x;
        const h = this.uniforms.uResolution.value.y;
        const centers = this.uniforms.uCenters.value;
        const radii = this.uniforms.uRadii.value;

        const activeCount = this.lowPower
            ? Math.ceil(this.bubbles.length * 0.5) // fewer bubbles when struggling
            : this.bubbles.length;
        this.uniforms.uBubbleCount.value = activeCount;

        this.bubbles.forEach((b, i) => {
            if (i >= activeCount) return;
            const bobX = Math.sin(t * 0.35 + b.phase) * (b.sizePx * 0.06);
            const bobY = Math.cos(t * 0.28 + b.phase * 1.7) * (b.sizePx * 0.08);
            centers[i * 2] = b.xPct * w + bobX;
            centers[i * 2 + 1] = (1 - b.yPct) * h + bobY;
            radii[i] = (b.sizePx / 2) * (this.lowPower ? 0.9 : 1.0);
        });
    }

    _observeVisibility() {
        if (!('IntersectionObserver' in window)) return;
        this._io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) this.start();
            else this.stop();
        }, { threshold: 0.05 });
        this._io.observe(this.container);
    }

    // ── Auto quality scale-down ──
    // When the page-wide performance monitor detects sustained low FPS,
    // drop pixel ratio and hide some bubbles. When it recovers, restore.
    _subscribeToPerformance() {
        this._unsubPerf = performanceMonitor.onChange((isLow) => {
            this.lowPower = isLow;
            this.renderer.setPixelRatio(isLow ? 1 : Math.min(window.devicePixelRatio, 1.5));
            this._resize();
        });
    }

    _resize() {
        const rect = this.container.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const h = Math.max(1, Math.round(rect.height));
        this.renderer.setSize(w, h, false);
        this.uniforms.uResolution.value.set(w, h);
    }

    start() {
        if (this.running) return;
        this.running = true;
        this._tick();
    }

    stop() {
        this.running = false;
        if (this.frameId) cancelAnimationFrame(this.frameId);
    }

    dispose() {
        this.stop();
        this._io?.disconnect();
        this._unsubPerf?.();
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('pointermove', this._onPointerMove);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
