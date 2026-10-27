// The pet's pixel art, traced from Claude's own mascot: every frame is a
// grid of characters, one per art pixel, drawn on a canvas of 20x12.
//
//   '.' transparent  'O' body  'S' body, shaded  'E' eye
//   'c' light grey   'd' dark grey  'W' white  'Y' yellow
//   'F' flame  'f' flame, inner  'R' red  'B' blue

export const COLUMNS = 28
export const ROWS = 12

export const PALETTE: Record<string, string> = {
  O: '#D06A4B',
  S: '#B55C41',
  E: '#1D1D1D',
  c: '#A0A0A0',
  d: '#5A5A5A',
  W: '#E6E6E6',
  Y: '#E8C547',
  F: '#FF7A1A',
  f: '#FFD166',
  R: '#CF3B3B',
  B: '#4AA3DF',
}

export type Grid = string[]

const EMPTY = '.'.repeat(COLUMNS)

// Pads a drawing to the canvas: `rows` sit at `x` from the left, their last
// row on the canvas's last row.
function place(rows: string[], x: number): Grid {
  const padded = rows.map(row => (EMPTY.slice(0, x) + row + EMPTY).slice(0, COLUMNS))

  return [...Array<string>(ROWS - padded.length).fill(EMPTY), ...padded]
}

// Draws `rows` onto `grid` with their top-left at (x, y); '.' leaves the
// cell as it was.
function stamp(grid: Grid, rows: string[], x: number, y: number): Grid {
  const cells = grid.map(row => row.split(''))
  rows.forEach((row, j) => {
    const target = cells[y + j]
    if (target === undefined) return
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch !== undefined && ch !== '.' && x + i >= 0 && x + i < COLUMNS) target[x + i] = ch
    }
  })

  return cells.map(row => row.join(''))
}

const BLANK: Grid = Array<string>(ROWS).fill(EMPTY)

// Facing us. Eyes glance by one pixel; `closed` is a blink.
export function front(eyes: -1 | 0 | 1 | 'closed' | 'sleepy', legs: 'stand' | 'stepA' | 'stepB' | 'sit' = 'stand'): Grid {
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

  return place([...body, ...feet], 6)
}

// The hop from the mascot's own animation: arms up, body stretched.
export const HOP: Grid = place(
  ['.OO...OO.', 'SOOSSSOOS', 'SOOOOOOOO', '.OEOOOOEO', '.OOOOOOOO', '.OOOOOOOO', '.OOOOOOOO', '.OOOOOOOO', '.O.O..O.O', '.O.O..O.O'],
  6,
)

// Pulling the laptop out from above, then setting it down: three frames.
export const PULL: Grid = place(
  ['c...........', 'c...........', '..SS........', '..OOOOOOOOOO', '....OEOOOOEO', '....OOOOOOOOOO', '....OOOOOOOOOO', '....OOOOOOOO', '....OOOOOOOO', '....O.O..O.O', '....O.O..O.O'],
  4,
)
export const SET: Grid = place(
  ['.......OOOOOOOO', '.......OEOOOOEO', '.......OOOOOOOOOO', '.......OOOOOOOOOO', '.....OOOOOOOOOO', 'c......O.O..O.O', '.c.....O.O..O.O', '..ccc..O.O..O.O'].map(r => r),
  1,
)

// Hunched over the laptop, three-quarter view, hammering the keys.
export const TYPE_A: Grid = place(
  ['......OOOOOOSS', '.......OOOEOSS', '....OOOOOOOOSS', '....OOOOOOOOSS', 'c.....OOOOOOSS', '.c..SSO.O..O.S', '..ccO.O.O..S..'],
  1,
)
export const TYPE_B: Grid = place(
  ['......OOOOOOSS', '.......OOOEOSS', '....SSOOOOOOSS', '....SSOOOOOOSS', 'c...OOOOOOOOSS', '.c..OOO.O..O.S', '..ccc.O.O..S..'],
  1,
)

// Riding a rocket, flame flickering: two frames.
const HULL = ['......ccccccccccccc....', '.RR..cWWWWWWWWWWWWWcc..', 'RRRR.cWWWWWWBBWWWWWWWcR', 'RRRR.cWWWWWWBBWWWWWWWcR', '.RR..cWWWWWWWWWWWWWcc..', '......ccccccccccccc....']
function rocketFrame(flame: string[]): Grid {
  let grid = stamp(BLANK, HULL, 4, 6)
  grid = stamp(grid, front(0).slice(ROWS - 8).map(row => row.slice(6, 18)), 8, 0)
  return stamp(grid, flame, 0, 7)
}
export const ROCKET_A: Grid = rocketFrame(['..F.', '.fFF', '..F.'])
export const ROCKET_B: Grid = rocketFrame(['.FF.', 'ffFF', '.FF.'])

// Hard hat and hammer, striking an anvil: up, then down with sparks.
const ANVIL = ['dddddddd', '..dddd..', '..dddd..', '.dddddd.']
function engineerFrame(hammer: string[], hammerAt: [number, number], sparks: [number, number][]): Grid {
  let grid = stamp(BLANK, ['...YYYYYYYY...', '..YYYYYYYYYY..'], 1, 2)
  grid = stamp(grid, front(0).slice(ROWS - 8).map(row => row.slice(4, 18)), 1, 4)
  grid = stamp(grid, ANVIL, 16, 8)
  grid = stamp(grid, hammer, hammerAt[0], hammerAt[1])
  return stamp(grid, sparks.map(() => ''), 0, 0).map((row, y) => {
    const cells = row.split('')
    sparks.forEach(([x, sy], i) => {
      if (sy === y && x < COLUMNS) cells[x] = i % 2 ? 'f' : 'Y'
    })
    return cells.join('')
  })
}
export const ENGINEER_UP: Grid = engineerFrame(['..dd', '..dd', '.c..', 'c...'], [15, 2], [])
export const ENGINEER_DOWN: Grid = engineerFrame(['...dd', 'cccdd', '...dd'], [15, 5], [[21, 4], [24, 6], [14, 3], [22, 2], [25, 3]])

export function colorOf(pixel: string | undefined): string | null {
  return pixel === undefined ? null : (PALETTE[pixel] ?? null)
}
