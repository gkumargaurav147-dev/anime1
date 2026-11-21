import type { Action, Expression, TimeOfDay } from '../schema';
import type { AssetProvider, AssetRef } from './AssetProvider';

/**
 * Simple, consistent placeholder art: flat shapes, one palette, everything drawn from a
 * handful of primitives. Good enough to read a scene at a glance; real art replaces this
 * by implementing AssetProvider.
 */

const W = 400;
const H = 300;
const GROUND_Y = 230;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const svg = (width: number, height: number, anchor: [number, number], body: string): AssetRef => ({
  format: 'svg',
  width,
  height,
  anchor,
  svg: body,
});

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SKY: Record<TimeOfDay, [string, string]> = {
  morning: ['#FFE8C2', '#BDE0FE'],
  afternoon: ['#8ECAE6', '#E3F4FF'],
  evening: ['#FFB4A2', '#6D597A'],
  night: ['#0B132B', '#3A506B'],
  any: ['#EDEBFF', '#F8F7FF'],
};

const SHIRTS = [
  '#5B4BDB',
  '#E76F51',
  '#2A9D8F',
  '#F4A261',
  '#E63946',
  '#457B9D',
  '#8338EC',
  '#FB8500',
];
const SKIN = ['#F9DCC4', '#F1C27D', '#E0AC69', '#C68642', '#8D5524', '#FFDBAC'];
const HAIR = ['#2B2D42', '#6F4E37', '#E9C46A', '#B5651D', '#1D3557', '#9D0208'];

// ---------- backgrounds ----------

function ground(color: string) {
  return `<rect x="0" y="${GROUND_Y}" width="${W}" height="${H - GROUND_Y}" fill="${color}"/>`;
}

function window_(x: number, y: number, w = 70, h = 60, tod: TimeOfDay = 'any') {
  const [a] = SKY[tod];
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${a}" stroke="#ffffff" stroke-width="4"/>`;
}

