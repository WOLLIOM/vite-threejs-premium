// Placeholder for loading textures/models with progress
export class AssetLoader {
  load(callback) {
    // Simulate load
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        callback(progress);
      } else {
        callback(progress);
      }
    }, 200);
  }
}