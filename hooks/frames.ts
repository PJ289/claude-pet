// The pet's pixel art, traced from Claude's own mascot: every frame is a
// grid of characters, one per art pixel, drawn on a canvas of 28x14 whose
// bottom row is the floor.
//
//   '.' transparent  'O' body  'S' body, shaded  'E' eye
//   'c' light grey   'd' dark grey  'L' lit screen edge  'B' sweat
//   'N' night blue   'W' white

export const COLUMNS = 28
export const ROWS = 14

export const PALETTE: Record<string, string> = {
  O: '#D06A4B',
  S: '#B55C41',
  E: '#1D1D1D',
  c: '#9A9A96',
  d: '#4E4E4B',
  L: '#CFE8FF',
  B: '#6FB7FF',
  N: '#4A6FA5',
  W: '#EDEDEA',
}

export type Grid = string[]

const EMPTY = '.'.repeat(COLUMNS)

// Pads a drawing to the canvas: `rows` sit at `x` from the left, their last
// row on the floor.
function place(rows: string[], x: number): Grid {
  const padded = rows.map(row => (EMPTY.slice(0, x) + row + EMPTY).slice(0, COLUMNS))

  return [...Array<string>(ROWS - padded.length).fill(EMPTY), ...padded]
}

// Where the standing pet's left edge is, so every pose lines up with it.
const AT = 6

export type Eyes = -1 | 0 | 1 | 'closed' | 'sleepy'

// Facing us. Eyes glance by one pixel; `closed` is a blink.
export type Legs = 'stand' | 'sit' | 'stepA' | 'stepB'

export function front(eyes: Eyes, legs: Legs = 'stand'): Grid {
  const head = '..OOOOOOOO..'
  const eyeRow = head.split('')
  if (eyes === 'sleepy') {
    for (const col of [3, 4, 7, 8]) eyeRow[col] = 'E'
  } else if (eyes !== 'closed') {
    eyeRow[3 + eyes] = 'E'
    eyeRow[8 + eyes] = 'E'
  }
  const body = [head, eyeRow.join(''), 'OOOOOOOOOOOO', 'OOOOOOOOOOOO', '..OOOOOOOO..', '..OOOOOOOO..']
  const feet = {
    stand: ['..O.O..O.O..', '..O.O..O.O..'],
    stepA: ['..O.O..O.O..', '..O....O....'],
    stepB: ['..O.O..O.O..', '....O....O..'],
    sit: [],
  }[legs]

  return place([...body, ...feet], AT)
}

// Squashed, for the moment before a jump and the landing.
export const CROUCH: Grid = place(
  ['..OOOOOOOOOO..', '..OEOOOOOOEO..', 'OOOOOOOOOOOOOO', 'OOOOOOOOOOOOOO', '..OOOOOOOOOO..', '..O.O....O.O..'],
  AT - 1,
)

// Stretched in the air: the mascot's own hop, arms up.
export const STRETCH: Grid = place(
  ['.OO...OO.', 'SOOSSSOOS', 'SOOOOOOOO', '.OEOOOOEO', '.OOOOOOOO', '.OOOOOOOO', '.OOOOOOOO', '.OOOOOOOO', '.O.O..O.O', '.O.O..O.O'],
  AT + 1,
)

// Scratching its head, puzzled: the arm up at the side, moving.
export const SCRATCH_A: Grid = place(
  ['..OOOOOOOO.O', '..OEOOOOEOOO', 'OOOOOOOOOO..', 'OOOOOOOOOO..', '..OOOOOOOO..', '..OOOOOOOO..', '..O.O..O.O..', '..O.O..O.O..'],
  AT,
)
export const SCRATCH_B: Grid = place(
  ['..OOOOOOOOO.', '..OEOOOOEOOO', 'OOOOOOOOOO..', 'OOOOOOOOOO..', '..OOOOOOOO..', '..OOOOOOOO..', '..O.O..O.O..', '..O.O..O.O..'],
  AT,
)

// A nightcap, drawn over whichever pose's head: three rows ending at the
// head's top row.
export function capped(grid: Grid): Grid {
  const top = bounds(grid).top
  const cap = ['.........W..', '...NNNNNNW..', '..NNNNNNNN..']
  return grid.map((row, y) => {
    const capRow = cap[y - (top - cap.length)]
    if (capRow === undefined) return row
    const cells = row.split('')
    for (let i = 0; i < capRow.length; i++) {
      const ch = capRow[i]
      if (ch !== undefined && ch !== '.') cells[AT + i] = ch
    }

    return cells.join('')
  })
}

// Three-quarter views and the back, for a spin: the shade marks the far side.
export const SIDE_L: Grid = place(
  ['.OOOOOOSS.', '.OOOOEOSS.', 'OOOOOOOOSS', 'OOOOOOOOSS', '.OOOOOOSS.', '.OOOOOOSS.', '.O.O..O.S.', '.O.O..O.S.'],
  AT + 1,
)
export const SIDE_R: Grid = SIDE_L.map(row => row.split('').reverse().join(''))
export const BACK: Grid = place(
  ['..OOOOOOOO..', '..OOOOOOOO..', 'OOOOOOOOOOOO', 'OOOOOOOOOOOO', '..SSSSSSSS..', '..SSSSSSSS..', '..O.O..O.O..', '..O.O..O.O..'],
  AT,
)

// Pulling the laptop out from above, then setting it down beside it.
export const PULL: Grid = place(
  ['c...........', 'c...........', '..SS........', '..OOOOOOOOOO', '....OEOOOOEO', '....OOOOOOOOOO', '....OOOOOOOOOO', '....OOOOOOOO', '....OOOOOOOO', '....O.O..O.O', '....O.O..O.O'],
  AT - 2,
)
export const SET: Grid = place(
  ['.......OOOOOOOO', '.......OEOOOOEO', '.......OOOOOOOOOO', '.......OOOOOOOOOO', '.....OOOOOOOOOO', 'c......O.O..O.O', 'Lc.....O.O..O.O', '..ccc..O.O..O.O'],
  AT - 5,
)

// Hunched over the laptop, three-quarter view, hammering the keys. The
// screen's lit edge faces the pet.
export const TYPE_A: Grid = place(
  ['......OOOOOOSS', '.......OOOEOSS', '....OOOOOOOOSS', '....OOOOOOOOSS', 'c.....OOOOOOSS', 'Lc..SSO.O..O.S', '..ccO.O.O..S..'],
  AT - 5,
)
export const TYPE_B: Grid = place(
  ['......OOOOOOSS', '.......OOOEOSS', '....SSOOOOOOSS', '....SSOOOOOOSS', 'c...OOOOOOOOSS', 'Lc..OOO.O..O.S', '..ccc.O.O..S..'],
  AT - 5,
)

// The frame's pixel box: left, top, width and height in art pixels.
export function bounds(grid: Grid): { left: number; top: number; width: number; height: number } {
  let left = COLUMNS
  let right = -1
  let top = ROWS
  let bottom = -1
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '.') {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
  })

  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

export function colorOf(pixel: string | undefined): string | null {
  return pixel === undefined ? null : (PALETTE[pixel] ?? null)
}
