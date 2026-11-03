import type { Economy } from '../missions/economy';
import { DAILY_DUE, LOAN_TOTAL } from '../missions/economy';
import type { TaxiJobs } from '../missions/jobs';
import type { Weather } from '../world/weather';
import { stopPoint } from '../missions/data';
import { MAP_LAND, MAP_PPM, MAP_SEA, drawCrop, drawOverlay, drawPin, drawRoute, mapPx, type Dest, type PoiCat, type TownMap } from './mapArt';
import { route, routeLength } from '../missions/route';
import { BOUNDS, X_LINES, Z_LINES } from '../world/layout';
import { fmtDist } from './bigMap';

type App = 'home' | 'orders' | 'map' | 'wallet' | 'messages' | 'weather';

export interface PhoneDeps {
  jobs: TaxiJobs;
  economy: Economy;
  weather: Weather;
  town: TownMap;
  police: () => { x: number; z: number }[];
  clock: () => string;
  player: () => { x: number; z: number; yaw: number };
  auto: () => { x: number; z: number };
  /** Road route to the current pickup / drop-off, or null. */
  guide: () => { x: number; z: number }[] | null;
  /** Pay this much towards the loan (main posts the lender's reply). */
  pay: (amount: number) => void;
  /** Wipe the save and start a new game. */
  newGame: () => void;
  /** Pay Kandasamy to get the seized auto back. */
  redeem: () => void;
  /** Net banking: move money between the bank and your pocket. */
  bank: (op: 'deposit' | 'withdraw', amount: number) => void;
  /** Camera yaw (the map turns with it, like the minimap). */
  view: () => number;
  /** Everywhere you can navigate to. */
  places: () => Place[];
  dest: () => Dest | null;
  navigate: (d: Dest | null) => void;
  /** The next instruction, or null when not going anywhere. */
  navInfo: () => NavInfo | null;
}

export interface Place extends Dest {
  cat: PoiCat;
  icon: string;
  colour: string;
}
export interface NavInfo {
  arrow: string;
  dist: string;
  line: string;
  sub: string;
}

const PM_W = 252; // phone map size (CSS px)
const PM_H = 250;
/** Search chips: key, label, which place kinds they list. */
const SEARCH: [string, string, PoiCat[]][] = [
  ['fuel', '⛽ Petrol', ['fuel']],
  ['mechanic', '🔧 Mechanic', ['mechanic']],
  ['atm', '₹ ATM', ['atm']],
  ['medical', '✚ Medical', ['medical']],
  ['food', '🍛 Food', ['food']],
  ['shop', '🛍 Shops', ['shop']],
  ['place', '★ Places', ['place']],
  ['transit', '🚉 Transit', ['transport', 'stop', 'police']],
];

interface Message {
  from: string;
  text: string;
  time: string;
  read: boolean;
}

const REFRESH_MS = 500;
const TOAST_MS = 4000;

