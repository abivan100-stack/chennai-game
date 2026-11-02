/** Full-screen loading overlay with a progress bar (markup in index.html). */
export const loadingScreen = {
  /** fraction 0..1 */
  progress(fraction: number) {
    document.getElementById('loading-fill')!.style.width = `${Math.round(fraction * 100)}%`;
  },
  done() {
    document.getElementById('loading')!.remove();
  },
  fail(message: string) {
    document.getElementById('loading-text')!.textContent = message;
  },
};
