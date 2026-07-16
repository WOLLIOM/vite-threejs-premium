// ── GitHub Pages Base Path ──
const BASE_PATH = '/vite-threejs-premium';

// ── Use CDN imports ──
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
import { BubbleField } from './effects/BubbleField.js';
import { setupLighting } from './effects/Lighting.js';

// ── Real device detection (was hardcoded true before, forcing
// desktop users into mobile joystick + mobile HUD copy) ──
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || ('ontouchstart' in window);

// ── 🔥 CRITICAL: INLINE CSS FOR JOYSTICK + TOP BAR (bypass render-blocking) ──
function injectCriticalCSS() {
    const style = document.createElement('style');
    style.textContent = `
        /* ── Main landmark ── */
        main {
            display: block;
            width: 100vw;
            height: 100vh;
            overflow: hidden;
        }

        /* ── Top bar (scoped to the tour canvas, not the viewport — this
           used to be position:fixed at top:0, which put it in a permanent
           collision with the site's own fixed header. Absolute + a
           relatively-positioned #app anchors it to the tour section
           instead, so it only ever appears over the canvas.) ── */
        #topbar {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 64px;
            z-index: 9998;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 24px;
            background: linear-gradient(180deg, rgba(10,10,10,0.75), rgba(10,10,10,0));
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            font-family: 'Inter', system-ui, sans-serif;
            color: white;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.8s ease;
        }
        #topbar.visible { opacity: 1; }
        #topbar * { pointer-events: auto; }

        #topbar-left {
            display: flex;
            flex-direction: column;
            line-height: 1.2;
        }
        #topbar-title {
            font-size: 15px;
            font-weight: 600;
            letter-spacing: 0.3px;
        }
        #topbar-subtitle {
            font-size: 12px;
            opacity: 0.6;
            margin-top: 2px;
        }
        #topbar-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        #topbar-price {
            font-size: 15px;
            font-weight: 600;
            color: #f5f4f2;
        }
        #topbar-cta {
            background: rgba(255,255,255,0.12);
            border: 1px solid rgba(255,255,255,0.25);
            color: white;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            padding: 8px 18px;
            border-radius: 30px;
            cursor: pointer;
            transition: background 0.2s ease, transform 0.15s ease;
            white-space: nowrap;
        }
        #topbar-cta:hover {
            background: rgba(255,255,255,0.22);
            transform: translateY(-1px);
        }

        /* ── Room name tag ── */
        #room-tag {
            position: absolute;
            top: 84px;
            left: 24px;
            z-index: 998;
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 500;
            color: white;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(10px);
            padding: 8px 16px;
            border-radius: 30px;
            border: 1px solid rgba(255,255,255,0.1);
            opacity: 0;
            transform: translateY(-6px);
            transition: opacity 0.3s ease, transform 0.3s ease;
            pointer-events: none;
        }
        #room-tag.visible {
            opacity: 1;
            transform: translateY(0);
        }

        #joystick-container {
            position: absolute !important;
            bottom: 40px !important;
            left: 40px !important;
            width: 120px !important;
            height: 120px !important;
            border-radius: 60px !important;
            background: rgba(255,255,255,0.25) !important;
            backdrop-filter: blur(15px) !important;
            border: 3px solid rgba(255,255,255,0.4) !important;
            z-index: 9999999 !important;
            touch-action: none !important;
            user-select: none !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-direction: column !important;
            color: white !important;
            font-family: system-ui !important;
            font-size: 12px !important;
            letter-spacing: 1px !important;
            box-shadow: 0 0 40px rgba(255,255,255,0.1) !important;
            pointer-events: auto !important;
            opacity: 1 !important;
        }
        #joystick-knob {
            position: absolute !important;
            top: 50% !important;
            left: 50% !important;
            width: 50px !important;
            height: 50px !important;
            border-radius: 25px !important;
            background: rgba(255,255,255,0.4) !important;
            transform: translate(-50%, -50%) !important;
            pointer-events: none !important;
            box-shadow: 0 0 30px rgba(255,255,255,0.2) !important;
            transition: none !important;
        }
        #hud {
            position: absolute;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255,255,255,0.6);
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(8px);
            padding: 10px 24px;
            border-radius: 40px;
            border: 1px solid rgba(255,255,255,0.08);
            pointer-events: none;
            user-select: none;
            z-index: 999;
            font-size: 13px;
            text-align: center;
            transition: opacity 1s;
            font-family: system-ui;
        }
        #hud.hidden { opacity: 0; }

        /* ── Floating Exit button ── always on top of the canvas, works
           identically on desktop and phone. This is the one obvious way
           out — no hunting for Escape, no scrolling to find a button
           that scrolled out of view. */
        #floating-exit-btn {
            position: absolute;
            top: 16px;
            right: 16px;
            z-index: 10000000;
            display: none;
            align-items: center;
            gap: 8px;
            padding: 10px 18px;
            border-radius: 30px;
            border: 1px solid rgba(255,255,255,0.25);
            background: rgba(10,10,10,0.6);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            color: white;
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            pointer-events: auto;
            touch-action: manipulation;
            transition: background 0.2s ease, transform 0.15s ease;
        }
        #floating-exit-btn.visible { display: flex; }
        #floating-exit-btn:hover,
        #floating-exit-btn:active {
            background: rgba(255,255,255,0.16);
            transform: translateY(-1px);
        }
        #floating-exit-btn svg { flex-shrink: 0; }

        /* ── Frame the 3D canvas so it reads as one deliberate panel of
           the page instead of a bare rectangle sitting on top of it. */
        #tour {
            position: relative;
        }
        #app {
            border-radius: 0;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
        }
        @media (min-width: 900px) {
            #tour {
                padding: 0 clamp(16px, 3vw, 48px);
            }
            #app {
                border-radius: 18px;
                overflow: hidden;
                box-shadow: 0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.08);
            }
        }

        /* ── Loading screen accessibility ── */
        #loading-screen {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #0a0a0a;
            transition: opacity 0.8s ease;
            color: white;
            font-family: system-ui;
        }
        #loading-screen.hidden {
            opacity: 0;
            pointer-events: none;
        }
        .loader-text {
            font-size: 16px;
            opacity: 0.7;
            margin-top: 20px;
        }
        .loader-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255,255,255,0.1);
            border-top-color: #f5f4f2;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        /* ── Widget info panel (accessibility) ── */
        #widget-panel {
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.85);
            backdrop-filter: blur(20px);
            padding: 20px 28px;
            border-radius: 16px;
            color: white;
            max-width: 400px;
            width: 90%;
            z-index: 1000;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            display: none;
            border: 1px solid rgba(255,255,255,0.25);
            transition: all 0.3s ease;
            font-family: system-ui;
        }
        #widget-panel.visible { display: block; animation: slideUp 0.3s ease-out; }
        #widget-panel h3 { margin: 0 0 6px 0; font-size: 18px; color: white; }
        #widget-panel p { margin: 0; opacity: 0.8; font-size: 14px; line-height: 1.5; color: white; }
        #widget-panel .close-btn {
            margin-top: 12px;
            padding: 8px 20px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: #0a0a0a;
            background: #f5f4f2;
            transition: opacity 0.2s;
        }
        #widget-panel .close-btn:hover {
            opacity: 0.8;
        }

        @keyframes slideUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(style);
}

// ── 🔥 INJECT CRITICAL CSS IMMEDIATELY ──
injectCriticalCSS();

// ── Preloader (page-level, separate from the 3D loading screen) ──
// Purely cosmetic — counts up, cycles a "hello" through several
// languages, then hides. Doesn't block the 3D asset load underneath it,
// which starts immediately regardless — this just gives a slow
// connection something intentional to look at instead of a bare spinner.
const GREETINGS = ['Hello', 'Bonjour', 'Hola', 'Ciao', 'こんにちは', '你好', 'Hallo', 'Olá', '안녕하세요', 'Привет', 'مرحبا', 'Namaste'];

function runPreloader() {
    const el = document.getElementById('preloader');
    const num = document.getElementById('preloader-num');
    const greetingEl = document.getElementById('preloader-greeting');
    if (!el || !num) return;

    // Cycle the greeting word independently of the counter, on its own
    // short interval, so it keeps moving even if loading itself is slow.
    let gi = 0;
    if (greetingEl) {
        greetingEl.textContent = GREETINGS[0];
        greetingEl.classList.add('show');
    }
    const greetingTimer = setInterval(() => {
        gi = (gi + 1) % GREETINGS.length;
        if (!greetingEl) return;
        greetingEl.classList.remove('show');
        // Force a reflow so the fade-in animation replays on each swap.
        void greetingEl.offsetWidth;
        greetingEl.textContent = GREETINGS[gi];
        greetingEl.classList.add('show');
    }, 260);

    const start = performance.now();
    const minDuration = 1600; // floor, so it never flashes by too fast to read
    const maxWait = 12000;    // ceiling, so a stalled load doesn't spin forever
    let assetsReady = window.simaxAssetsReady === true;
    window.addEventListener('simax:assetsReady', () => { assetsReady = true; }, { once: true });

    function tick(now) {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / minDuration);
        num.textContent = Math.floor(t * (assetsReady ? 100 : 92)); // holds just under 100 until real assets are actually in
        const done = (t >= 1 && assetsReady) || elapsed >= maxWait;
        if (!done) {
            requestAnimationFrame(tick);
        } else {
            num.textContent = 100;
            clearInterval(greetingTimer);
            el.classList.add('hidden');
        }
    }
    requestAnimationFrame(tick);
}
runPreloader();

// ── Custom cursor: lerped follower with hover/magnetic states ──
function setupCustomCursor() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) return;

    const cursor = document.getElementById('cursor');
    if (!cursor) return;
    document.body.classList.add('has-custom-cursor');

    let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;
    let curX = mouseX, curY = mouseY;

    window.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        cursor.classList.add('visible');
    });

    function raf() {
        // Lerp damping — gives the ring weight/trailing inertia instead
        // of snapping straight to the pointer.
        curX += (mouseX - curX) * 0.18;
        curY += (mouseY - curY) * 0.18;
        cursor.style.transform = `translate(${curX}px, ${curY}px) translate(-50%, -50%)`;
        requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    document.querySelectorAll('a, button, .magnetic, input, textarea').forEach((el) => {
        el.addEventListener('mouseenter', () => cursor.classList.add('hover'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('hover'));
    });
}
setupCustomCursor();

// ── Magnetic buttons: pull toward the cursor within a small radius ──
function setupMagneticButtons() {
    document.querySelectorAll('.magnetic').forEach((el) => {
        el.addEventListener('mousemove', (e) => {
            const rect = el.getBoundingClientRect();
            const mx = e.clientX - (rect.left + rect.width / 2);
            const my = e.clientY - (rect.top + rect.height / 2);
            el.style.setProperty('--mx', (mx * 0.25).toFixed(1));
            el.style.setProperty('--my', (my * 0.25).toFixed(1));
        });
        el.addEventListener('mouseleave', () => {
            el.style.setProperty('--mx', 0);
            el.style.setProperty('--my', 0);
        });
    });
}
setupMagneticButtons();

// ── Scroll-triggered reveals for section content ──
function setupScrollReveals() {
    const targets = document.querySelectorAll('.reveal-on-scroll');
    if (!('IntersectionObserver' in window) || targets.length === 0) {
        targets.forEach((t) => t.classList.add('in-view'));
        return;
    }
    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });
    targets.forEach((t) => io.observe(t));
}
setupScrollReveals();

// ── Animated stat counters (60fps / <3s / 0 apps) ──
function setupCounters() {
    const els = document.querySelectorAll('[data-count]');
    if (els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            io.unobserve(entry.target);
            const el = entry.target;
            const target = parseInt(el.dataset.count, 10);
            const prefix = el.dataset.prefix || '';
            const start = performance.now();
            const duration = 900;
            function tick(now) {
                const t = Math.min(1, (now - start) / duration);
                el.textContent = prefix + Math.floor(t * target);
                if (t < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    }, { threshold: 0.5 });
    els.forEach((el) => io.observe(el));
}
setupCounters();

// ── Landing page → 3D tour handoff ──
// The 3D scene loads in the background the whole time (init() below runs
// immediately), but stays visually hidden and non-interactive until the
// visitor actively chooses to enter — so nobody accidentally pointer-locks
// into a canvas they haven't asked for, and the landing page's own scroll
// isn't fighting the WASD/joystick listeners underneath it.
//
// The bug this fixes: pointer lock captures the mouse, so once a visitor
// clicked into the canvas there was no way back to the rest of the page —
// wheel-scroll doesn't reach the document while the pointer is locked, and
// there was no visible way out except hitting Escape and hoping. Exiting
// now has one obvious control (the "Exit Tour" button, always visible once
// you're in the tour section) that releases pointer lock AND scrolls back
// up in the same action.
function setupLandingHandoff() {
    const app = document.getElementById('app');
    const tourSection = document.getElementById('tour');
    const enterBtn = document.getElementById('enter-tour-btn');
    const exitBtn = document.getElementById('exit-tour-btn');
    const navToggle = document.getElementById('nav-toggle');
    const siteNav = document.querySelector('.site-nav');

    if (app) {
        app.style.pointerEvents = 'none';
    }

    // ── Floating exit button — created here so it exists regardless of
    // whether the static #exit-tour-btn markup in the hint bar is
    // visible or scrolled away. This is the one control that's ALWAYS
    // on screen the moment you're inside the tour, on desktop and phone
    // alike, so "how do I get out" never has to be a guess.
    const floatingExit = document.createElement('button');
    floatingExit.id = 'floating-exit-btn';
    floatingExit.type = 'button';
    floatingExit.setAttribute('aria-label', 'Exit tour');
    floatingExit.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
        <span>Exit</span>
    `;
    (app || document.body).appendChild(floatingExit);

    function enterTour() {
        if (app) app.style.pointerEvents = 'auto';
        tourSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => {
            app?.focus();
            // ── Engage mouse-look right away on desktop ──
            // Movement (WASD) never needed pointer lock, but look/turn
            // does (see PlayerController.onMouseMove, which checks
            // isLocked against `this.domElement` — and domElement is
            // renderer.domElement, the <canvas>, NOT the #app wrapper
            // div). Locking #app here was the actual bug: pointerlockchange
            // fired with document.pointerLockElement === the canvas,
            // which never equals #app, so isLocked stayed false forever
            // and onMouseMove silently no-opped on every call. Locking
            // the canvas directly (same element PlayerController was
            // constructed with) is what actually makes isLocked flip true.
            if (!isMobile && renderer?.domElement?.requestPointerLock) {
                renderer.domElement.requestPointerLock();
            }
        }, 450);
        floatingExit.classList.add('visible');
    }

    function exitTour() {
        if (document.pointerLockElement) document.exitPointerLock();
        document.getElementById('site-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        floatingExit.classList.remove('visible');
    }

    enterBtn?.addEventListener('click', enterTour);
    exitBtn?.addEventListener('click', exitTour);
    floatingExit.addEventListener('click', exitTour);

    // Belt-and-suspenders: if the browser exits pointer lock on its own
    // (Escape key), leave the page scrollable rather than assuming the
    // visitor also wants to be scrolled away from the tour.
    document.addEventListener('pointerlockchange', () => {
        if (!document.pointerLockElement && app) {
            app.style.pointerEvents = 'auto';
        }
    });

    // If the visitor scrolls themselves back up past the tour (without
    // hitting Exit), release pointer lock and hand control back to the
    // page — otherwise the mouse stays trapped mid-scroll with nothing
    // visibly happening. If they scroll DOWN into the tour on their own
    // (skipping the "Enter the Space" button entirely), #app still has
    // pointer-events: none from the top of this function, so clicking
    // inside the canvas does nothing and pointer lock never engages —
    // this same observer turns clicks on the moment the section is
    // actually in view, so a click there behaves the same either way.
    if ('IntersectionObserver' in window && tourSection) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    if (app) app.style.pointerEvents = 'auto';
                    floatingExit.classList.add('visible');
                } else {
                    if (document.pointerLockElement) document.exitPointerLock();
                    if (app) app.style.pointerEvents = 'none';
                    floatingExit.classList.remove('visible');
                }
            });
        }, { threshold: 0.15 });
        io.observe(tourSection);
    }

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
        link.addEventListener('click', (e) => {
            const targetId = link.getAttribute('href');
            const target = targetId && document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                if (document.pointerLockElement) document.exitPointerLock();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            siteNav?.classList.remove('open');
            navToggle?.setAttribute('aria-expanded', 'false');
        });
    });

    navToggle?.addEventListener('click', () => {
        const isOpen = siteNav?.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', String(!!isOpen));
    });
}
setupLandingHandoff();

