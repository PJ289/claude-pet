// The desktop pet: one SVG whose SMIL animations flip through the frames,
// walk, hop and fly it, so the surface animates it with no redraws. A new
// mood draws a new SVG.

import type { Mood } from '../types'
import {
  COLUMNS,
  ENGINEER_DOWN,
  ENGINEER_UP,
  HOP,
  PULL,
  ROCKET_A,
  ROCKET_B,
  ROWS,
  SET,
  TYPE_A,
  TYPE_B,
  colorOf,
  front,
} from './frames'
import type { Grid } from './frames'

// CSS pixels per art pixel.
export const SCALE = 4
const FRAME_W = COLUMNS * SCALE
const FRAME_H = ROWS * SCALE
// Headroom above the frame for a hop or a snore; the pet stands on the
// bottom edge, right on top of the prompt box.
export const STRIP_H = FRAME_H + 12
const TOP = STRIP_H - FRAME_H
const BODY = '#D06A4B'

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

function rects(grid: Grid): string {
  let out = ''
  grid.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const color = colorOf(row[x])
      let end = x + 1
      while (end < row.length && colorOf(row[end]) === color) end += 1
      if (color !== null) {
        out += `<rect x="${x * SCALE}" y="${y * SCALE}" width="${(end - x) * SCALE}" height="${SCALE}" fill="${color}"/>`
      }
      x = end
    }
  })

  return out
}

function discrete(values: number[], keyTimes: number[], dur: number): string {
  return `<animate attributeName="opacity" values="${values.join(';')}" keyTimes="${keyTimes.map(fmt).join(';')}" dur="${fmt(dur)}s" calcMode="discrete" repeatCount="indefinite"/>`
}

// One step of a clip: a frame, or a nested clip that cycles while shown.
type Step = { ms: number; grid?: Grid; cycle?: Step[] }

// Shows the clip's steps one after another, looping.
function clip(steps: Step[]): string {
  const total = steps.reduce((sum, step) => sum + step.ms, 0)
  const keyTimes = [0]
  steps.forEach(step => keyTimes.push((keyTimes[keyTimes.length - 1] ?? 0) + step.ms / total))
  keyTimes.pop()

  return steps
    .map((step, i) => {
      const body = step.grid !== undefined ? rects(step.grid) : clip(step.cycle ?? [])
      const values = steps.map((_, j) => (i === j ? 1 : 0))

      return `<g opacity="0">${body}${discrete(values, keyTimes, total / 1000)}</g>`
    })
    .join('')
}

const STAND = front(0)
const WALKING: Step[] = [
  { grid: front(0, 'stepA'), ms: 200 },
  { grid: front(0, 'stepB'), ms: 200 },
]
const RESTING: Step[] = [
  { grid: STAND, ms: 1600 },
  { grid: front('closed'), ms: 120 },
  { grid: STAND, ms: 900 },
  { grid: front(-1), ms: 900 },
  { grid: STAND, ms: 400 },
  { grid: front(1), ms: 900 },
  { grid: STAND, ms: 700 },
  { grid: front('closed'), ms: 120 },
]
const TYPING: Step[] = [
  { grid: TYPE_A, ms: 110 },
  { grid: TYPE_B, ms: 110 },
]

type Segment = { x: number; isMoving: boolean }

// A looping walk over the strip: stretches of walking between random spots,
// with rests between them.
function idle(width: number): string {
  const room = Math.max(1, width - FRAME_W)
  const start = Math.random() * room
  const points: Segment[] = []
  const times: number[] = [0]
  let x = start
  let t = 0

  const go = (target: number) => {
    points.push({ x, isMoving: true })
    t += Math.max(0.3, Math.abs(target - x) / 36)
    times.push(t)
    x = target
    points.push({ x, isMoving: false })
    t += 2 + Math.random() * 4
    times.push(t)
  }
  for (let i = 0; i < 4; i++) {
    let target = Math.random() * room
    if (Math.abs(target - x) < FRAME_W / 2) target = x > room / 2 ? x - room / 2 : x + room / 2
    go(target)
  }
  go(start)
  points.push({ x, isMoving: false })

  const keyTimes = times.map(time => time / t)
  const moves = `<animateTransform attributeName="transform" type="translate" values="${points.map(p => `${fmt(p.x)} ${TOP}`).join(';')}" keyTimes="${keyTimes.map(fmt).join(';')}" dur="${fmt(t)}s" repeatCount="indefinite"/>`
  const layer = (body: string, show: (p: Segment) => boolean) =>
    `<g opacity="0">${body}${discrete(points.map(p => (show(p) ? 1 : 0)), keyTimes, t)}</g>`

  return (
    `<g transform="translate(${fmt(start)} ${TOP})">${moves}` +
    layer(clip(WALKING), p => p.isMoving) +
    layer(clip(RESTING), p => !p.isMoving) +
    `</g>`
  )
}