function placeMotif(place: string, tod: TimeOfDay): string {
  switch (place) {
    case 'restaurant':
      return (
        ground('#8D6E63') +
        window_(40, 60, 90, 70, tod) +
        window_(270, 60, 90, 70, tod) +
        `<line x1="200" y1="0" x2="200" y2="50" stroke="#5D4037" stroke-width="2"/><circle cx="200" cy="58" r="10" fill="#FFD166"/>`
      );
    case 'cafe':
      return (
        ground('#A1887F') +
        window_(50, 50, 120, 80, tod) +
        `<rect x="250" y="150" width="130" height="80" fill="#6D4C41"/><rect x="245" y="145" width="140" height="10" fill="#4E342E"/>`
      );
    case 'home':
    case 'living_room':
      return (
        ground('#D7CCC8') +
        window_(160, 50, 80, 70, tod) +
        `<rect x="20" y="170" width="110" height="60" rx="10" fill="#B08968"/><rect x="290" y="120" width="12" height="110" fill="#6D4C41"/><circle cx="296" cy="112" r="16" fill="#FFD166"/>`
      );
    case 'bedroom':
      return (
        ground('#E6CCB2') +
        window_(280, 50, 80, 70, tod) +
        `<rect x="20" y="180" width="150" height="50" rx="8" fill="#9D8189"/><rect x="20" y="165" width="40" height="25" rx="6" fill="#FFFFFF"/>`
      );
    case 'kitchen':
      return (
        ground('#E9EDC9') +
        window_(160, 40, 80, 60, tod) +
        `<rect x="0" y="160" width="${W}" height="70" fill="#CCD5AE"/><rect x="0" y="155" width="${W}" height="8" fill="#A3B18A"/>`
      );
    case 'park':
    case 'garden':
      return (
        ground('#95D5B2') +
        `<rect x="55" y="140" width="14" height="90" fill="#7F5539"/><circle cx="62" cy="125" r="40" fill="#52B788"/><rect x="330" y="160" width="10" height="70" fill="#7F5539"/><circle cx="335" cy="148" r="28" fill="#74C69D"/>`
      );
    case 'beach':
      return (
        `<rect x="0" y="180" width="${W}" height="50" fill="#48CAE4"/>` +
        ground('#F4D58D') +
        `<circle cx="340" cy="60" r="26" fill="#FFD60A"/>`
      );
    case 'street':
    case 'city_night':
      return (
        `<rect x="10" y="80" width="70" height="150" fill="#8D99AE"/><rect x="90" y="110" width="60" height="120" fill="#ADB5BD"/><rect x="290" y="70" width="90" height="160" fill="#8D99AE"/>` +
        ground('#6C757D') +
        Array.from(
          { length: 6 },
          (_, i) =>
            `<rect x="${25 + (i % 2) * 30}" y="${95 + Math.floor(i / 2) * 35}" width="14" height="18" fill="${place === 'city_night' || tod === 'night' ? '#FFD166' : '#E9ECEF'}"/>`,
        ).join('')
      );
    case 'highway':
      return (
        ground('#495057') +
        `<line x1="0" y1="265" x2="${W}" y2="265" stroke="#FFFFFF" stroke-width="4" stroke-dasharray="24 18"/><path d="M0 230 L120 150 L240 230 Z" fill="#74C69D" opacity=".6"/>`
      );
    case 'sky':
      return `<ellipse cx="90" cy="90" rx="50" ry="20" fill="#FFFFFF" opacity=".9"/><ellipse cx="300" cy="200" rx="60" ry="22" fill="#FFFFFF" opacity=".9"/>`;
    case 'airport':
      return (
        ground('#CED4DA') +
        `<rect x="20" y="40" width="360" height="110" rx="6" fill="${SKY[tod][1]}" stroke="#FFFFFF" stroke-width="6"/><path d="M150 95 L250 95 L262 88 L250 102 Z M190 95 L205 75 L215 95 Z" fill="#FFFFFF"/>`
      );
    case 'train':
      return (
        ground('#ADB5BD') +
        Array.from({ length: 3 }, (_, i) => window_(30 + i * 125, 60, 95, 70, tod)).join('') +
        `<rect x="0" y="150" width="${W}" height="12" fill="#6C757D"/>`
      );
    case 'hotel':
      return (
        ground('#E9D8A6') +
        `<rect x="230" y="150" width="150" height="80" fill="#94D2BD"/><rect x="60" y="40" width="80" height="80" rx="40" fill="#EE9B00"/>`
      );
    case 'cinema':
      return (
        ground('#3C096C') +
        `<rect x="40" y="30" width="320" height="150" rx="6" fill="#E0E1DD"/><rect x="0" y="205" width="${W}" height="25" fill="#7B2CBF"/>`
      );
    case 'stage':
      return (
        ground('#3C096C') +
        `<rect x="0" y="200" width="${W}" height="30" fill="#5A189A"/><path d="M60 0 L110 200 L10 200 Z M340 0 L390 200 L290 200 Z" fill="#FFD60A" opacity=".25"/>`
      );
    case 'arcade':
    case 'party_room':
      return (
        ground('#5A189A') +
        Array.from(
          { length: 10 },
          (_, i) =>
            `<circle cx="${20 + i * 40}" cy="${30 + (i % 3) * 25}" r="7" fill="${SHIRTS[i % SHIRTS.length]}"/>`,
        ).join('')
      );
    case 'theme_park':
      return (
        ground('#95D5B2') +
        `<circle cx="300" cy="110" r="70" fill="none" stroke="#E63946" stroke-width="6"/><line x1="300" y1="110" x2="300" y2="230" stroke="#6C757D" stroke-width="6"/>`
      );
    case 'office':
      return (
        ground('#CED4DA') +
        window_(260, 40, 110, 80, tod) +
        `<rect x="30" y="160" width="160" height="12" fill="#6C757D"/><rect x="40" y="40" width="140" height="80" fill="#FFFFFF" stroke="#ADB5BD"/>`
      );
    case 'classroom':
    case 'campus':
      return (
        ground('#DDB892') +
        `<rect x="80" y="40" width="240" height="100" fill="#2D6A4F" stroke="#7F5539" stroke-width="6"/>`
      );
    case 'library':
      return (
        ground('#B08968') +
        Array.from(
          { length: 4 },
          (_, i) =>
            `<rect x="${20 + i * 95}" y="50" width="80" height="150" fill="#7F5539"/><rect x="${26 + i * 95}" y="60" width="68" height="20" fill="${SHIRTS[i]}"/><rect x="${26 + i * 95}" y="110" width="68" height="20" fill="${SHIRTS[i + 3]}"/>`,
        ).join('')
      );
    case 'gym':
      return (
        ground('#6C757D') +
        `<rect x="0" y="225" width="${W}" height="10" fill="#E63946"/><rect x="30" y="60" width="340" height="80" fill="#ADB5BD"/>`
      );
    case 'mall':
    case 'supermarket':
      return (
        ground('#E9ECEF') +
        Array.from(
          { length: 3 },
          (_, i) =>
            `<rect x="${20 + i * 130}" y="90" width="110" height="140" fill="#DEE2E6"/><rect x="${20 + i * 130}" y="130" width="110" height="6" fill="#ADB5BD"/><rect x="${20 + i * 130}" y="180" width="110" height="6" fill="#ADB5BD"/>`,
        ).join('')
      );
    case 'mountains':
      return (
        `<path d="M0 230 L110 90 L220 230 Z" fill="#6C757D"/><path d="M160 230 L290 60 L400 230 Z" fill="#495057"/><path d="M265 92 L290 60 L315 92 Z" fill="#FFFFFF"/>` +
        ground('#74C69D')
      );
    case 'campsite':
      return (
        ground('#40916C') +
        `<path d="M250 230 L310 150 L370 230 Z" fill="#F4A261"/><path d="M300 230 L310 190 L320 230 Z" fill="#6D4C41"/>`
      );
    case 'snowy_street':
      return (
        `<rect x="20" y="100" width="80" height="130" fill="#ADB5BD"/><rect x="300" y="90" width="80" height="140" fill="#8D99AE"/>` +
        ground('#F8F9FA')
      );
    default:
      return ground('#E2DFFF');
  }
}

