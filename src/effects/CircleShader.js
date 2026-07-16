import * as THREE from 'three';

// ── Renders the domain-warped noise shader clipped into a circle,
// inside a single container element. Page background stays solid
// black — only the circle itself is "filled up" with the animated
// nebula effect. ──
export class CircleShader {
    constructor(containerEl) {
        this.container = containerEl;
        if (!this.container) return;

        this.clock = new THREE.Clock();
        this.running = false;
        this.frameId = null;

        this._buildScene();
        this._buildCanvas();
        this._bindEvents();
        this._observeVisibility();

        this._resize();
        this.start();
    }

    _buildCanvas() {
        const el = this.renderer.domElement;
        el.style.position = 'absolute';
        el.style.inset = '0';
        el.style.width = '100%';
        el.style.height = '100%';
        el.style.borderRadius = '50%';
        // Belt-and-suspenders circle clip (border-radius alone is enough
        // for a square container, clip-path covers non-square ones too).
        el.style.clipPath = 'circle(50%)';
        el.style.webkitClipPath = 'circle(50%)';

        this.container.style.position = this.container.style.position || 'relative';
        this.container.style.borderRadius = '50%';
        this.container.style.overflow = 'hidden';
        this.container.prepend(el);
    }

    _buildScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        this.uniforms = {
            uTime: { value: 0 },
            uResolution: { value: new THREE.Vector2(1, 1) },
            uMouse: { value: new THREE.Vector2(0.5, 0.5) },
            uMouseVel: { value: 0 },

            // ── Deep space: blue / purple / cyan, icy accents ──
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
            uPushStr: { value: 0.55 },
            uPushRad: { value: 2.0 },
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
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
                    vec2 uv = vUv;
                    vec2 p = uv * 2.0 - 1.0;
                    p.x *= uResolution.x / uResolution.y;
                    p *= uScale;

                    vec2 q = vec2(fbm(p + uTime * uSpeed * 0.03), fbm(p + vec2(5.2, 1.3) + uTime * uSpeed * 0.025));

                    vec2 toMouse = p - (uMouse * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
                    float mouseDist = length(toMouse);
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
                    col = mix(col, uColorOrange, smoothstep(0.15 + uOrangeAmt - 0.15, 0.55 + uOrangeAmt - 0.15, r.x));
                    col = mix(col, uColorMaroon, smoothstep(0.35 + uMaroonAmt - 0.35, 0.7 + uMaroonAmt - 0.35, r.y));
                    col = mix(col, uColorRed, smoothstep(0.5 + uRedAmt - 0.5, 0.9 + uRedAmt - 0.5, f + r.x * 0.3));

                    gl_FragColor = vec4(col, 1.0);
                }
            `,
        });

        this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    }

    _bindEvents() {
        this._onResize = () => this._resize();
        window.addEventListener('resize', this._onResize);

        let mouseX = 0.5, mouseY = 0.5, lastX = 0.5, lastY = 0.5, velEased = 0;
        this._onPointerMove = (e) => {
            const rect = this.container.getBoundingClientRect();
            mouseX = (e.clientX - rect.left) / rect.width;
            mouseY = 1.0 - (e.clientY - rect.top) / rect.height;
        };
        this.container.addEventListener('pointermove', this._onPointerMove);

        this._tick = () => {
            if (!this.running) return;
            this.frameId = requestAnimationFrame(this._tick);

            const dx = mouseX - lastX, dy = mouseY - lastY;
            const velRaw = Math.min(Math.sqrt(dx * dx + dy * dy) * 14, 3.0);
            lastX = mouseX; lastY = mouseY;
            velEased += (velRaw - velEased) * 0.12;
            velEased *= 0.97;

            this.uniforms.uTime.value = this.clock.getElapsedTime();
            this.uniforms.uMouse.value.set(mouseX, mouseY);
            this.uniforms.uMouseVel.value = velEased;

            this.renderer.render(this.scene, this.camera);
        };
    }

    _observeVisibility() {
        if (!('IntersectionObserver' in window)) return;
        this._io = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) this.start();
            else this.stop();
        }, { threshold: 0.05 });
        this._io.observe(this.container);
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
        window.removeEventListener('resize', this._onResize);
        this.container.removeEventListener('pointermove', this._onPointerMove);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
