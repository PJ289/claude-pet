// The pet's pixel art: an 11x6 grid, one character per pixel.
//   '.' transparent   'O' body   'E' eye

export const WIDTH = 11
export const HEIGHT = 6

export const BODY = '#D97757'
export const EYE = '#1F1E1D'

export type Eyes = -1 | 0 | 1 | 'closed' | 'sleepy'
export type Arms = 'out' | 'up'
export type Legs = 'stand' | 'stepA' | 'stepB' | 'sit'

export type Pose = { eyes: Eyes; arms: Arms; legs: Legs }

const LEGS: Record<Exclude<Legs, 'sit'>, [string, string]> = {
  stand: ['..O.O.O.O..', '..O.O.O.O..'],
  stepA: ['..O.O.O.O..', '..O...O....'],
  stepB: ['..O.O.O.O..', '....O...O..'],
}

function withEyes(row: string, eyes: Eyes): string {
  if (eyes === 'closed') {
    return row
  }
  const cells = row.split('')
  if (eyes === 'sleepy') {
    // Shut eyes: two short dashes.
    for (const col of [3, 4, 6, 7]) {
      cells[col] = 'E'
    }

    return cells.join('')
  }
  cells[3 + eyes] = 'E'
  cells[7 + eyes] = 'E'

  return cells.join('')
}

// The head, eyes and arms: four rows.
export function torso(eyes: Eyes, arms: Arms): string[] {
  const side = arms === 'up' ? 'O.OOOOOOO.O' : '..OOOOOOO..'

  return [side, withEyes(side, eyes), 'OOOOOOOOOOO', '..OOOOOOO..']
}

export function legs(kind: Exclude<Legs, 'sit'>): [string, string] {
  return LEGS[kind]
}

export function sprite(pose: Pose): string[] {
  const top = torso(pose.eyes, pose.arms)
  if (pose.legs === 'sit') {
    return ['...........', '...........', ...top]
  }

  return [...top, ...legs(pose.legs)]
}

export function colorOf(pixel: string | undefined): string | null {
  if (pixel === 'O') {
    return BODY
  }
  if (pixel === 'E') {
    return EYE
  }

  return null
}