// ---------- avatars ----------

const AV_W = 70;
const AV_H = 120;

function face(expression: Expression, cx: number, cy: number) {
  const eye = (dx: number, kind: 'dot' | 'closed' | 'heart' | 'x' | 'wide') => {
    const x = cx + dx;
    switch (kind) {
      case 'closed':
        return `<path d="M${x - 4} ${cy - 2} q4 3 8 0" stroke="#2B2D42" stroke-width="2" fill="none"/>`;
      case 'heart':
        return `<path d="M${x} ${cy + 1} l-4 -4 a2.2 2.2 0 0 1 4 -2 a2.2 2.2 0 0 1 4 2 z" fill="#E63946"/>`;
      case 'x':
        return `<path d="M${x - 3} ${cy - 5} l6 6 M${x + 3} ${cy - 5} l-6 6" stroke="#2B2D42" stroke-width="2"/>`;
      case 'wide':
        return `<circle cx="${x}" cy="${cy - 2}" r="3.5" fill="#FFFFFF" stroke="#2B2D42" stroke-width="1.5"/><circle cx="${x}" cy="${cy - 2}" r="1.5" fill="#2B2D42"/>`;
      default:
        return `<circle cx="${x}" cy="${cy - 2}" r="2.5" fill="#2B2D42"/>`;
    }
  };
  const m = (d: string, fill = 'none') =>
    `<path d="${d}" stroke="#2B2D42" stroke-width="2" fill="${fill}" stroke-linecap="round"/>`;
  const my = cy + 9;
  const brows = (tilt: number) =>
    `<path d="M${cx - 12} ${cy - 9 - tilt} l7 ${tilt} M${cx + 12} ${cy - 9 - tilt} l-7 ${tilt}" stroke="#2B2D42" stroke-width="2"/>`;
  switch (expression) {
    case 'smile':
      return eye(-8, 'dot') + eye(8, 'dot') + m(`M${cx - 7} ${my} q7 6 14 0`);
    case 'grin':
      return (
        eye(-8, 'closed') + eye(8, 'closed') + m(`M${cx - 9} ${my - 1} q9 10 18 0 z`, '#FFFFFF')
      );
    case 'laugh':
      return (
        eye(-8, 'closed') +
        eye(8, 'closed') +
        m(`M${cx - 9} ${my - 2} q9 13 18 0 z`, '#E63946') +
        `<circle cx="${cx - 15}" cy="${cy + 2}" r="2.5" fill="#48CAE4"/>`
      );
    case 'sad':
      return eye(-8, 'dot') + eye(8, 'dot') + m(`M${cx - 7} ${my + 3} q7 -6 14 0`);
    case 'cry':
      return (
        eye(-8, 'closed') +
        eye(8, 'closed') +
        m(`M${cx - 7} ${my + 3} q7 -6 14 0`) +
        `<path d="M${cx - 9} ${cy + 1} v8 M${cx + 9} ${cy + 1} v8" stroke="#48CAE4" stroke-width="3"/>`
      );
    case 'angry':
      return brows(-4) + eye(-8, 'dot') + eye(8, 'dot') + m(`M${cx - 7} ${my + 2} h14`);
    case 'surprised':
      return (
        eye(-8, 'wide') +
        eye(8, 'wide') +
        `<ellipse cx="${cx}" cy="${my + 1}" rx="4" ry="5" fill="#2B2D42"/>`
      );
    case 'sleepy':
      return eye(-8, 'closed') + eye(8, 'closed') + m(`M${cx - 4} ${my + 1} h8`);
    case 'nervous':
      return (
        brows(3) + eye(-8, 'dot') + eye(8, 'dot') + m(`M${cx - 8} ${my} l4 -2 l4 2 l4 -2 l4 2`)
      );
    case 'love':
      return eye(-8, 'heart') + eye(8, 'heart') + m(`M${cx - 7} ${my} q7 6 14 0`);
    case 'wink':
      return eye(-8, 'dot') + eye(8, 'closed') + m(`M${cx - 7} ${my} q7 6 14 0`);
    case 'confused':
      return (
        brows(2) + eye(-8, 'dot') + eye(8, 'wide') + m(`M${cx - 7} ${my + 1} q4 -3 7 0 q4 3 7 0`)
      );
    case 'determined':
      return brows(-2) + eye(-8, 'dot') + eye(8, 'dot') + m(`M${cx - 7} ${my} q7 3 14 0`);
    default:
      return eye(-8, 'dot') + eye(8, 'dot') + m(`M${cx - 6} ${my + 1} h12`);
  }
}

