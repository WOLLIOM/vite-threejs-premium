export class LoadingScreen {
  constructor() {
    this.element = document.getElementById('loading-screen');
  }

  show() {
    if (this.element) this.element.classList.remove('hidden');
  }

  hide() {
    if (this.element) this.element.classList.add('hidden');
  }

  // Optionally update progress
  setProgress(value) {
    const bar = this.element?.querySelector('.loader-bar::after');
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, value))}%`;
  }
}