/** On-screen HUD. Plain DOM over the canvas (elements live in index.html). */
const $ = (id: string) => document.getElementById(id)!;
const SAY_SECONDS = 4;
let sayTimer = 0;

export const hud = {
  /** Cash, and the loan still owed to the moneylender. */
  setWallet(rupees: number, loan = 0) {
    $('wallet').textContent = `₹ ${rupees.toLocaleString('en-IN')}`;
    if (loan > 0) $('wallet').append(Object.assign(document.createElement('div'), { className: 'loan', textContent: `Kadan ₹${loan.toLocaleString('en-IN')}` }));
  },
  setMission(text: string) {
    const el = $('mission');
    if (el.textContent !== text) el.textContent = text;
  },
  /** Context prompt like "F - Get in"; null hides it. */
  setPrompt(text: string | null) {
    const el = $('prompt');
    if (el.textContent !== text) el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  },
  /** Speedometer while driving; null hides it. */
  setSpeed(kmh: number | null) {
    const el = $('speed');
    el.style.display = kmh === null ? 'none' : 'block';
    if (kmh !== null) el.textContent = `${Math.round(kmh)} km/h`;
  },
  /** Speech line at the bottom of the screen: "Name: text". Hides itself after a few seconds. */
  say(name: string, text: string) {
    const el = $('dialogue');
    const who = document.createElement('b');
    who.textContent = `${name}: `;
    el.replaceChildren(who, text); // text nodes, never innerHTML
    el.style.display = 'block';
    clearTimeout(sayTimer);
    sayTimer = window.setTimeout(() => (el.style.display = 'none'), SAY_SECONDS * 1000);
  },
  showPlayHint(show: boolean) {
    $('hint').style.display = show ? 'block' : 'none';
  },
};
