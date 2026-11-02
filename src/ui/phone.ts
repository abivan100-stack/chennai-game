import type { Economy } from '../missions/economy';
import { DAILY_DUE, LOAN_TOTAL } from '../missions/economy';
import type { TaxiJobs } from '../missions/jobs';
import type { Weather } from '../world/weather';
import { stopPoint } from '../missions/data';
import { MAP_LAND, MAP_PPM, drawLabel, drawRoute, mapPx, type TownMap } from './mapArt';
import { routeLength } from '../missions/route';
import { WORLD_SIZE } from '../world/layout';

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
}

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
  private mapZoomed = true;
  private last = 0;
  private toastTimer = 0;

  constructor(deps: PhoneDeps) {
    this.deps = deps;
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
    if (!this.isOpen || now - this.last < REFRESH_MS) return;
    this.last = now;
    this.render();
  }

  private show(app: App) {
    this.app = app;
    if (app === 'messages') this.messages.forEach((m) => (m.read = true));
    this.render();
  }

  private render() {
    const { weather, clock } = this.deps;
    this.status.replaceChildren(h('span', {}, clock()), h('span', {}, weather.label), h('span', {}, '📶 87%'));
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

  private map() {
    const { jobs, town } = this.deps;
    const W = 268;
    const H = 380;
    const c = h('canvas', { width: String(W), height: String(H), class: 'phone-map', title: 'Tap to zoom' }) as HTMLCanvasElement;
    c.onclick = () => {
      this.mapZoomed = !this.mapZoomed;
      this.render();
    };
    const g = c.getContext('2d')!;
    const me = this.deps.player();
    // Screen px per metre and the map window (centred on the player when zoomed).
    const k = this.mapZoomed ? 2.6 : W / WORLD_SIZE;
    const cx = this.mapZoomed ? me.x : 0;
    const cz = this.mapZoomed ? me.z : 0;
    const sw = (W / k) * MAP_PPM;
    const sh = (H / k) * MAP_PPM;
    g.fillStyle = MAP_LAND;
    g.fillRect(0, 0, W, H);
    g.drawImage(town.canvas, mapPx(cx) - sw / 2, mapPx(cz) - sh / 2, sw, sh, 0, 0, W, H);
    const S = (x: number, z: number) => ({ x: W / 2 + (x - cx) * k, y: H / 2 + (z - cz) * k });
    const dot = (x: number, z: number, colour: string, r: number) => {
      const p = S(x, z);
      g.fillStyle = colour;
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    };
    const guide = this.deps.guide();
    if (guide) drawRoute(g, guide, S, this.mapZoomed ? 5 : 3);
    for (const l of town.labels) {
      if (!this.mapZoomed && l.kind === 'street') continue; // too cramped at whole-town scale
      const p = S(l.x, l.z);
      if (p.x > -40 && p.x < W + 40 && p.y > 0 && p.y < H) drawLabel(g, l, p.x, p.y);
    }
    for (const b of this.deps.police()) dot(b.x, b.z, '#e53935', 5);
    if (!jobs.busy) for (const o of jobs.orders) dot(stopPoint(o.from, 'sidewalk').x, stopPoint(o.from, 'sidewalk').z, '#ffe680', 4);
    const t = jobs.target;
    if (t) dot(t.x, t.z, t.kind === 'pickup' ? '#ffd21f' : '#35e06b', 7);
    const a = this.deps.auto();
    dot(a.x, a.z, '#f5c400', 5);
    const p = S(me.x, me.z);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(-me.yaw);
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, 9);
    g.lineTo(7, -7);
    g.lineTo(0, -3);
    g.lineTo(-7, -7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    return h(
      'div',
      {},
      h('div', { class: 'phone-title' }, 'Map'),
      c,
      h('div', { class: 'phone-sub' }, t ? `${t.kind === 'pickup' ? '🟡 Pickup' : '🟢 Drop'} · ${guide ? `${Math.round(routeLength(guide))} m · ` : ''}${jobs.mission}` : '🟡 = open orders · tap map to zoom'),
    );
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