/** Tiny element helper: h('div', { class: 'x' }, 'text', child). Text is always set as text, never HTML. */
function h(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * The player's phone (P). Home screen with badges, and apps: Orders (ride requests to accept),
 * Map (whole town + where to go), Wallet (earnings, repay the loan), Messages (Chithappa,
 * Kandasamy), Weather (live Chennai weather). Plain DOM, refreshed twice a second while open.
 */
export class Phone {
  isOpen = false;
  private app: App = 'home';
  private readonly el: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly status: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly deps: PhoneDeps;
  private readonly messages: Message[] = [];
  private readonly mapCanvas = h('canvas', { class: 'phone-map', style: `width:${PM_W}px;height:${PM_H}px` }) as HTMLCanvasElement;
  private mapZoom = 2.6; // px per metre
  private northUp = false;
  private searchCat: string | null = null;
  private readonly navArrow = h('div', { class: 'pm-arrow' });
  private readonly navDist = h('div', { class: 'pm-dist' });
  private readonly navLine = h('div', { class: 'pm-line' });
  private readonly navSub = h('div', { class: 'muted' });
  private readonly navEnd = h('button', { class: 'pm-end' }, 'End');
  private readonly navBox = h('div', { class: 'pm-nav' }, this.navArrow, h('div', { class: 'pm-navtext' }, this.navDist, this.navLine, this.navSub), this.navEnd);
  private last = 0;
  private toastTimer = 0;

  constructor(deps: PhoneDeps) {
    this.deps = deps;
    this.navEnd.onclick = () => {
      this.deps.navigate(null);
      this.render();
    };
    this.status = h('div', { class: 'phone-status' });
    this.screen = h('div', { class: 'phone-screen' });
    const home = h('button', { class: 'phone-home', title: 'Home' });
    home.onclick = () => this.show('home');
    this.el = h('div', { id: 'phone' }, this.status, this.screen, home);
    this.toast = h('div', { id: 'phone-toast' });
    document.body.append(this.el, this.toast);
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.el.classList.toggle('open', this.isOpen);
    if (this.isOpen) {
      document.exitPointerLock(); // free the mouse for tapping; click the game to look around again
      this.render();
    }
  }

  /** New message: badge + a toast at the top of the screen. */
  addMessage(from: string, text: string) {
    this.messages.unshift({ from, text, time: this.deps.clock(), read: false });
    this.notify(`💬 ${from}: ${text}`);
    if (this.isOpen) this.render();
  }

  notify(text: string) {
    this.toast.textContent = `${text}   (P: phone)`;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), TOAST_MS);
  }

  update(now: number) {
    if (!this.isOpen) return;
    if (this.app === 'map') this.tickMap(); // live, every frame
    if (now - this.last < REFRESH_MS) return;
    this.last = now;
    // The map app's DOM (chips, results) only changes when you tap something.
    if (this.app === 'map') this.renderStatus();
    else this.render();
  }

  /** Open the Map app (e.g. from a "where's the bunk?" hint). */
  openMap(cat: string | null = null) {
    this.searchCat = cat;
    if (!this.isOpen) this.toggle();
    this.show('map');
  }

  private show(app: App) {
    this.app = app;
    if (app === 'messages') this.messages.forEach((m) => (m.read = true));
    this.render();
  }

  private renderStatus() {
    const { weather, clock } = this.deps;
    this.status.replaceChildren(h('span', {}, clock()), h('span', {}, weather.label), h('span', {}, '📶 87%'));
  }

  private render() {
    this.renderStatus();
    const apps: Record<App, () => HTMLElement> = {
      home: () => this.home(),
      orders: () => this.orders(),
      map: () => this.map(),
      wallet: () => this.wallet(),
      messages: () => this.messagesApp(),
      weather: () => this.weatherApp(),
    };
    const body = apps[this.app]();
    // Keep the scroll position of lists across refreshes.
    const scroll = this.screen.scrollTop;
    this.screen.replaceChildren(body);
    this.screen.scrollTop = scroll;
  }

  // ---- Apps -------------------------------------------------------------------------------

  private home() {
    const unread = this.messages.filter((m) => !m.read).length;
    const { jobs, economy } = this.deps;
    const icon = (app: App, emoji: string, name: string, badge = 0) => {
      const b = h('button', { class: 'phone-app' }, h('span', { class: 'phone-icon' }, emoji), name);
      if (badge) b.append(h('span', { class: 'phone-badge' }, String(badge)));
      b.onclick = () => this.show(app);
      return b;
    };
    return h(
      'div',
      {},
      h('div', { class: 'phone-title' }, 'Auto Anna'),
      h('div', { class: 'phone-sub' }, `Cash ${rupees(economy.cash)} · Kadan ${rupees(economy.loan)}`),
      h(
        'div',
        { class: 'phone-grid' },
        icon('orders', '🛺', 'Orders', jobs.busy ? 0 : jobs.orders.length),
        icon('map', '🗺️', 'Map'),
        icon('wallet', '👛', 'Wallet', economy.dueToday > 0 ? 1 : 0),
        icon('messages', '💬', 'Messages', unread),
        icon('weather', '🌦️', 'Weather'),
      ),
    );
  }

  private orders() {
    const { jobs } = this.deps;
    const list = h('div', {}, h('div', { class: 'phone-title' }, `Orders (${jobs.orders.length})`));
    if (jobs.phase === 'off') {
      list.append(h('p', {}, 'Get into the auto to go online.'));
      return list;
    }
    if (jobs.busy) list.append(h('div', { class: 'phone-card current' }, `On a ride: ${jobs.mission}`));
    const me = this.deps.auto();
    for (const o of jobs.orders) {
      const p = stopPoint(o.from, 'kerb');
      const away = Math.round(Math.hypot(p.x - me.x, p.z - me.z));
      const accept = h('button', { class: 'phone-btn' }, jobs.busy ? 'Busy' : 'Accept');
      if (jobs.busy) accept.setAttribute('disabled', '');
      accept.onclick = () => {
        if (jobs.accept(o.id)) this.show('map');
      };
      list.append(
        h(
          'div',
          { class: 'phone-card' },
          h('div', { class: 'phone-row' }, h('b', {}, o.name), h('b', { class: 'fare' }, rupees(o.fare))),
          h('div', {}, `📍 ${o.from.name}`),
          h('div', {}, `🏁 ${o.to.name}`),
          h('div', { class: 'phone-row muted' }, h('span', {}, `${away} m away`), h('span', {}, `expires in ${Math.ceil(o.expires)} s`)),
          accept,
        ),
      );
    }
    return list;
  }

  // ---- Map: live heading-up map + "where to?" search + turn-by-turn ----------------------

  private map() {
    const { jobs } = this.deps;
    const wrap = h('div', { class: 'pm' });
    // Category chips: pick one to list the nearest places of that kind.
    const chips = h('div', { class: 'pm-chips' });
    for (const [key, label] of SEARCH) {
      const b = h('button', { class: `pm-chip${this.searchCat === key ? ' on' : ''}` }, label);
      b.onclick = () => {
        this.searchCat = this.searchCat === key ? null : key;
        this.render();
      };
      chips.append(b);
    }
    // The live map (drawn every frame by tickMap) with zoom / compass buttons over it.
    const box = h('div', { class: 'pm-box' }, this.mapCanvas);
    const btn = (t: string, title: string, f: () => void) => {
      const b = h('button', { class: 'pm-btn', title }, t);
      b.onclick = f;
      return b;
    };
    box.append(h('div', { class: 'pm-btns' },
      btn('+', 'Zoom in', () => (this.mapZoom = Math.min(8, this.mapZoom * 1.35))),
      btn('−', 'Zoom out', () => (this.mapZoom = Math.max(0.6, this.mapZoom / 1.35))),
      btn('🧭', 'North up / heading up', () => (this.northUp = !this.northUp)),
    ));
    wrap.append(chips, box, this.navBox);
    if (this.searchCat) {
      // Nearest places by road distance.
      const me = this.deps.player();
      const cats = SEARCH.find(([k]) => k === this.searchCat)![2];
      const near = this.deps.places()
        .filter((p) => cats.includes(p.cat))
        .map((p) => ({ p, d: Math.hypot(p.x - me.x, p.z - me.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 12)
        .map(({ p }) => ({ p, d: routeLength(route(me, p, X_LINES, Z_LINES)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 6);
      const list = h('div', { class: 'pm-list' });
      for (const { p, d } of near) {
        const go = h('button', { class: 'phone-btn pm-go' }, 'Go');
        go.onclick = () => {
          this.deps.navigate(p);
          this.searchCat = null;
          this.render();
        };
        list.append(h('div', { class: 'pm-item' },
          h('span', { class: 'pm-dot', style: `background:${p.colour}` }, p.icon),
          h('div', { class: 'pm-name' }, h('b', {}, p.name), h('div', { class: 'muted' }, fmtDist(d))),
          go));
      }
      if (!near.length) list.append(h('div', { class: 'muted' }, 'Nothing like that nearby.'));
      wrap.append(list);
    } else if (!this.deps.dest() && jobs.target) {
      wrap.append(h('div', { class: 'phone-sub' }, `${jobs.target.kind === 'pickup' ? '🟡 Pickup' : '🟢 Drop'} · ${jobs.mission}`));
    } else if (!this.deps.dest()) {
      wrap.append(h('div', { class: 'phone-sub' }, 'Where to? Pick a chip above, or click a place on the big map (Tab).'));
    }
    this.tickMap();
    return wrap;
  }

  /** Redraw the live map and the turn card (every frame while the Map app is open). */
  private tickMap() {
    const { jobs } = this.deps;
    const c = this.mapCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== PM_W * dpr) {
      c.width = PM_W * dpr;
      c.height = PM_H * dpr;
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const me = this.deps.player();
    const view = this.northUp ? 0 : this.deps.view();
    const k = this.mapZoom;
    const ox = PM_W / 2;
    const oy = this.northUp ? PM_H / 2 : PM_H * 0.64; // heading-up: show more of the road ahead
    const cos = Math.cos(view);
    const sin = Math.sin(view);
    const S = (x: number, z: number) => {
      const dx = (x - me.x) * k;
      const dz = (z - me.z) * k;
      return { x: ox + dx * cos - dz * sin, y: oy + dx * sin + dz * cos };
    };
    g.fillStyle = MAP_LAND;
    g.fillRect(0, 0, PM_W, PM_H);
    g.save();
    g.translate(ox, oy);
    g.rotate(view);
    const span = Math.hypot(PM_W, PM_H) * 1.3 / k; // metres: enough to fill the corners while turning
    const east = (BOUNDS.x1 - me.x) * k;
    g.fillStyle = MAP_SEA;
    g.fillRect(east - 1, -span * k, span * k * 2, span * k * 2);
    drawCrop(g, this.deps.town.canvas, mapPx(me.x) - (span * MAP_PPM) / 2, mapPx(me.z) - (span * MAP_PPM) / 2, span * MAP_PPM, span * MAP_PPM, (-span * k) / 2, (-span * k) / 2, span * k, span * k);
    g.restore();
    const guide = this.deps.guide();
    if (guide) drawRoute(g, guide, S, Math.max(4, k * 1.8));
    drawOverlay(g, this.deps.town, { k, w: PM_W, h: PM_H, toScreen: S, rotateStreets: this.northUp });
    const dot = (x: number, z: number, colour: string, r: number) => {
      const p = S(x, z);
      g.fillStyle = colour;
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    for (const b of this.deps.police()) dot(b.x, b.z, '#e53935', 5);
    if (!jobs.busy) for (const o of jobs.orders) dot(stopPoint(o.from, 'sidewalk').x, stopPoint(o.from, 'sidewalk').z, '#ffe680', 4);
    const t = jobs.target;
    if (t) dot(t.x, t.z, t.kind === 'pickup' ? '#ffd21f' : '#35e06b', 7);
    const a = this.deps.auto();
    const ap = S(a.x, a.z);
    g.fillStyle = '#f5c400';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.fillRect(ap.x - 5, ap.y - 5, 10, 10);
    g.strokeRect(ap.x - 5, ap.y - 5, 10, 10);
    const dest = this.deps.dest();
    if (dest) {
      const d = S(dest.x, dest.z);
      drawPin(g, Math.min(PM_W - 12, Math.max(12, d.x)), Math.min(PM_H - 2, Math.max(26, d.y)), 0.85);
    }
    // You: arrow, turned the way you face relative to the map.
    g.save();
    g.translate(ox, oy);
    g.rotate(view - me.yaw);
    g.fillStyle = '#2f7bff';
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 11);
    g.lineTo(8, -8);
    g.lineTo(0, -3);
    g.lineTo(-8, -8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    // Turn card.
    const nav = this.deps.navInfo();
    this.navBox.style.display = nav ? 'flex' : 'none';
    if (nav) {
      this.navArrow.textContent = nav.arrow;
      this.navDist.textContent = nav.dist;
      this.navLine.textContent = nav.line;
      this.navSub.textContent = nav.sub;
      this.navEnd.style.display = this.deps.dest() ? 'block' : 'none';
    }
  }

  private wallet() {
    const { economy } = this.deps;
    const paidPct = Math.max(0, Math.round(((LOAN_TOTAL - economy.loan) / LOAN_TOTAL) * 100)); // fines can push the loan above the start
    const payBtn = (label: string, amount: number) => {
      const b = h('button', { class: 'phone-btn' }, label);
      if (economy.cash <= 0 || economy.loan <= 0) b.setAttribute('disabled', '');
      b.onclick = () => {
        this.deps.pay(amount);
        this.render();
      };
      return b;
    };
    return h(
      'div',
      {},
      h('div', { class: 'phone-title' }, 'Wallet'),
      h('div', { class: 'phone-card' }, h('div', { class: 'big' }, rupees(economy.cash)), h('div', { class: 'muted' }, 'cash in hand')),
      h('div', { class: 'phone-card' }, `Today: ${rupees(economy.earnedToday)} earned · ${economy.rides} rides total`),
      this.bankCard(),
      ...(economy.seized ? [this.seizedCard()] : []),
      h(
        'div',
        { class: 'phone-card' },
        h('b', {}, 'Kadan — Kandasamy'),
        h('div', {}, `${rupees(economy.loan)} left of ${rupees(LOAN_TOTAL)}`),
        h('div', { class: 'bar' }, h('div', { style: `width:${paidPct}%` })),
        h('div', { class: economy.dueToday > 0 ? 'due' : 'muted' }, economy.dueToday > 0 ? `Due today: ${rupees(economy.dueToday)}` : "Today's amount paid ✔"),
        h('div', { class: 'phone-row' }, payBtn(`Pay ${rupees(DAILY_DUE)}`, DAILY_DUE), payBtn('Pay all cash', Infinity)),
      ),
      this.newGameButton(),
    );
  }

  /** Mylapore Co-op Bank app: savings balance, deposit / withdraw from anywhere. */
  private bankCard() {
    const { economy } = this.deps;
    const btn = (label: string, op: 'deposit' | 'withdraw', amount: number, enabled: boolean) => {
      const b = h('button', { class: 'phone-btn' }, label);
      if (!enabled) b.setAttribute('disabled', '');
      b.onclick = () => {
        this.deps.bank(op, amount);
        this.render();
      };
      return b;
    };
    return h(
      'div',
      { class: 'phone-card' },
      h('b', {}, '🏦 Mylapore Co-op Bank'),
      h('div', {}, `Savings: ${rupees(economy.savings)}`),
      h('div', { class: 'muted' }, 'Safe from pickpockets; fines come out of it before the kadan grows.'),
      h('div', { class: 'phone-row' }, btn('Deposit all cash', 'deposit', economy.cash, economy.cash > 0), btn('Withdraw ₹500', 'withdraw', 500, economy.savings > 0)),
      h('div', { class: 'phone-row' }, btn(`Withdraw all`, 'withdraw', economy.savings, economy.savings > 0)),
    );
  }

  /** Kandasamy has the auto: pay the overdue + penalty to get it back. */
  private seizedCard() {
    const { economy } = this.deps;
    const b = h('button', { class: 'phone-btn' }, `Pay ${rupees(economy.redeemCost)} — get the auto back`);
    if (economy.cash < economy.redeemCost) b.setAttribute('disabled', '');
    b.onclick = () => {
      this.deps.redeem();
      this.render();
    };
    return h('div', { class: 'phone-card' }, h('b', { class: 'due' }, '🚫 Auto seized by Kandasamy'), h('div', { class: 'muted' }, `${economy.missedDays} days unpaid + ₹500 penalty`), b);
  }

  /** Two taps: the first arms it, the second wipes the save. */
  private newGameButton() {
    const b = h('button', { class: 'phone-btn' }, 'New game (delete save)');
    b.onclick = () => {
      if (b.dataset.armed) this.deps.newGame();
      else {
        b.dataset.armed = '1';
        b.textContent = 'Tap again to delete the save';
      }
    };
    return h('div', { class: 'phone-row' }, b);
  }

  private messagesApp() {
    const list = h('div', {}, h('div', { class: 'phone-title' }, 'Messages'));
    if (!this.messages.length) list.append(h('p', { class: 'muted' }, 'No messages yet.'));
    for (const m of this.messages) {
      list.append(h('div', { class: 'phone-card' }, h('div', { class: 'phone-row' }, h('b', {}, m.from), h('span', { class: 'muted' }, m.time)), m.text));
    }
    return list;
  }

  private weatherApp() {
    const { weather } = this.deps;
    return h(
      'div',
      {},
      h('div', { class: 'phone-title' }, 'Chennai weather'),
      h('div', { class: 'phone-card' }, h('div', { class: 'big' }, weather.tempC === null ? '--' : `${Math.round(weather.tempC)}°C`), weather.description),
      h('div', { class: 'phone-card muted' }, 'Live from Open-Meteo for Mylapore, updated every 10 minutes. Rain on the roads makes them slippery-looking and the sky grey. (Debug: R cycles test rain / clear / live.)'),
    );
  }
}
