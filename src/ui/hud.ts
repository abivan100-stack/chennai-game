/** On-screen HUD. Plain DOM over the canvas (elements live in index.html). */
const $ = (id: string) => document.getElementById(id)!;

export const hud = {
  setWallet(rupees: number) {
    $('wallet').textContent = `₹ ${rupees.toLocaleString('en-IN')}`;
  },
  setMission(text: string) {
    $('mission').textContent = text;
  },
  /** Context prompt like "F - Get in"; null hides it. */
  setPrompt(text: string | null) {
    const el = $('prompt');
    if (el.textContent !== text) el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  },
  showPlayHint(show: boolean) {
    $('hint').style.display = show ? 'block' : 'none';
  },
};
