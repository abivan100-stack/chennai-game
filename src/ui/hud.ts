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
  /** Turn-by-turn banner (top centre); null hides it. */
  setNav(n: { arrow: string; dist: string; line: string; sub: string } | null) {
    const el = $('nav');
    el.style.display = n ? 'flex' : 'none';
    if (!n) return;
    const key = `${n.arrow}|${n.dist}|${n.line}|${n.sub}`;
    if (el.dataset.key === key) return;
    el.dataset.key = key;
    const text = Object.assign(document.createElement('div'), { className: 'nav-text' });
    text.append(Object.assign(document.createElement('b'), { textContent: `${n.dist} · ${n.line}` }), Object.assign(document.createElement('div'), { textContent: n.sub }));
    el.replaceChildren(Object.assign(document.createElement('div'), { className: 'nav-arrow', textContent: n.arrow }), text);
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
  /** Speedometer (null hides it); `gauge` = an extra small line (petrol / condition). */
  setSpeed(kmh: number | null, gauge = '') {
    const el = $('speed');
    el.style.display = kmh === null ? 'none' : 'block';
    if (kmh === null) return;
    const text = `${Math.round(kmh)} km/h`;
    if (el.firstChild?.textContent !== text || (el.lastElementChild?.textContent ?? '') !== gauge) {
      const small = Object.assign(document.createElement('div'), { textContent: gauge });
      small.style.cssText = 'font-size:14px;opacity:.9;text-align:right';
      el.replaceChildren(text, ...(gauge ? [small] : []));
    }
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
  /** Energy 0-100 (flashes when low). */
  setEnergy(energy: number, low: boolean) {
    $('energy-fill').style.width = `${Math.max(0, energy)}%`;
    $('energy').classList.toggle('low', low);
  },
  /** Order menu at a hotel / shop (null hides it). Rows: "1  Masala dosa  ₹60  +35⚡". */
  menu(m: { title: string; greet: string; keys?: string; rows: { label: string; price: number; energy?: number; note?: string; affordable: boolean }[] } | null) {
    const el = $('menu');
    el.style.display = m ? 'block' : 'none';
    if (!m) return;
    const div = (cls: string, text = '') => Object.assign(document.createElement('div'), { className: cls, textContent: text });
    const h3 = Object.assign(document.createElement('h3'), { textContent: m.title });
    const rows = m.rows.map((r, i) => {
      const row = div(r.affordable ? 'row' : 'row poor');
      row.append(div('', `${i + 1}. ${r.label}`), div('', [r.price ? `₹${r.price}` : '', r.note ?? `+${r.energy}⚡`].filter(Boolean).join(' · ')));
      return row;
    });
    el.replaceChildren(h3, div('greet', m.greet), ...rows, div('keys', m.keys ?? '1-4 order · E close'));
  },
  /** Health 0-100 and wanted stars 0-3. */
  setStatus(health: number, stars: number) {
    const fill = $('health-fill');
    fill.style.width = `${Math.max(0, health)}%`;
    fill.style.background = health > 50 ? '#3bc45a' : health > 25 ? '#f2b300' : '#e53935';
    const el = $('stars');
    const text = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('flash', stars > 0);
  },
  /** Big centred message (null hides it). */
  banner(title: string | null, sub = '') {
    const el = $('banner');
    el.style.display = title ? 'flex' : 'none';
    if (title) el.replaceChildren(Object.assign(document.createElement('b'), { textContent: title }), Object.assign(document.createElement('span'), { textContent: sub }));
  },
  /** Brief red flash when hit. */
  hurt() {
    const el = $('hurt');
    el.style.opacity = '0.55';
    setTimeout(() => (el.style.opacity = '0'), 120);
  },
  showPlayHint(show: boolean) {
    $('hint').style.display = show ? 'block' : 'none';
  },
};
