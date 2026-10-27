// The terminal pet: a Raster of half-block cells (two pixels per cell, one
// above the other), repainted on a timer with $.ui.blit.

import type { Mood } from '../types'
import { HEIGHT, WIDTH, colorOf, sprite } from './sprites'
import type { Pose } from './sprites'

export const ROWS = HEIGHT / 2

const DEFAULT = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄
const FULL = 0x2588 // █
const SPACE = 0x20
const ACCENT = 0xd97757

const SPARK = ['.', '+', '*', '+']
const SNORE = ['z', 'z', 'Z', 'Z', ' ', ' ']

export type Walker = {
  x: number
  dir: 1 | -1
  tick: number
  pause: number
  blink: number
}

export function newWalker(columns: number): Walker {
  return {
    x: Math.floor(Math.random() * Math.max(1, columns - WIDTH)),
    dir: Math.random() < 0.5 ? 1 : -1,
    tick: 0,
    pause: 0,
    blink: 0,
  }
}

type Frame = { pose: Pose; glyph: string | null }

// Moves the walker one tick on and answers what to draw.
export function step(walker: Walker, mood: Mood, columns: number): Frame {
  walker.tick += 1
  const room = Math.max(0, columns - WIDTH - 2)
  walker.x = Math.min(walker.x, room)

  if (mood === 'sleeping') {
    const glyph = SNORE[Math.floor(walker.tick / 4) % SNORE.length] ?? ' '

    return { pose: { eyes: 'sleepy', arms: 'out', legs: 'sit' }, glyph }
  }

  if (mood === 'happy') {
    const arms = Math.floor(walker.tick / 2) % 2 === 0 ? 'up' : 'out'

    return { pose: { eyes: 0, arms, legs: 'stand' }, glyph: '*' }
  }

  const isWorking = mood === 'working'
  const eyes = blinks(walker) ? 'closed' : undefined

  if (walker.pause > 0) {
    walker.pause -= 1

    return { pose: { eyes: eyes ?? 0, arms: 'out', legs: 'stand' }, glyph: null }
  }

  const moves = isWorking || walker.tick % 2 === 0
  if (moves) {
    if (walker.x + walker.dir < 0 || walker.x + walker.dir > room) {
      walker.dir = walker.dir === 1 ? -1 : 1
    }
    walker.x += walker.dir
    if (!isWorking && Math.random() < 0.04) {
      walker.pause = 8 + Math.floor(Math.random() * 24)
    }
  }

  const legs = Math.floor(walker.tick / (isWorking ? 1 : 2)) % 2 === 0 ? 'stepA' : 'stepB'
  const glyph = isWorking ? (SPARK[walker.tick % SPARK.length] ?? null) : null

  return { pose: { eyes: eyes ?? 0, arms: 'out', legs }, glyph }
}

function blinks(walker: Walker): boolean {
  if (walker.blink > 0) {
    walker.blink -= 1

    return true
  }
  if (Math.random() < 0.03) {
    walker.blink = 1
  }

  return false
}

function rgb(hex: string): number {
  return parseInt(hex.slice(1), 16)
}

// Packs the frame as RasterProps.cells: `columns * ROWS` little-endian u32
// triplets [codePoint, foreground, background], base64.
export function cells(walker: Walker, frame: Frame, columns: number): string {
  const words = new Uint32Array(columns * ROWS * 3)
  const art = sprite(frame.pose)

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < columns; col++) {
      const at = (row * columns + col) * 3
      const local = col - walker.x
      const top = colorOf(art[row * 2]?.[local])
      const bottom = colorOf(art[row * 2 + 1]?.[local])
      words[at + 1] = DEFAULT
      words[at + 2] = DEFAULT

      if (top !== null && bottom !== null) {
        words[at] = top === bottom ? FULL : UPPER
        words[at + 1] = rgb(top)
        if (top !== bottom) {
          words[at + 2] = rgb(bottom)
        }
      } else if (top !== null) {
        words[at] = UPPER
        words[at + 1] = rgb(top)
      } else if (bottom !== null) {
        words[at] = LOWER
        words[at + 1] = rgb(bottom)
      } else {
        words[at] = SPACE
      }
    }
  }

  if (frame.glyph !== null) {
    const side = walker.x + WIDTH + 1 < columns ? walker.x + WIDTH : walker.x - 2
    if (side >= 0) {
      const at = side * 3
      words[at] = frame.glyph.charCodeAt(0)
      words[at + 1] = ACCENT
    }
  }

  return base64(words)
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(words: Uint32Array): string {
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word, true))

  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]
    out += ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }

  return out
}