// ── Top bar ──
// Edit these three fields to match the listing. Everything else (styling,
// blur, fade-in) is handled for you.
const LISTING = {
    title: '128 Maple Ridge Drive',
    subtitle: 'Calgary, AB · 4 bed · 3 bath · 2,450 sqft',
    price: '$1,249,000',
};

function createTopBar() {
    const bar = document.createElement('div');
    bar.id = 'topbar';
    bar.setAttribute('role', 'banner');
    bar.innerHTML = `
        <div id="topbar-left">
            <div id="topbar-title">${LISTING.title}</div>
            <div id="topbar-subtitle">${LISTING.subtitle}</div>
        </div>
        <div id="topbar-right">
            <div id="topbar-price">${LISTING.price}</div>
            <button id="topbar-cta" type="button">Contact Agent</button>
        </div>
    `;
    (document.getElementById('app') || document.body).appendChild(bar);

    bar.querySelector('#topbar-cta').addEventListener('click', () => {
        // Wire this up to whatever contact flow you actually use —
        // a mailto link, a modal, a Calendly embed, etc.
        window.location.href = 'mailto:agent@example.com?subject=Inquiry about ' + encodeURIComponent(LISTING.title);
    });

    return bar;
}

function createRoomTag() {
    const tag = document.createElement('div');
    tag.id = 'room-tag';
    tag.setAttribute('role', 'status');
    tag.setAttribute('aria-live', 'polite');
    (document.getElementById('app') || document.body).appendChild(tag);
    return tag;
}