/** Arm end points [left, right] relative to the shoulder, per action. */
const ARMS: Partial<Record<Action, [[number, number], [number, number]]>> = {
  wave: [
    [-14, 22],
    [18, -26],
  ],
  cheer: [
    [-18, -26],
    [18, -26],
  ],
  jump: [
    [-18, -22],
    [18, -22],
  ],
  hug: [
    [16, 6],
    [24, 2],
  ],
  eat: [
    [-14, 22],
    [6, -8],
  ],
  drink: [
    [-14, 22],
    [6, -8],
  ],
  point: [
    [-14, 22],
    [30, -6],
  ],
  think: [
    [-14, 22],
    [4, -10],
  ],
  drive: [
    [14, 4],
    [24, 4],
  ],
  work: [
    [10, 12],
    [20, 12],
  ],
  read: [
    [10, 8],
    [20, 8],
  ],
  talk: [
    [-14, 18],
    [20, 6],
  ],
  dance: [
    [-20, -18],
    [22, 14],
  ],
  run: [
    [-18, 6],
    [20, -6],
  ],
  bow: [
    [-8, 24],
    [8, 24],
  ],
};

function avatarSvg(avatarId: string, expression: Expression, action: Action) {
  const h = hash(avatarId);
  // Unsigned shifts: a signed >> on a large hash gives a negative index (undefined colour).
  const shirt = SHIRTS[h % SHIRTS.length];
  const skin = SKIN[(h >>> 3) % SKIN.length];
  const hair = HAIR[(h >>> 6) % HAIR.length];
  const cx = AV_W / 2;
  const sitting =
    action === 'sit' ||
    action === 'drive' ||
    action === 'work' ||
    action === 'read' ||
    action === 'eat' ||
    action === 'drink';
  const lifted = action === 'jump' ? -10 : 0;
  const bodyTop = (sitting ? 60 : 50) + lifted;
  const headCy = bodyTop - 18;
  const [l, r] = ARMS[action] ?? [
    [-14, 22],
    [14, 22],
  ];
  const shoulderY = bodyTop + 8;
  const legs = sitting
    ? `<path d="M${cx - 8} ${bodyTop + 38} h-2 v20 M${cx + 8} ${bodyTop + 38} h14 v20" stroke="#2B2D42" stroke-width="6" fill="none" stroke-linecap="round"/>`
    : action === 'run' || action === 'walk' || action === 'dance'
      ? `<path d="M${cx - 6} ${bodyTop + 40} l-12 ${AV_H - bodyTop - 42} M${cx + 6} ${bodyTop + 40} l12 ${AV_H - bodyTop - 42}" stroke="#2B2D42" stroke-width="6" stroke-linecap="round"/>`
      : `<path d="M${cx - 7} ${bodyTop + 40} V${AV_H - 2 + lifted} M${cx + 7} ${bodyTop + 40} V${AV_H - 2 + lifted}" stroke="#2B2D42" stroke-width="6" stroke-linecap="round"/>`;
  const arms = `<path d="M${cx - 14} ${shoulderY} l${l[0]} ${l[1]} M${cx + 14} ${shoulderY} l${r[0]} ${r[1]}" stroke="${skin}" stroke-width="6" stroke-linecap="round"/>`;
  const handProp =
    action === 'drink'
      ? `<rect x="${cx + 16}" y="${shoulderY - 18}" width="10" height="14" rx="2" fill="#FFFFFF" stroke="#6C757D"/>`
      : action === 'read' || action === 'work'
        ? `<rect x="${cx + 4}" y="${shoulderY + 6}" width="30" height="18" rx="2" fill="#E9ECEF" stroke="#6C757D"/>`
        : '';
  const body =
    legs +
    `<rect x="${cx - 16}" y="${bodyTop}" width="32" height="44" rx="12" fill="${shirt}"/>` +
    arms +
    handProp +
    `<circle cx="${cx}" cy="${headCy}" r="20" fill="${skin}"/>` +
    `<path d="M${cx - 20} ${headCy - 2} a20 20 0 0 1 40 0 q-10 -8 -20 -6 q-10 -2 -20 6 z" fill="${hair}"/>` +
    face(expression, cx, headCy + 2);
  const transform =
    action === 'sleep'
      ? ` transform="rotate(-80 ${cx} ${AV_H / 2}) translate(0 20)"`
      : action === 'bow'
        ? ` transform="rotate(15 ${cx} ${AV_H})"`
        : '';
  return `<g${transform}>${body}</g>`;
}

