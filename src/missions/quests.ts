/**
 * Story quests: Chapter 2 missions that aren't auto rides (on foot, any vehicle, chases,
 * searches). Each is a list of steps run by missions/questRunner.ts. Pure data (no three.js) so
 * scripts/check.ts can check it; positions come from stops or fixed spots on the map.
 */
import { STOPS, stopPoint } from './data.ts';

export interface Pt {
  x: number;
  z: number;
}

/** A person in the quest: spawned when the quest starts (or, for `hidden`, when the search begins). */
export interface Person {
  name: string;
  look: 'man' | 'woman' | 'child';
  at: Pt;
  /** Not there at the start: appears when a search step hides them. */
  hidden?: boolean;
}

export type Step =
  /** Get within `radius` of a spot (on foot only if onFoot). */
  | { kind: 'goto'; at: Pt; text: string; radius?: number; onFoot?: boolean; shout?: [string, string][] }
  /** E next to a person: they say `line`. */
  | { kind: 'talk'; who: string; text: string; line: string }
  /** The `who` person is hidden at one of `spots`; walk up to them. Clue people answer E with their line. */
  | { kind: 'search'; who: string; spots: Pt[]; text: string; found: string; clues: { who: string; line: string }[] }
  /** `who` follows you (on foot) to `to`. */
  | { kind: 'escort'; who: string; to: Pt; text: string; done: string }
  /** `who` runs off along the roads from where they stand to `to`: catch them (E close by on foot, or bump them with a vehicle). */
  | { kind: 'chase'; who: string; to: Pt; speed: number; text: string; caught: string; escaped: string; loseAfter: number; shout?: [string, string][] }
  /** Carry `item` to `to` within `limit` s; more than `maxJolts` hard knocks breaks it; onFoot = walking only. */
  | { kind: 'carry'; item: 'box' | 'garland' | 'bag'; to: Pt; limit: number; maxJolts?: number; onFoot?: boolean; text: string; broken?: string; late: string }
  /**
   * Follow a car from `from` to `to` along the roads in any vehicle: closer than `near` for
   * SPOT_AFTER s and they spot you, further than `lose` for LOSE_AFTER s and you've lost them.
   * `rider` (a quest person) is in your vehicle for the chase and steps out at the end.
   */
  | { kind: 'tail'; colour: number; from: Pt; to: Pt; speed: number; near: number; lose: number; rider?: string; text: string; spotted: string; lost: string; arrived: string; warnNear: string; warnFar: string };

export interface Quest {
  id: string;
  title: string;
  offer: string; // phone notification
  people: Record<string, Person>;
  steps: Step[];
  reward: number;
  success: string; // {reward}
}

const stop = (name: string, where: 'kerb' | 'sidewalk' = 'sidewalk') => {
  const s = STOPS.find((t) => t.name === name);
  if (!s) throw new Error(`quests: no stop "${name}"`);
  return stopPoint(s, where);
};
const near = (p: Pt, dx: number, dz: number): Pt => ({ x: p.x + dx, z: p.z + dz });

const fairGate = stop('Santhome beach fair');
const market = stop('Mylapore vegetable market');
const cinema = stop('Kamadhenu Cinemas');
const flowers = stop('North Mada Street flower market');
const luz = stop('Luz Corner');
const elliots = stop("Elliot's Beach", 'kerb');
const seshadri = stop('Alwarpet TTK Road');
const stand = stop('Mylapore auto stand');
const station = near(stop('Kutchery Road'), -15, 0); // Mylapore Police Station gate
const tidel = stop('Tidel Park');
/** The Guindy warehouse's gate (layout.GUINDY.estate()[1], on Velachery Main Road) and Hotel Kaveri Palace's gate on Anna Salai. */
const warehouse = { x: -479, z: 606 };
const kaveri = { x: -256.5, z: 210 };