// ── 🔥 CREATE JOYSTICK (mobile only) ──
function createJoystickEarly() {
    console.log('🎮 Creating joystick EARLY...');

    const container = document.createElement('div');
    container.id = 'joystick-container';
    container.setAttribute('role', 'button');
    container.setAttribute('aria-label', 'Movement joystick - drag to move around');
    container.setAttribute('tabindex', '0');
    container.innerHTML = `
        <div style="font-size: 20px; margin-bottom: 4px;" aria-hidden="true">🎮</div>
        <div style="opacity: 0.7;" aria-hidden="true">MOVE</div>
    `;

    const knob = document.createElement('div');
    knob.id = 'joystick-knob';
    knob.setAttribute('aria-hidden', 'true');
    container.appendChild(knob);
    (document.getElementById('app') || document.body).appendChild(container);

    console.log('✅ Joystick created EARLY!');

    window.joystickContainer = container;
    window.joystickKnob = knob;
    window.joystickState = { x: 0, y: 0 };

    let joystickCenterX = 0, joystickCenterY = 0, joystickRadius = 40;

    // ── Touch events ──
    container.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
            const rect = container.getBoundingClientRect();
            joystickCenterX = rect.left + rect.width / 2;
            joystickCenterY = rect.top + rect.height / 2;
            joystickRadius = rect.width / 2 - 10;
            handleJoystickMove(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    container.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        if (touch) {
            handleJoystickMove(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
        e.preventDefault();
        resetJoystick();
    }, { passive: false });

    container.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        resetJoystick();
    }, { passive: false });

    // ── Mouse events (handy for testing mobile mode on desktop) ──
    let isDragging = false;
    container.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = container.getBoundingClientRect();
        joystickCenterX = rect.left + rect.width / 2;
        joystickCenterY = rect.top + rect.height / 2;
        joystickRadius = rect.width / 2 - 10;
        handleJoystickMove(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            handleJoystickMove(e.clientX, e.clientY);
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            resetJoystick();
        }
    });

    function handleJoystickMove(clientX, clientY) {
        const dx = clientX - joystickCenterX;
        const dy = clientY - joystickCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const maxDist = joystickRadius;

        let nx = 0, ny = 0;
        if (distance > 0) {
            const clamped = Math.min(distance, maxDist);
            const ratio = clamped / maxDist;
            nx = (dx / distance) * ratio;
            ny = (dy / distance) * ratio;
        }

        window.joystickState.x = nx;
        window.joystickState.y = ny;

        if (window.joystickKnob) {
            window.joystickKnob.style.transform = `translate(calc(-50% + ${nx * maxDist}px), calc(-50% + ${ny * maxDist}px))`;
        }

        if (window.playerController) {
            const threshold = 0.1;
            window.playerController.moveForward = ny < -threshold;
            window.playerController.moveBackward = ny > threshold;
            window.playerController.moveLeft = nx < -threshold;
            window.playerController.moveRight = nx > threshold;
            window.playerController.sprinting = Math.abs(ny) > 0.8;
        }
    }

    function resetJoystick() {
        window.joystickState.x = 0;
        window.joystickState.y = 0;

        if (window.joystickKnob) {
            window.joystickKnob.style.transform = 'translate(-50%, -50%)';
        }

        if (window.playerController) {
            window.playerController.moveForward = false;
            window.playerController.moveBackward = false;
            window.playerController.moveLeft = false;
            window.playerController.moveRight = false;
            window.playerController.sprinting = false;
        }
    }
}