// ---------- props / effects / bubble ----------

const PROP_GLYPHS: Record<string, string> = {
  table: '',
  plates: '🍽️',
  candle: '🕯️',
  sandwich: '🥪',
  teapot: '🫖',
  tea_cup: '🍵',
  coffee_cup: '☕',
  boba_cup: '🧋',
  pizza_box: '🍕',
  ramen_bowl: '🍜',
  chopsticks: '🥢',
  pancakes: '🥞',
  pan: '🍳',
  apron: '🧑‍🍳',
  ice_cream: '🍦',
  empty_plate: '🍽️',
  car: '🚗',
  map: '🗺️',
  suitcase: '🧳',
  ticket: '🎫',
  umbrella: '☂️',
  towel: '🏖️',
  key_card: '🔑',
  backpack: '🎒',
  tent: '⛺',
  campfire: '🔥',
  popcorn: '🍿',
  remote: '📺',
  blanket: '🛋️',
  controller: '🎮',
  light_stick: '🪄',
  microphone: '🎤',
  bowling_ball: '🎳',
  balloon: '🎈',
  board_game: '🎲',
  wine_glasses: '🥂',
  rose: '🌹',
  mirror: '🪞',
  bouquet: '💐',
  phone: '📱',
  pillow: '🛏️',
  snacks: '🍿',
  cookies: '🍪',
  camera: '📷',
  pet: '🐶',
  baby_bottle: '🍼',
  cake: '🎂',
  party_hat: '🥳',
  grad_cap: '🎓',
  diploma: '📜',
  glasses: '🥂',
  briefcase: '💼',
  rings: '💍',
  books: '📚',
  laptop: '💻',
  paper: '📝',
  pencil: '✏️',
  clock: '⏰',
  whiteboard: '📋',
  hammock: '🌴',
  dumbbell: '🏋️',
  shopping_cart: '🛒',
  shopping_bags: '🛍️',
  broom: '🧹',
  laundry_basket: '🧺',
  leash: '🦮',
  soup: '🍲',
  thermometer: '🌡️',
  calendar: '📅',
  christmas_tree: '🎄',
  gift: '🎁',
  pumpkin: '🎃',
  sunglasses: '🕶️',
  scarf: '🧣',
  picnic_blanket: '🧺',
  lantern: '🏮',
  banner: '🎉',
};

