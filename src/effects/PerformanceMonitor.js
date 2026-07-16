// ── Watches real frame rate and tells the rest of the app when the
// device is struggling, so effects can turn themselves down instead of
// staying maxed-out on a machine that can't afford it.
//
// This does NOT touch your 3D tour engine — it's a separate, cheap
// requestAnimationFrame loop just for measuring, plus a pub/sub so any
// effect (bubbles, background shader, whatever else gets added later)
// can opt in without this file needing to know about them.
export class PerformanceMonitor {
    constructor({ lowFpsThreshold = 40, sustainedMs = 1500, sampleWindow = 30 } = {}) {
        this.lowFpsThreshold = lowFpsThreshold;
        this.sustainedMs = sustainedMs;
        this.sampleWindow = sampleWindow;

        this.samples = [];
        this.lastTime = performance.now();
        this.lowSince = null;
        this.isLowPower = false;
        this.listeners = new Set();

        this._tick = this._tick.bind(this);
        requestAnimationFrame(this._tick);
    }

    // Callback receives `true` when entering low-power mode, `false` when recovering.
    onChange(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    get currentFps() {
        if (this.samples.length === 0) return 60;
        return this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    }

    _tick(now) {
        requestAnimationFrame(this._tick);
        const delta = now - this.lastTime;
        this.lastTime = now;
        if (delta <= 0) return;

        const fps = 1000 / delta;
        this.samples.push(fps);
        if (this.samples.length > this.sampleWindow) this.samples.shift();

        const avg = this.currentFps;

        if (avg < this.lowFpsThreshold) {
            if (this.lowSince === null) this.lowSince = now;
            if (!this.isLowPower && now - this.lowSince > this.sustainedMs) {
                this.isLowPower = true;
                this.listeners.forEach((fn) => fn(true, avg));
                console.log(`⚠️ Performance: sustained low FPS (${avg.toFixed(0)}) — dropping to low-power mode`);
            }
        } else {
            this.lowSince = null;
            // Require a healthier margin before recovering, so it doesn't
            // flicker back and forth right at the threshold.
            if (this.isLowPower && avg > this.lowFpsThreshold + 15) {
                this.isLowPower = false;
                this.listeners.forEach((fn) => fn(false, avg));
                console.log(`✅ Performance: recovered (${avg.toFixed(0)} fps) — restoring quality`);
            }
        }
    }
}

// One shared instance for the whole page — every effect subscribes to this.
export const performanceMonitor = new PerformanceMonitor();