// ── Hero bubble field — several water-bubble-like shader circles,
// varied sizes, positioned toward the left and right of the hero panel
// instead of one centered orb. One shared renderer draws all of them. ──
const heroOrbEl = document.getElementById('hero-orb');
if (heroOrbEl) {
    new BubbleField(heroOrbEl, [
        { xPct: 0.12, yPct: 0.30, sizePx: 220, phase: 0.0 },
        { xPct: 0.08, yPct: 0.68, sizePx: 120, phase: 1.4 },
        { xPct: 0.22, yPct: 0.85, sizePx: 70,  phase: 2.7 },
        { xPct: 0.88, yPct: 0.22, sizePx: 180, phase: 0.9 },
        { xPct: 0.93, yPct: 0.58, sizePx: 95,  phase: 3.6 },
        { xPct: 0.80, yPct: 0.80, sizePx: 55,  phase: 5.1 },
    ]);
}

// ── Only build the joystick on touch devices — desktop no longer
// gets a movement stick it can't use with a mouse ──
if (isMobile) {
    console.log('🚀 Creating joystick before Three.js loads...');
    createJoystickEarly();
}

// ── Now load Three.js ──
const loadingScreen = new LoadingScreen();
loadingScreen.show();

const container = document.getElementById('app');
const engine = new Engine(container);
const { scene, camera, renderer } = engine;

