/**
 * NPC lines (Tanglish). Pure data: writers can edit this file without touching game code.
 * Each NPC cycles through its pool in order, so repeat chats don't repeat immediately.
 */

/** Pressing E near someone. */
export const GREETINGS = [
  'Vanakkam thambi! Eppadi irukka?',
  'Un uncle-oda auto-va thedariya? Road side-la dhaan nikkudhu pa.',
  'Indha veyil-la nadandhu pogadha, auto edu!',
  'Kapaleeshwarar kovil ku evlo aagum? Meter podu pa.',
  'Saayangalam beach pakkam traffic jaasthi, paathu ottu.',
  'Ennapa, pudhu auto driver-aa? All the best!',
  'Over-aa charge pannadha thambi, naanga ellam regular customer.',
  'Mylapore-la ellarukkum un uncle-a theriyum. Nalla manushan.',
  'Shop-ku late aayiduchu, aprom pesalaam pa!',
  'Inniku kovil-la koottam jaasthi, auto-ku nalla business!',
];

/** Running into someone. */
export const BUMPED = [
  'Dei! Kannu enga vechirukka?',
  'Aiyo! Paathu po pa!',
  'Odaadha da, slow-aa po!',
  'Enna avasaram? Train-aa pidikka pora?',
];

/** Hit by the player's auto. */
/** Someone honks right next to you. */
export const HORN_LINES = ['Dei, horn adikkaadha! Kaadhu pochu!', 'Paathu po pa, enna avasaram?', 'Evlo sathham! Road unnodadha?'];
export const DRIVE_BUMPED = [
  'Dei! Footpath-la auto ottuviya?!',
  'Aiyo amma! License irukka illaya?',
  'Paathu ottu da! Naan enna speed breaker-aa?',
  'Ithu road illa, footpath! Kannu theriyala?',
];

/** Pick the next line from a pool, cycling with a per-NPC counter. */
export function nextLine(pool: readonly string[], counter: number) {
  return pool[counter % pool.length];
}

/** Hit with the stick. */
export const BEATEN = ['Aiyo amma! Police-a koopduren!', 'Dei, ennada pannura?! Kaapathunga!', 'Rowdy! Rowdy! Yaaravadhu vaanga!'];