export const QUESTS: Quest[] = [
  {
    id: 'lostchild',
    title: 'Kaanaama Pona Kuzhandhai',
    offer: '📖 A little boy is lost at the Santhome beach fair. His amma is at the gate, crying. Go help!',
    people: {
      amma: { name: 'Selvi (Kutty-yoda amma)', look: 'woman', at: near(fairGate, 3, 1) },
      kutty: { name: 'Kutty', look: 'child', at: { x: 0, z: 0 }, hidden: true },
      balloon: { name: 'Balloon vyaapaari', look: 'man', at: { x: 146.5, z: 109.5 } },
      stall: { name: 'Bajji kadai anna', look: 'man', at: { x: 147.5, z: 128 } },
    },
    steps: [
      { kind: 'goto', at: fairGate, radius: 6, text: 'Go to the Santhome beach fair gate' },
      { kind: 'talk', who: 'amma', text: 'Talk to the crying mother at the gate (E)', line: 'Anna! En paiyan Kutty, 5 vayasu, red shirt... balloon venum-nu kettaan, kaanom! Please kandupudinga!' },
      {
        kind: 'search', who: 'kutty', text: 'Find Kutty in the fair (ask the stall keepers: E)',
        spots: [{ x: 181, z: 129 }, { x: 157, z: 104 }, { x: 182, z: 117 }],
        found: 'Kutty: (sniff) Amma engae...? Neenga amma kitta kootitu poveengala?',
        clues: [
          { who: 'balloon', line: 'Oru chinna paiyan balloon-a paathutte giant wheel pakkam odinaan pa!' },
          { who: 'stall', line: 'Red shirt paiyan-aa? Kadal pakkam, kadaisi varisai-la paathen.' },
        ],
      },
      { kind: 'escort', who: 'kutty', to: near(fairGate, 3, 1), text: 'Walk Kutty back to his amma at the gate', done: 'Selvi: KUTTY! (hugs him) Kadavul maadhiri vandheenga anna!' },
    ],
    reward: 800,
    success: 'Selvi: Indha ₹{reward}, venaam-nu sollaadheenga. Unga nalla manasukku!',
  },
  {
    id: 'chain',
    title: 'Chain Thirudan!',
    offer: '📖 "Thirudan! Thirudan!" A chain snatcher at the Mylapore vegetable market. Get there!',
    people: {
      paati: { name: 'Kamala paati', look: 'woman', at: near(market, 2, 0.5) },
      thief: { name: 'Chain thirudan', look: 'man', at: near(market, -7, 0.5) },
    },
    steps: [
      { kind: 'goto', at: market, radius: 9, text: 'Get to the vegetable market (South Mada Street)' },
      {
        kind: 'chase', who: 'thief', to: stop('Nageswara Rao Park'), speed: 5.4, loseAfter: 6,
        shout: [['Kamala paati', 'THIRUDAN! THIRUDAN! En chain!!'], ['Chain thirudan', 'Vazhi vidunga!! (runs off with the chain)']],
        text: 'Catch the chain snatcher! (E when close, or bump him with a vehicle)',
        caught: 'Thirudan: Aiyo! Vidunga anna, chain-a kudukkaren!',
        escaped: 'Avan park-kulla odi maraindhuttaan... chain pochu.',
      },
      { kind: 'talk', who: 'paati', text: 'Take the chain back to Kamala paati at the market (E)', line: 'En thaali chain! Ammaadi... en veetukaarar kuduthadhu idhu. Romba nandri kanna!' },
    ],
    reward: 1000,
    success: 'Kamala paati: Indha ₹{reward} vechukko kanna. Nalla irukkanum nee!',
  },
  {
    id: 'film',
    title: 'Shooting Spot',
    offer: '📖 A film crew at Kamadhenu Cinemas needs their camera box at Marina Beach before the light goes. Fragile!',
    people: {
      crew: { name: 'Assistant director Vinoth', look: 'man', at: near(cinema, 1.5, 0) },
    },
    steps: [
      { kind: 'goto', at: cinema, radius: 6, text: 'Go to Kamadhenu Cinemas (Kutchery Road)' },
      { kind: 'talk', who: 'crew', text: 'Talk to the assistant director (E)', line: 'Boss, camera box Marina-ku venum, golden hour pogudhu! Idhu ₹40 lakh camera, paathu!' },
      {
        kind: 'carry', item: 'box', to: stop('Marina Beach'), limit: 80, maxJolts: 2,
        text: 'Carry the camera box to Marina Beach: any vehicle, no crashes!',
        broken: 'Vinoth (phone): Enna sound adhu?! Lens odanjiduchu!! Shoot cancel...',
        late: 'Vinoth (phone): Sun pochu boss... shoot naalaiku dhaan.',
      },
    ],
    reward: 1500,
    success: 'Vinoth: Perfect timing! Golden hour shot ready! Indha ₹{reward}, and un per credits-la varum!',
  },
  {
    id: 'flowers',
    title: 'Poo Maalai Rush',
    offer: '📖 The flower market on North Mada Street needs a runner: wedding garlands to Mandaveli, on foot!',
    people: {
      poo: { name: 'Poo kadai Valli', look: 'woman', at: near(flowers, 1.5, 0) },
    },
    steps: [
      { kind: 'goto', at: flowers, radius: 6, text: 'Go to the flower market (North Mada Street)' },
      { kind: 'talk', who: 'poo', text: 'Talk to Valli at the flower stall (E)', line: 'Thambi, indha maalai Venkatakrishna Road kalyana mandapam-ku! Vandi-la vecha nasungidum, nadandhu po!' },
      {
        kind: 'carry', item: 'garland', to: stop('Venkatakrishna Road'), limit: 70, onFoot: true,
        text: 'Run the garlands to Venkatakrishna Road: on foot only!',
        broken: 'Maalai vandi-la nasungiduchu... Valli thittuvaanga.',
        late: 'Kalyanam aarambichiduchu, maalai late...',
      },
    ],
    reward: 600,
    success: 'Mandapam: Maalai vandhaachu! Ponnu veettaar kitta irundhu ₹{reward}, kalyana saapadu-um saapdunga!',
  },
  {
    id: 'follow',
    title: 'Follow That Car!',
    offer: '📖 A lady at Luz Corner wants you to follow a car. "En husband... office-nu solli enga poraar-nu paakanum!"',
    people: {
      rani: { name: 'Rani akka', look: 'woman', at: near(luz, 2, 0) },
    },
    steps: [
      { kind: 'goto', at: luz, radius: 7, text: 'Go to Luz Corner' },
      { kind: 'talk', who: 'rani', text: 'Talk to Rani akka (E)', line: 'Thambi! Andha silver car paathingala? En veetukaarar. Office-nu sonnaaru, aana office andha pakkam illa! Follow pannunga, aana avarukku theriya koodadhu!' },
      {
        kind: 'tail', colour: 0xb8bcc2, from: stop('Luz Corner', 'kerb'), to: elliots, speed: 9, near: 9, lose: 60, rider: 'rani',
        text: "Follow the silver car in a vehicle: not too close, don't lose it!",
        warnNear: 'Romba kitta poreenga! Avar mirror-la paathuduvaaru!',
        warnFar: 'Kaanom! Seekiram, andha car poidum!',
        spotted: 'Avar paathuttaaru! Car-a thirupi veetukku poraaru... ellaam waste.',
        lost: 'Poyiduchu... enga ponaaru-nu theriyala.',
        arrived: "Elliot's Beach-aa?! ... Oh. Cake, balloons... avar en birthday-ku surprise ready pannuraaru! (cries, laughs) Thambi, naan onnum paakala, seriyaa?",
      },
    ],
    reward: 1200,
    success: 'Rani: Indha ₹{reward}. Yaarkittayum sollaadheenga, surprise kedukka koodadhu!',
  },
  {
    id: 'lostbag',
    title: 'Kaanaama Pona Bag',
    offer: '📖 Your last passenger left a black leather bag on the back seat. It is full of cash... and has an address card: Seshadri, TTK Road, Alwarpet.',
    people: {
      seshadri: { name: 'Seshadri sir', look: 'man', at: near(seshadri, 0, 2) },
    },
    steps: [
      {
        kind: 'carry', item: 'bag', to: seshadri, limit: 300,
        text: 'Return the bag to Seshadri sir on TTK Road, Alwarpet (or keep it...)',
        late: 'Bag innum unga kitta dhaan irukku... Seshadri sir kaathu irundhaaru. (It will come up again.)',
      },
      { kind: 'talk', who: 'seshadri', text: 'Give the bag to Seshadri sir (E)', line: 'En bag! ₹2 lakh irukku idhula... oru rupaai kooda kammi illa. Thambi, indha kaalathula unna maadhiri honest-aana aal paakave mudiyaadhu.' },
    ],
    reward: 5000,
    success: 'Seshadri sir: Indha ₹{reward} vechukko. Naan 30 varusham transport business pannavan. Unakku oru auto podhumaa? Yosichu paaru... en card vechukko, oru naal vandhu paaru.',
  },
  // ---- Chapter 3: Ganesh, Kandasamy's nephew, and his rival fleet ----
  {
    id: 'tyres',
    title: 'Tyre Kizhippu',
    offer: '📖 Murugan (phone): Anna! Yaaro namma autos pakkathula knife-oda nikkiraan! Mylapore auto stand-ku seekiram vaanga!',
    people: {
      murugan: { name: 'Murugan (your driver)', look: 'man', at: near(stand, 2.5, 0) },
      goon: { name: "Ganesh's aal", look: 'man', at: near(stand, -6, 0) },
    },
    steps: [
      { kind: 'goto', at: stand, radius: 9, text: 'Get to the Mylapore auto stand (South Mada Street)' },
      {
        kind: 'chase', who: 'goon', to: stop('Luz Corner'), speed: 5.3, loseAfter: 6,
        shout: [['Murugan', 'Avan dhaan anna! Tyre-la knife vechaan!'], ["Ganesh's aal", 'Ganesh anna sonnaru, naan enna panna!! (runs)']],
        text: "Catch Ganesh's man! (E when close, or bump him with a vehicle)",
        caught: "Ganesh's aal: Vidunga vidunga! Ganesh anna dhaan anuppinaaru... ini varamaaten!",
        escaped: 'Luz Corner crowd-la maraindhuttaan... Ganesh-ku ippo theriyum, neenga kaathukittu irukeenga.',
      },
      { kind: 'talk', who: 'murugan', text: 'Go back to Murugan at the auto stand (E)', line: 'Anna, neenga illana moonu auto-um tyre illaama nikkum! Ganesh-ku idhu first warning dhaan... avan vida maattaan.' },
    ],
    reward: 1500,
    success: 'Murugan: Indha ₹{reward}, stand drivers ellarum serndhu kuduthaanga. "Anna Travels-a thoda mudiyaadhu!"',
  },
  {
    id: 'tidel',
    title: 'Tidel Contract',
    offer: '📖 Seshadri sir: Tidel Park-la oru company staff-ku auto contract kudukka poraanga. Ganesh-um try panraan. Priya madam-a poi paaru!',
    people: {
      priya: { name: 'Priya madam (HR, Tidel)', look: 'woman', at: near(tidel, 2.5, 0) },
    },
    steps: [
      { kind: 'goto', at: tidel, radius: 9, text: 'Go to Tidel Park (Taramani)' },
      { kind: 'talk', who: 'priya', text: 'Talk to Priya madam at the gate (E)', line: "Ganesh's drivers double meter podraanga, staff complaint pannuraanga. Neenga better-a? Prove pannunga: indha server box Grand Lake Residences-la en CEO veetuku, time-ku, odaiyaama!" },
      {
        kind: 'carry', item: 'box', to: stop('Grand Lake Residences'), limit: 80, maxJolts: 2,
        text: 'Deliver the server box to Grand Lake Residences: on time, no hard knocks!',
        broken: 'Priya (phone): Box-la crack sound?! Sorry, contract Ganesh-ku dhaan...',
        late: "Priya (phone): CEO wait panni poittaaru. Ganesh-oda aal munnaadiye vandhuttaan...",
      },
    ],
    reward: 2000,
    success: 'Priya (phone): CEO impressed! Contract Anna Travels-ku: Tidel staff ellam ungal autos-la dhaan. (Fleet takings +20%) Indha ₹{reward} advance.',
  },
  {
    id: 'complaint',
    title: 'Poi Complaint',
    offer: '📖 Police station (phone): Ungal driver Selvam mela complaint vandhirukku - Ganesh auto-va idichaaraam. Mylapore Police Station-ku vaanga, illana permit cancel!',
    people: {
      inspector: { name: 'Inspector Durai', look: 'man', at: near(station, -2, 0) },
      ganesh: { name: 'Ganesh', look: 'man', at: near(station, 3.5, 0) },
      mani: { name: 'Tea master Mani', look: 'man', at: { x: 0, z: 0 }, hidden: true },
      paati: { name: 'Poo vikkara paati', look: 'woman', at: near(stand, 4, 0) },
      paper: { name: 'Paper paiyan', look: 'man', at: near(stand, -14, 0) },
    },
    steps: [
      { kind: 'goto', at: station, radius: 8, text: 'Go to the Mylapore Police Station (Kutchery Road)' },
      { kind: 'talk', who: 'inspector', text: 'Talk to Inspector Durai (E)', line: 'Ganesh sollraan, nethu auto stand-la Selvam avan auto-va idichaan-nu. Witness illana permit cancel. Yaaraavadhu paathaangala?' },
      {
        kind: 'search', who: 'mani', text: 'Find a witness near the auto stand (ask around: E)',
        spots: [near(stand, 8, 0), near(stand, -10, 0), near(stand, -22, 0)],
        found: 'Mani: Paathen paathen! Ganesh-e dhaan avan auto-va post-la mothinaan, aprom Selvam mela pazhi pottaan. Vaanga, naan solren!',
        clues: [
          { who: 'paati', line: 'Nethu saayangaalam-aa? Tea kadai Mani ellaathayum paathukittu irundhaan pa.' },
          { who: 'paper', line: 'Mani anna? Market pakkam, kadai-ku paal vaanga ponaaru.' },
        ],
      },
      { kind: 'escort', who: 'mani', to: near(station, 0.5, 0), text: 'Walk Mani to the police station', done: 'Inspector Durai: Seri, sollunga... (writes it all down)' },
      { kind: 'talk', who: 'ganesh', text: 'Face Ganesh (E)', line: 'Ganesh: ... Seri, indha thadava nee jeichitta. Kandasamy maama-voda auto-va vechu mudhalaali aayitta, aana idhu mudivu illa. (walks off)' },
    ],
    reward: 2500,
    success: 'Inspector Durai: Poi complaint-ku Ganesh-ku warning kuduthaachu. Ungal drivers-a ini thoda maattaan. (No more slashed tyres.) Seshadri sir sends ₹{reward}: "Shabash!"',
  },
  // ---- Chapter 4: Anna Travels & Logistics ----
  {
    id: 'poach',
    title: 'Sawaari Thirudan',
    offer: "📖 Priya madam (Tidel): Ganesh-oda cab driver gate-la nikkiraan, 'Anna Travels close aayiduchu'-nu solli namma staff-a ethikittu poraan! Vaanga!",
    people: {
      priya: { name: 'Priya madam (HR, Tidel)', look: 'woman', at: near(tidel, 2.5, 0) },
      poacher: { name: "Ganesh's cab driver", look: 'man', at: near(tidel, -6, 0) },
    },
    steps: [
      { kind: 'goto', at: tidel, radius: 9, text: 'Get to Tidel Park (Taramani)' },
      {
        kind: 'chase', who: 'poacher', to: stop('Byte & Brew, Taramani'), speed: 5.4, loseAfter: 6,
        shout: [['Priya madam', 'Avan dhaan! Poi solli staff-a kootitu poraan!'], ["Ganesh's cab driver", 'Aiyo, Anna Travels mudhalaali-ye vandhuttaar! (runs)']],
        text: "Catch Ganesh's cab driver! (E when close, or bump him with a vehicle)",
        caught: "Cab driver: Seri seri! Ganesh anna dhaan 'poi sollu'-nu sonnaaru... naan poren!",
        escaped: 'Taramani traffic-la maraindhuttaan. Staff-ku unmai theriyala...',
      },
      { kind: 'talk', who: 'priya', text: 'Tell Priya madam the truth (E)', line: 'Avan poi sonnaana?! Seri, naalaila irundhu Tidel staff cabs ellam Anna Travels dhaan. Notice board-la poduren!' },
    ],
    reward: 2500,
    success: 'Priya madam: Indha ₹{reward}, first month cab advance. Ganesh-oda drivers-ku Tidel gate-la entry illa ini!',
  },
  {
    id: 'firstload',
    title: 'Mudhal Load',
    offer: '📖 Supervisor Ravi (Guindy warehouse): Mudhal order vandhaachu! Hotel Kaveri Palace kitchen-ku urgent supply. Warehouse-ku vaanga!',
    people: {
      ravi: { name: 'Supervisor Ravi', look: 'man', at: near(warehouse, 2, 0) },
      chef: { name: 'Chef Thomas (Hotel Kaveri Palace)', look: 'man', at: near(kaveri, 0, 2) },
    },
    steps: [
      { kind: 'goto', at: warehouse, radius: 9, text: 'Go to your warehouse (Guindy Industrial Estate, Velachery Main Road)' },
      { kind: 'talk', who: 'ravi', text: 'Talk to Supervisor Ravi (E)', line: 'Mudhalaali! Hotel Kaveri Palace-ku 40 crate mineral water, kalyana party-ku. Late aana order cancel, odainja crate-ku kaasu illa. Neengale kondu ponga, first load-la nambikkai varanum!' },
      {
        kind: 'carry', item: 'box', to: kaveri, limit: 120, maxJolts: 3,
        text: 'Deliver the crates to Hotel Kaveri Palace (Anna Salai): on time, no hard knocks!',
        broken: 'Chef (phone): Crate-la paadhi odanjiduchu! Order cancel...',
        late: 'Chef (phone): Party aarambichiduchu, water vere edathula vaangitom. Sorry...',
      },
      { kind: 'talk', who: 'chef', text: 'Hand over to Chef Thomas (E)', line: 'Perfect timing! Ovvoru vaaramum ingirundhu supply venum. Anna Travels & Logistics van-a fix pannidunga!' },
    ],
    reward: 3000,
    success: 'Chef Thomas: Indha ₹{reward} advance. Weekly contract sign pannalaam. (Your delivery vans now have regular work.)',
  },
];