// ── 🔥 PRE-COMPILE SHADERS BEFORE LOADING ASSETS ──
engine.precompileShaders(scene, camera);

// ── 🔥 WARM UP RENDERER ──
engine.warmupRenderer(scene, camera);

// ── 🔥 PASS BASE_PATH TO RealEstate ──
const realEstate = new RealEstate(scene, renderer, camera, BASE_PATH, isMobile);
let player = null;

async function init() {
    try {
        console.log('📦 Loading assets...');
        await realEstate.load();

        console.log('✅ Assets loaded');
        window.simaxAssetsReady = true;
        window.dispatchEvent(new Event('simax:assetsReady'));

        // ── Lighting + shadows ──
        // Sized to the model's real bounding box (not a hardcoded guess),
        // so the shadow camera actually covers the whole house.
        let lightBounds;
        if (realEstate.model) {
            const box = new THREE.Box3().setFromObject(realEstate.model);
            const boxCenter = new THREE.Vector3();
            const boxSize = new THREE.Vector3();
            box.getCenter(boxCenter);
            box.getSize(boxSize);
            lightBounds = {
                center: { x: boxCenter.x, z: boxCenter.z },
                size: { width: boxSize.x, depth: boxSize.z },
            };
        }
        setupLighting(scene, renderer, lightBounds, isMobile);

        // ── Static shadows ──
        // Nothing in this scene moves except the camera, so the shadow
        // map only needs to be computed once — not every single frame.
        // This is what keeps "better shadows" from meaning "heavier":
        // shadow cost here is paid once at load, not 60 times a second.
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;

        // ── Re-run shader/texture warmup now that the real model,
        // materials, and environment map exist, using the ASYNC compile
        // path so this doesn't become one giant blocking main-thread task
        // — on a phone, renderer.compile() (sync) can take 3-4x longer
        // than on desktop and would show up as a multi-second freeze.
        // compileAsync() spreads that work without locking the thread. ──
        await engine.precompileShadersAsync(scene, camera);
        engine.warmupRenderer(scene, camera);

        // ── 🔥 OPTIMIZATION: Enable frustum culling ──
        if (realEstate.model) {
            engine.enableFrustumCulling(realEstate.model);
        }

        // Real ground height, derived from the model's own bounding box
        // (see RealEstate.js) — not a hardcoded guess.
        const groundY = realEstate.getGroundHeight();
        console.log(`📍 Ground Y: ${groundY}`);

        player = new PlayerController(camera, renderer.domElement, groundY, isMobile);
        window.playerController = player; // joystick needs this reference
        player.enable();

        // ── 🔥 PASS COLLISION MESHES TO PLAYER ──
        const collisionMeshes = realEstate.getCollisionMeshes();
        if (collisionMeshes && collisionMeshes.length > 0) {
            player.setCollisionMeshes(collisionMeshes);
            console.log(`✅ ${collisionMeshes.length} collision meshes passed to player!`);
        }

        // ── Find a clear spawn point ──
        // Start near the center of the house and spiral outward in a grid
        // until we find a spot canMoveTo() actually accepts. This is what
        // catches the "spawned inside a table" problem automatically,
        // without needing to hand-pick exact coordinates from the GLB.
        function findClearSpawn(preferredX, preferredZ) {
            const eyeY = groundY + player.playerHeight;
            const step = 0.5;
            const maxRing = 12; // searches up to 6 units out

            if (player.canMoveTo(preferredX, groundY, preferredZ)) {
                return { x: preferredX, z: preferredZ };
            }

            for (let ring = 1; ring <= maxRing; ring++) {
                const r = ring * step;
                const points = 8 * ring; // more samples on bigger rings
                for (let i = 0; i < points; i++) {
                    const angle = (i / points) * Math.PI * 2;
                    const x = preferredX + Math.cos(angle) * r;
                    const z = preferredZ + Math.sin(angle) * r;
                    if (player.canMoveTo(x, groundY, z)) {
                        return { x, z };
                    }
                }
            }
            // Fallback: nothing found nearby, use the original guess anyway
            console.warn('⚠️ Could not find a clear spawn point nearby — using default');
            return { x: preferredX, z: preferredZ };
        }

        // ── Verified against the actual collision.glb geometry:
        // there's a table/island collision box sitting almost exactly at
        // the origin (x: -1 to 1, z: -1.49 to 2.93) — that's what you were
        // spawning inside. (0, -4) sits in the same open room but about
        // 2.5 units clear of it and away from every wall. ──
        const preferredSpawnX = 0;
        const preferredSpawnZ = -4;
        const spawn = findClearSpawn(preferredSpawnX, preferredSpawnZ);

        camera.position.set(spawn.x, groundY + player.playerHeight, spawn.z);
        camera.lookAt(0, groundY + player.playerHeight, 0);

        console.log(`📍 Player spawned at: (${spawn.x.toFixed(2)}, ${groundY}, ${spawn.z.toFixed(2)})`);

        // Ensure joystick is visible (mobile only)
        const joystick = document.getElementById('joystick-container');
        if (joystick) {
            joystick.style.opacity = '1';
            joystick.style.pointerEvents = 'auto';
        }

        // ── Top bar + room tag ──
        const topbar = createTopBar();
        const roomTag = createRoomTag();

        // Hook into the existing widget-proximity system so the room
        // tag reflects whichever space the visitor is standing in,
        // without duplicating any proximity logic.
        const originalCheckProximity = realEstate.checkProximity.bind(realEstate);
        realEstate.checkProximity = (playerPosition) => {
            originalCheckProximity(playerPosition);
            const active = realEstate.widgetData.find((_, i) =>
                realEstate.interactivePoints.some(p =>
                    p.userData.index === i &&
                    p.geometry?.type === 'SphereGeometry' &&
                    p.material.emissiveIntensity > 0.8
                )
            );
            if (active) {
                roomTag.textContent = active.title;
                roomTag.classList.add('visible');
            } else {
                roomTag.classList.remove('visible');
            }
        };

        setTimeout(() => {
            loadingScreen.hide();
            showHUD();
            topbar.classList.add('visible');
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
    const hud = document.createElement('div');
    hud.id = 'hud';
    hud.setAttribute('role', 'status');
    hud.setAttribute('aria-live', 'polite');

    hud.innerHTML = isMobile
        ? '📱 Use joystick to move · Touch screen to look around'
        : '🖱️ Click to lock · WASD move · Walk near markers for info';

    (document.getElementById('app') || document.body).appendChild(hud);
    setTimeout(() => hud.classList.add('hidden'), 6000);
}

init();

// ── Animation Loop ──
function animate() {
    requestAnimationFrame(animate);
    if (player) {
        player.update();

        const playerPos = camera.position.clone();
        if (realEstate.checkProximity) {
            realEstate.checkProximity(playerPos);
        }
    }

    if (realEstate.interactivePoints) {
        const time = Date.now() * 0.001;
        realEstate.interactivePoints.forEach((point, index) => {
            if (point.userData.isWidget && point.geometry && point.geometry.type === 'SphereGeometry') {
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