function propSvg(id: string) {
  if (id === 'table') {
    return `<rect x="0" y="0" width="120" height="10" rx="3" fill="#6D4C41"/><rect x="10" y="10" width="8" height="40" fill="#5D4037"/><rect x="102" y="10" width="8" height="40" fill="#5D4037"/>`;
  }
  const glyph = PROP_GLYPHS[id];
  if (glyph) return `<text x="20" y="32" font-size="30" text-anchor="middle">${glyph}</text>`;
  return `<rect x="2" y="8" width="36" height="28" rx="6" fill="#FFFFFF" stroke="#ADB5BD"/><text x="20" y="27" font-size="8" text-anchor="middle" fill="#6C757D">${esc(id.slice(0, 8))}</text>`;
}

function scatter(
  seed: string,
  n: number,
  draw: (x: number, y: number, i: number) => string,
  yMax = H,
) {
  let h = hash(seed);
  const next = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), h / 4294967296);
  return Array.from({ length: n }, (_, i) =>
    draw(Math.round(next() * W), Math.round(next() * yMax), i),
  ).join('');
}

function effectSvg(id: string): string {
  switch (id) {
    case 'confetti':
      return scatter(
        id,
        40,
        (x, y, i) =>
          `<rect x="${x}" y="${y}" width="6" height="10" fill="${SHIRTS[i % SHIRTS.length]}" transform="rotate(${(i * 37) % 360} ${x} ${y})"/>`,
        220,
      );
    case 'sparkles':
    case 'stars':
      return scatter(
        id,
        10,
        (x, y) =>
          `<path d="M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z" fill="#FFD60A"/>`,
        200,
      );
    case 'hearts':
    case 'hearts_small':
      return scatter(
        id,
        id === 'hearts' ? 12 : 6,
        (x, y) =>
          `<path d="M${x} ${y + 6} l-7 -7 a4 4 0 0 1 7 -5 a4 4 0 0 1 7 5 z" fill="#FF4D6D" opacity=".85"/>`,
        190,
      );
    case 'rain':
      return scatter(
        id,
        50,
        (x, y) =>
          `<line x1="${x}" y1="${y}" x2="${x - 4}" y2="${y + 12}" stroke="#90E0EF" stroke-width="2"/>`,
      );
    case 'rain_cloud':
      return (
        `<ellipse cx="200" cy="40" rx="70" ry="24" fill="#6C757D"/>` +
        scatter(
          id,
          14,
          (x, y) =>
            `<line x1="${150 + (x % 100)}" y1="${60 + (y % 60)}" x2="${146 + (x % 100)}" y2="${70 + (y % 60)}" stroke="#48CAE4" stroke-width="2"/>`,
        )
      );
    case 'snow':
      return scatter(
        id,
        50,
        (x, y) => `<circle cx="${x}" cy="${y}" r="2.5" fill="#FFFFFF" opacity=".9"/>`,
      );
    case 'steam':
    case 'steam_cup':
      return [0, 1, 2]
        .map(
          (i) =>
            `<path d="M${180 + i * 20} 120 q-8 -12 0 -24 q8 -12 0 -24" stroke="#ADB5BD" stroke-width="3" fill="none" opacity=".7"/>`,
        )
        .join('');
    case 'zzz':
      return `<text x="250" y="80" font-size="26" font-weight="700" fill="#5B4BDB">Z</text><text x="275" y="55" font-size="20" font-weight="700" fill="#5B4BDB">z</text><text x="292" y="38" font-size="14" font-weight="700" fill="#5B4BDB">z</text>`;
    case 'sweat_drop':
      return `<path d="M250 60 q-8 14 0 18 q8 -4 0 -18 z" fill="#48CAE4"/>`;
    case 'exclamation':
      return `<text x="250" y="70" font-size="44" font-weight="900" fill="#E63946">!</text>`;
    case 'question_marks':
      return `<text x="240" y="70" font-size="36" font-weight="900" fill="#5B4BDB">?</text><text x="275" y="50" font-size="26" font-weight="900" fill="#5B4BDB">?</text>`;
    case 'music_notes':
      return scatter(
        id,
        6,
        (x, y) => `<text x="${x}" y="${y}" font-size="22" fill="#5B4BDB">♪</text>`,
        180,
      );
    case 'fireworks':
      return [
        [90, 60, '#FFD60A'],
        [300, 50, '#FF4D6D'],
        [200, 30, '#48CAE4'],
      ]
        .map(([x, y, c]) =>
          Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return `<line x1="${x}" y1="${y}" x2="${Math.round(Number(x) + Math.cos(a) * 28)}" y2="${Math.round(Number(y) + Math.sin(a) * 28)}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`;
          }).join(''),
        )
        .join('');
    case 'moon_stars':
      return (
        `<circle cx="340" cy="50" r="22" fill="#FFF3B0"/><circle cx="350" cy="44" r="20" fill="#3A506B" opacity=".9"/>` +
        scatter(id, 10, (x, y) => `<circle cx="${x}" cy="${y % 120}" r="1.8" fill="#FFFFFF"/>`)
      );
    case 'sunrise':
    case 'sun_rays':
      return (
        `<circle cx="340" cy="60" r="24" fill="#FFD60A"/>` +
        Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return `<line x1="${340 + Math.cos(a) * 30}" y1="${60 + Math.sin(a) * 30}" x2="${340 + Math.cos(a) * 42}" y2="${60 + Math.sin(a) * 42}" stroke="#FFD60A" stroke-width="3"/>`;
        }).join('')
      );
    case 'clouds':
      return `<ellipse cx="80" cy="200" rx="60" ry="20" fill="#FFFFFF" opacity=".9"/><ellipse cx="320" cy="80" rx="50" ry="18" fill="#FFFFFF" opacity=".9"/>`;
    case 'motion_lines':
    case 'speech_lines':
      return [0, 1, 2]
        .map(
          (i) =>
            `<line x1="20" y1="${150 + i * 18}" x2="${80 - i * 10}" y2="${150 + i * 18}" stroke="#ADB5BD" stroke-width="3" stroke-linecap="round"/>`,
        )
        .join('');
    case 'petals':
    case 'leaves':
      return scatter(
        id,
        20,
        (x, y, i) =>
          `<ellipse cx="${x}" cy="${y}" rx="5" ry="3" fill="${id === 'petals' ? '#FFAFCC' : ['#E76F51', '#F4A261', '#E9C46A'][i % 3]}" transform="rotate(${i * 29} ${x} ${y})"/>`,
        220,
      );
    case 'balloons':
      return [
        [40, 70, '#E63946'],
        [70, 50, '#FFD60A'],
        [350, 60, '#5B4BDB'],
      ]
        .map(
          ([x, y, c]) =>
            `<ellipse cx="${x}" cy="${y}" rx="14" ry="18" fill="${c}"/><line x1="${x}" y1="${Number(y) + 18}" x2="${x}" y2="${Number(y) + 70}" stroke="#6C757D"/>`,
        )
        .join('');
    case 'spotlights':
    case 'disco_lights':
    case 'lights':
    case 'screen_glow':
      return scatter(
        id,
        8,
        (x, y, i) =>
          `<circle cx="${x}" cy="${y % 150}" r="18" fill="${SHIRTS[i % SHIRTS.length]}" opacity=".25"/>`,
      );
    case 'camera_flash':
      return `<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF" opacity=".25"/>`;
    case 'bats':
      return scatter(
        id,
        5,
        (x, y) =>
          `<path d="M${x} ${y % 120} q6 -8 12 0 q6 -8 12 0 q-12 6 -24 0 z" fill="#2B2D42"/>`,
      );
    default:
      return effectSvg('sparkles');
  }
}

