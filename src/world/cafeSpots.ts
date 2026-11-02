/** The aesthetic cafes and boutiques on layout.CAFE_LOTS, in order (pure data; world/cafes.ts builds them). */
export type Look = 'minimal' | 'pastel' | 'heritage' | 'garden';
export interface Spot { name: string; ta: string; look: Look; cafe: 'cafe' | 'bakery' | null; bg: string; fg: string }

export const CAFE_SPOTS: Spot[] = [
  { name: 'Kaapi Kottai', ta: 'காப்பி கோட்டை', look: 'heritage', cafe: 'cafe', bg: '#5b2c1a', fg: '#f6e3c3' },
  { name: 'Kalamkari Studio', ta: 'கலம்காரி ஸ்டுடியோ', look: 'pastel', cafe: null, bg: '#f7e1d7', fg: '#7a3b2e' },
  { name: 'Thinnai Cafe', ta: 'திண்ணை கஃபே', look: 'heritage', cafe: 'cafe', bg: '#7a2e1c', fg: '#ffe9c7' },
  { name: 'Kadal Cafe', ta: 'கடல் கஃபே', look: 'minimal', cafe: 'cafe', bg: '#ffffff', fg: '#1f4e5f' },
  { name: 'Sundal & Sourdough', ta: 'சுண்டல் & சோர்டோ', look: 'pastel', cafe: 'bakery', bg: '#fdf0d5', fg: '#9c4a1a' },
  { name: 'Neem Tree Cafe', ta: 'வேப்பமர கஃபே', look: 'garden', cafe: 'cafe', bg: '#2f4f2f', fg: '#e9f5db' },
  { name: "Paati's Bakehouse", ta: 'பாட்டி பேக்ஹவுஸ்', look: 'pastel', cafe: 'bakery', bg: '#fbe2e5', fg: '#8a2f45' },
  { name: 'Handloom House', ta: 'கைத்தறி இல்லம்', look: 'heritage', cafe: null, bg: '#3d2b56', fg: '#f2d48f' },
  { name: 'Byte & Brew', ta: 'பைட் & ப்ரூ', look: 'minimal', cafe: 'cafe', bg: '#111111', fg: '#f2c14e' },
  { name: 'Madras Roast Co.', ta: 'மெட்ராஸ் ரோஸ்ட்', look: 'minimal', cafe: 'cafe', bg: '#2b2118', fg: '#e8c99b' },
  { name: 'Kolam Concept Store', ta: 'கோலம் கான்செப்ட் ஸ்டோர்', look: 'garden', cafe: null, bg: '#ffffff', fg: '#2d6a4f' },
  { name: 'Lighthouse Cafe', ta: 'லைட்ஹவுஸ் கஃபே', look: 'garden', cafe: 'cafe', bg: '#0d3b66', fg: '#ffffff' },
];