// The mascot's own routine: a blink, out comes the laptop, a hop, and a
// long bout of typing before it is put away again.
function working(width: number): string {
  const x = Math.max(0, Math.min(width - FRAME_W, width * 0.25))

  return (
    `<g transform="translate(${fmt(x)} ${TOP})">` +
    clip([
      { grid: STAND, ms: 500 },
      { grid: front('closed'), ms: 120 },
      { grid: STAND, ms: 300 },
      { grid: PULL, ms: 450 },
      { grid: SET, ms: 450 },
      { grid: HOP, ms: 300 },
      { cycle: TYPING, ms: 6000 },
      { grid: SET, ms: 400 },
      { grid: PULL, ms: 400 },
    ]) +
    `</g>`
  )
}

// Flies across the strip, over and over, flame flickering.
function rocket(width: number): string {
  return (
    `<g transform="translate(0 ${TOP})">` +
    `<animateTransform attributeName="transform" type="translate" values="${-FRAME_W} ${TOP};${width} ${TOP}" dur="${fmt(Math.max(2, (width + FRAME_W) / 90))}s" repeatCount="indefinite"/>` +
    `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0;0 1;0 0" dur="0.35s" repeatCount="indefinite"/>` +
    clip([
      { grid: ROCKET_A, ms: 80 },
      { grid: ROCKET_B, ms: 80 },
    ]) +
    `</g></g>`
  )
}

function engineer(width: number): string {
  const x = Math.max(0, Math.min(width - FRAME_W, width * 0.25))

  return (
    `<g transform="translate(${fmt(x)} ${TOP})">` +
    clip([
      { grid: ENGINEER_UP, ms: 320 },
      { grid: ENGINEER_DOWN, ms: 180 },
    ]) +
    `</g>`
  )
}

function happy(width: number): string {
  const x = Math.max(0, (width - FRAME_W) / 2)

  return (
    `<g transform="translate(${fmt(x)} ${TOP})"><g>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -8;0 0" keyTimes="0;0.4;1" dur="0.5s" repeatCount="indefinite"/>` +
    clip([
      { grid: HOP, ms: 250 },
      { grid: STAND, ms: 250 },
    ]) +
    `</g>` +
    `<text x="${4 * SCALE}" y="${5 * SCALE}" font-size="14" font-weight="bold" fill="${BODY}">✻</text>` +
    `<text x="${19 * SCALE}" y="${5 * SCALE}" font-size="14" font-weight="bold" fill="${BODY}">✻</text>` +
    `</g>`
  )
}

function sleeping(width: number): string {
  const x = Math.max(0, Math.min(width - FRAME_W, width * 0.3))
  const snore = [0, 1, 2]
    .map(
      i =>
        `<text x="${(18 + i * 2) * SCALE}" y="${7 * SCALE}" font-size="${9 + i * 3}" font-weight="bold" fill="${BODY}" opacity="0">z` +
        `<animate attributeName="y" values="${7 * SCALE};${-TOP + 10}" dur="3s" begin="${i}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;1;0" dur="3s" begin="${i}s" repeatCount="indefinite"/></text>`,
    )
    .join('')

  return (
    `<g transform="translate(${fmt(x)} ${TOP})">` +
    `<g>${rects(front('sleepy', 'sit'))}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="3s" repeatCount="indefinite"/></g>` +
    snore +
    `</g>`
  )
}

const SCENES: Record<Mood, (width: number) => string> = { idle, working, rocket, engineer, happy, sleeping }

export function svg(mood: Mood, width: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${STRIP_H}" viewBox="0 0 ${width} ${STRIP_H}" shape-rendering="crispEdges" style="display:block">` +
    `<g font-family="ui-monospace, Menlo, monospace">${SCENES[mood](width)}</g></svg>`
  )
}
