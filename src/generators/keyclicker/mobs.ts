/**
 * Blocky mob faces for the mob clicker: an 8 x 8 pixel grid each, top row
 * first, one letter per pixel naming a colour in the mob's palette.
 *
 * Every mob keeps to four colours, body included, so a whole head prints on a
 * four-slot multi-material unit without a manual swap. Where a face would want
 * a fifth, the nearest colour already in the palette stands in for it.
 */
export interface Mob {
  readonly label: string;
  /** The cube the head pushes into. */
  readonly body: string;
  /** The letter that is the head itself; every other letter is inlaid into it. */
  readonly base: string;
  readonly palette: Readonly<Record<string, string>>;
  /** Names for the inlay parts, so the plate list says what each colour is. */
  readonly names: Readonly<Record<string, string>>;
  readonly face: readonly string[];
}

export const MOBS: Readonly<Record<string, Mob>> = {
  creeper: {
    label: 'Creeper',
    body: '#3fae49',
    base: 'G',
    palette: { G: '#3fae49', K: '#161616' },
    names: { K: 'Face' },
    face: [
      'GGGGGGGG',
      'GGGGGGGG',
      'GKKGGKKG',
      'GKKGGKKG',
      'GGGKKGGG',
      'GGKKKKGG',
      'GGKKKKGG',
      'GGKGGKGG',
    ],
  },
  pig: {
    label: 'Pig',
    body: '#f0a5a2',
    base: 'P',
    palette: { P: '#f0a5a2', W: '#f5f5f5', K: '#161616', S: '#e47c87' },
    names: { W: 'Eye whites', K: 'Eyes and nostrils', S: 'Snout' },
    face: [
      'PPPPPPPP',
      'PPPPPPPP',
      'PPPPPPPP',
      'WKPPPPKW',
      'PPSSSSPP',
      'PPKSSKPP',
      'PPSSSSPP',
      'PPPPPPPP',
    ],
  },
  sheep: {
    label: 'Sheep',
    body: '#f2f2f2',
    base: 'F',
    palette: { F: '#d9b48c', W: '#f2f2f2', K: '#161616', N: '#f19fb4' },
    names: { W: 'Wool and eye whites', K: 'Eyes', N: 'Nose' },
    face: [
      'WWWWWWWW',
      'WFFFFFFW',
      'FFFFFFFF',
      'FWKFFKWF',
      'FFFFFFFF',
      'FFFNNFFF',
      'FFFNNFFF',
      'FFFFFFFF',
    ],
  },
  spider: {
    label: 'Spider',
    body: '#26262a',
    base: 'D',
    palette: { D: '#26262a', R: '#d4232b' },
    names: { R: 'Eyes' },
    face: [
      'DDDDDDDD',
      'DDDDDDDD',
      'DDDDDDDD',
      'DDRDDRDD',
      'DRRRRRRD',
      'RDRDDRDR',
      'DDDDDDDD',
      'DDDDDDDD',
    ],
  },
  zombie: {
    label: 'Zombie',
    body: '#2f8f9d',
    base: 'Z',
    palette: { Z: '#5b9a3c', H: '#365a24', K: '#161616' },
    names: { H: 'Hair and nose', K: 'Eyes' },
    face: [
      'HHHHHHHH',
      'HHZZZZHH',
      'ZZZZZZZZ',
      'ZKKZZKKZ',
      'ZZZHHZZZ',
      'ZZZZZZZZ',
      'ZZHHHHZZ',
      'ZZZZZZZZ',
    ],
  },
  skeleton: {
    label: 'Skeleton',
    body: '#c9c9c9',
    base: 'S',
    palette: { S: '#c9c9c9', K: '#161616', D: '#6e6e6e' },
    names: { K: 'Eyes', D: 'Nose and mouth' },
    face: [
      'SSSSSSSS',
      'SSSSSSSS',
      'SSSSSSSS',
      'SKKSSKKS',
      'SSSDDSSS',
      'SSSSSSSS',
      'SDDDDDDS',
      'SSSSSSSS',
    ],
  },
  cow: {
    label: 'Cow',
    body: '#4e3422',
    base: 'B',
    palette: { B: '#4e3422', W: '#f2f2f2', K: '#161616', M: '#b8b0a8' },
    names: { W: 'Patches and eye whites', K: 'Eyes and nostrils', M: 'Muzzle' },
    face: [
      'BBBBBBBB',
      'BBBBBWWB',
      'BBBBBWWB',
      'WKBBBBKW',
      'BBBBBBBB',
      'BBMMMMBB',
      'BMKMMKMB',
      'BMMMMMMB',
    ],
  },
  wolf: {
    label: 'Wolf',
    body: '#e8e6e2',
    base: 'W',
    palette: { W: '#e8e6e2', T: '#c9945c', K: '#161616' },
    names: { T: 'Fur markings', K: 'Eyes and nose' },
    face: [
      'WWWWWWWW',
      'WWWWWWWW',
      'TKWWWWKT',
      'TTWWWWTT',
      'TTWKKWTT',
      'TTWWWWTT',
      'WWWWWWWW',
      'WWWWWWWW',
    ],
  },
};
