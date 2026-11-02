/**
 * Keyboard + mouse state. Uses KeyboardEvent.code ("KeyW", "Space", "ShiftLeft", "F3")
 * so controls stay put on non-QWERTY layouts.
 */
const held = new Set<string>();
const pressed = new Set<string>(); // went down this frame
let mouseX = 0;
let mouseY = 0;

/** Keys whose browser default (scroll, find-next) would fight the game. */
const BLOCK_DEFAULT = new Set(['Space', 'F3', 'ArrowUp', 'ArrowDown', 'Tab']);

addEventListener('keydown', (e) => {
  if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  held.add(e.code);
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear()); // avoid stuck keys after alt-tab
// Left click while playing (pointer locked) = 'Mouse0' (the click that locks the pointer doesn't count).
addEventListener('mousedown', (e) => {
  if (!document.pointerLockElement) return;
  // 'Mouse0' = left, 'Mouse2' = right (held while pressed, e.g. block).
  pressed.add(`Mouse${e.button}`);
  held.add(`Mouse${e.button}`);
});
addEventListener('mouseup', (e) => held.delete(`Mouse${e.button}`));
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!document.pointerLockElement) return;
  mouseX += e.movementX;
  mouseY += e.movementY;
});

export const input = {
  isDown: (code: string) => held.has(code),
  wasPressed: (code: string) => pressed.has(code),
  /** Mouse movement since the last call, in pixels. */
  consumeMouse() {
    const delta = { x: mouseX, y: mouseY };
    mouseX = mouseY = 0;
    return delta;
  },
  /** Call once at the very end of each frame. */
  endFrame: () => pressed.clear(),
};

export type Input = typeof input;

/** Lock the pointer on click; onChange reports lock state (for the "Click to play" hint). */
export function enablePointerLock(el: HTMLElement, onChange: (locked: boolean) => void) {
  // Chrome rejects re-locking right after Esc; ignore that, the next click works.
  el.addEventListener('click', () => el.requestPointerLock().catch(() => {}));
  document.addEventListener('pointerlockchange', () => onChange(document.pointerLockElement === el));
}
