/**
 * Text normalisation shared by the parser and by catalog tags, so both sides match the same
 * way: lowercase, straight quotes, contractions and chat shorthand expanded, emoji mapped to
 * words, punctuation stripped except sentence marks.
 */

const EMOJI_WORDS: [RegExp, string][] = [
  [/😂|🤣|😆/gu, ' lol '],
  [/😭|😢|😿/gu, ' crying '],
  [/😡|🤬|😠/gu, ' angry '],
  [/😴|🥱/gu, ' sleepy '],
  [/🥳|🎉|🎊/gu, ' celebrate '],
  [/🎂/gu, ' birthday '],
  [/🍕/gu, ' pizza '],
  [/🍜/gu, ' ramen '],
  [/☕/gu, ' coffee '],
  [/🧋/gu, ' boba '],
  [/🍦|🍨/gu, ' ice cream '],
  [/🎬|🍿/gu, ' movie '],
  [/🎮/gu, ' gaming '],
  [/✈️|✈/gu, ' flight '],
  [/🏖️|🏖/gu, ' beach '],
  [/🎄|🎅/gu, ' christmas '],
  [/🎃|👻/gu, ' halloween '],
  [/❄️|☃️|⛄/gu, ' snow '],
  [/🌧️|☔/gu, ' rain '],
  [/🙏/gu, ' thank you '],
  [/👋/gu, ' hi '],
  [/😍|🥰|😘/gu, ' heart eyes '],
  [/🤗/gu, ' hug '],
  [/😱|😮|😲/gu, ' omg '],
  [/😰|😬/gu, ' nervous '],
];

const SHORTHAND: [RegExp, string][] = [
  [/\bcan't\b|\bcant\b/g, 'can not'],
  [/\bcannot\b/g, 'can not'],
  [/\bwon't\b|\bwont\b/g, 'will not'],
  [/\bain't\b/g, 'is not'],
  [/n't\b/g, ' not'],
  [/\b(dont|doesnt|didnt|isnt|arent|wasnt|werent|couldnt|wouldnt|shouldnt|havent|hasnt)\b/g, '$1#'],
  [/\bi'm\b|\bim\b/g, 'i am'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/'d\b/g, ' would'],
  [/\blet's\b|\blets\b/g, 'let us'],
  [/\b(it|that|what|there|he|she|who|where|how)'s\b/g, '$1 is'],
  [/'s\b/g, ''],
  [/\bgonna\b/g, 'going to'],
  [/\bwanna\b/g, 'want to'],
  [/\bgotta\b/g, 'got to'],
  [/\bu\b/g, 'you'],
  [/\bur\b/g, 'your'],
  [/\br\b/g, 'are'],
  [/\bya\b/g, 'you'],
  [/\b(pls|plz)\b/g, 'please'],
  [/\b(tmrw|tmr|tmrrw|tomoz|2moro|2mrw)\b/g, 'tomorrow'],
  [/\b(tonite|2nite|tnite)\b/g, 'tonight'],
  [/\brn\b/g, 'right now'],
  [/\bidk\b/g, 'i do not know'],
  [/\bidc\b/g, 'i do not care'],
  [/\bbc\b|\bcuz\b|\bcause\b/g, 'because'],
  [/\bppl\b/g, 'people'],
  [/\bsry\b|\bsrry\b/g, 'sorry'],
  [/\bgr8\b/g, 'great'],
  [/\b(b4)\b/g, 'before'],
  [/\bl8r\b/g, 'later'],
  [/\bm8\b/g, 'mate'],
  [/\bngl\b/g, 'not going to lie'],
  [/\btbh\b/g, 'to be honest'],
  [/\bok+ay\b|\bk\b/g, 'okay'],
];

const NEG_EXPAND: Record<string, string> = {
  'dont#': 'do not',
  'doesnt#': 'does not',
  'didnt#': 'did not',
  'isnt#': 'is not',
  'arent#': 'are not',
  'wasnt#': 'was not',
  'werent#': 'were not',
  'couldnt#': 'could not',
  'wouldnt#': 'would not',
  'shouldnt#': 'should not',
  'havent#': 'have not',
  'hasnt#': 'has not',
};

export function normalize(input: string): string {
  let s = input
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"');
  for (const [re, w] of EMOJI_WORDS) s = s.replace(re, w);
  for (const [re, w] of SHORTHAND) s = s.replace(re, w);
  s = s.replace(/\b[a-z]+#/g, (m) => NEG_EXPAND[m] ?? m.slice(0, -1));
  // Keep sentence marks as separate tokens; drop other punctuation.
  s = s
    .replace(/([?!.,;])/g, ' $1 ')
    .replace(/[^a-z0-9?!.,;'\s/]/g, ' ')
    .replace(/'/g, '');
  // Squash stretched letters ("sooooo" -> "so", "yaaay" -> "yay") so tags still match.
  s = s.replace(/([a-z])\1{2,}/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}

/** Same as normalize() but without sentence marks; used for catalog tags. */
export const normalizeTag = (tag: string) =>
  normalize(tag)
    .replace(/[?!.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const tokenize = (normalized: string) => normalized.split(' ').filter(Boolean);