function bubbleSvg(text: string): AssetRef {
  const w = Math.max(70, Math.min(320, 24 + text.length * 8.4));
  const h = 40;
  return svg(
    w,
    h + 12,
    [w / 2, h + 12],
    `<rect x="1" y="1" width="${w - 2}" height="${h}" rx="16" fill="#FFFFFF" stroke="#2B2D42" stroke-width="2"/>` +
      `<path d="M${w / 2 - 8} ${h} L${w / 2} ${h + 11} L${w / 2 + 8} ${h}" fill="#FFFFFF" stroke="#2B2D42" stroke-width="2"/>` +
      `<rect x="${w / 2 - 7}" y="${h - 3}" width="14" height="5" fill="#FFFFFF"/>` +
      `<text x="${w / 2}" y="${h / 2 + 6}" font-family="system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="middle" fill="#2B2D42">${esc(text)}</text>`,
  );
}

export class PlaceholderAssetProvider implements AssetProvider {
  readonly name = 'placeholder';
  readonly canvas = { width: W, height: H };

  background(id: string, timeOfDay: TimeOfDay): AssetRef {
    const [top, bottom] = SKY[timeOfDay];
    const gid = `sky_${timeOfDay}`;
    return svg(
      W,
      H,
      [0, 0],
      `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#${gid})"/>` +
        placeMotif(id, timeOfDay),
    );
  }

  avatar(avatarId: string, expression: Expression, action: Action): AssetRef {
    return svg(AV_W, AV_H, [AV_W / 2, AV_H], avatarSvg(avatarId, expression, action));
  }

  prop(id: string): AssetRef {
    return id === 'table'
      ? svg(120, 50, [60, 50], propSvg(id))
      : svg(40, 40, [20, 40], propSvg(id));
  }

  effect(id: string): AssetRef {
    return svg(W, H, [0, 0], effectSvg(id));
  }

  bubble(text: string): AssetRef {
    return bubbleSvg(text);
  }
}
