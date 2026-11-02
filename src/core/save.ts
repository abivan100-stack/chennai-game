/**
 * Save game. For now a temporary store in the browser (localStorage): one JSON blob per
 * browser, survives reloads, gone if the player clears site data. Everything goes through
 * loadSave / writeSave / clearSave, so swapping in a real database later (Cloudflare D1 behind
 * a Pages Function) only changes this file.
 */

const KEY = 'auto-anna-save';
const VERSION = 1;

export interface SaveData {
  v: number;
  savedAt: number; // real time (ms)
  gameMs: number; // in-game clock (ms timestamp, IST shown)
  economy: { cash: number; loan: number; rides: number; earnedToday: number; paidToday: number; missedDays: number; day: number | null; seized?: boolean };
  energy: number;
  health: number;
  player: { x: number; y: number; z: number; yaw: number };
  auto: { x: number; y: number; z: number; heading: number };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.v === VERSION ? data : null; // older format: start fresh
  } catch {
    return null; // storage blocked (private mode) or corrupt: start fresh
  }
}

export function writeSave(data: Omit<SaveData, 'v' | 'savedAt'>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, savedAt: Date.now(), ...data }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
