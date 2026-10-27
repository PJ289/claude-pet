// The desktop pet: one SVG whose SMIL animations walk, blink and hop it, so
// the surface animates it with no redraws. A new mood draws a new SVG.

import type { Mood } from '../types'
import { BODY, EYE_ROW, HEIGHT, WIDTH, colorOf, legs, sprite, torso } from './sprites'

// CSS pixels per art pixel: the size of the mascot on Claude's new-chat page.
const SCALE = 6
const PET_W = WIDTH * SCALE
const PET_H = HEIGHT * SCALE
// Headroom above the pet for a hop, a spark or a snore; it stands on the
// bottom edge, right on top of the prompt box.
export const STRIP_H = PET_H + 18
const TOP = STRIP_H - PET_H
const LEGS_ROW = HEIGHT - 2

const SPARKS = ['✢', '✳', '✶', '✻', '✽']

function rects(rows: string[], dy = 0): string {
  let out = ''
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const color = colorOf(row[x])
      let end = x + 1
      while (end < row.length && colorOf(row[end]) === color) {
        end += 1
      }
      if (color !== null) {
        out += `<rect x="${x * SCALE}" y="${(y + dy) * SCALE}" width="${(end - x) * SCALE}" height="${SCALE}" fill="${color}"/>`
      }
      x = end
    }
  })

  return out
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000)

function discrete(values: (string | number)[], keyTimes: number[], dur: number): string {
  return `<animate attributeName="opacity" values="${values.join(';')}" keyTimes="${keyTimes.map(fmt).join(';')}" dur="${fmt(dur)}s" calcMode="discrete" repeatCount="indefinite"/>`
}

// Toggles between `count` layers, each shown for `period` seconds in turn.
function cycle(index: number, count: number, period: number): string {
  const values = Array.from({ length: count }, (_, i) => (i === index ? 1 : 0))
  const keyTimes = values.map((_, i) => i / count)

  return discrete(values, keyTimes, period * count)
}

function blink(): string {
  // Body-coloured lids over the eye row, shut for a moment every few seconds.
  const lid = `<rect x="${2 * SCALE}" y="${EYE_ROW * SCALE}" width="${8 * SCALE}" height="${SCALE}" fill="${BODY}"/>`
  const dur = 3.5 + Math.random() * 2.5

  return `<g opacity="0">${lid}${discrete([0, 1, 0], [0, 0.95, 0.98], dur)}</g>`
}

// The eyes alone, glancing aside by half an art pixel: a whole one would set
// an eye on the body's edge.
function eyesOnly(glance: -1 | 0 | 1): string {
  const eyes = rects(torso(0, 'out').map(row => row.replace(/O/g, '.')))

  return `<g transform="translate(${(glance * SCALE) / 2} 0)">${eyes}</g>`
}

type Segment = { x: number; isMoving: boolean; eyes: -1 | 0 | 1 }

const glance = (): -1 | 0 | 1 => ([-1, 0, 0, 1] as const)[Math.floor(Math.random() * 4)] ?? 0

// A looping walk over the strip: stretches of walking between random spots
// and, when `rest` is set, rests between them where it looks around.
function walk(width: number, speed: number, rest: boolean): string {
  const room = Math.max(1, width - PET_W - 24)
  const start = Math.random() * room
  const points: Segment[] = []
  const times: number[] = [0]
  let x = start
  let t = 0

  const go = (target: number) => {
    points.push({ x, isMoving: true, eyes: target > x ? 1 : -1 })
    t += Math.max(0.2, Math.abs(target - x) / speed)
    times.push(t)
    x = target
    if (rest) {
      for (let i = 0; i < 2; i++) {
        points.push({ x, isMoving: false, eyes: glance() })
        t += 1 + Math.random() * 2.5
        times.push(t)
      }
    }
  }

  for (let i = 0; i < 4; i++) {
    let target = Math.random() * room
    if (Math.abs(target - x) < PET_W) {
      target = x > room / 2 ? x - room / 2 : x + room / 2
    }
    go(target)
  }
  go(start)
  points.push({ x, isMoving: false, eyes: 0 })

  const keyTimes = times.map(time => time / t)
  const moves = `<animateTransform attributeName="transform" type="translate" values="${points.map(p => `${fmt(p.x)} ${TOP}`).join(';')}" keyTimes="${keyTimes.map(fmt).join(';')}" dur="${fmt(t)}s" repeatCount="indefinite"/>`
  const layer = (body: string, show: (p: Segment) => boolean) =>
    `<g>${body}${discrete(points.map(p => (show(p) ? 1 : 0)), keyTimes, t)}</g>`
  const stride = speed > 60 ? 0.12 : 0.2

  const walking =
    `<g>${rects(legs('stepA'), LEGS_ROW)}${cycle(0, 2, stride)}</g>` +
    `<g>${rects(legs('stepB'), LEGS_ROW)}${cycle(1, 2, stride)}</g>`

  return (
    `<g transform="translate(${fmt(start)} ${TOP})">${moves}` +
    rects(torso('closed', 'out')) +
    layer(eyesOnly(-1), p => p.eyes === -1) +
    layer(eyesOnly(0), p => p.eyes === 0) +
    layer(eyesOnly(1), p => p.eyes === 1) +
    blink() +
    layer(walking, p => p.isMoving) +
    layer(rects(legs('stand'), LEGS_ROW), p => !p.isMoving) +
    (speed > 60 ? sparks() : '') +
    `</g>`
  )
}

function sparks(): string {
  return SPARKS.map(
    (glyph, i) =>
      `<text x="${PET_W + 2}" y="0" font-size="16" font-weight="bold" fill="${BODY}" opacity="0">${glyph}${cycle(i, SPARKS.length, 0.15)}</text>`,
  ).join('')
}

function happy(width: number): string {
  const x = Math.max(0, (width - PET_W) / 2)

  return (
    `<g transform="translate(${fmt(x)} ${TOP})"><g>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -10;0 0" keyTimes="0;0.4;1" dur="0.55s" repeatCount="indefinite"/>` +
    `<g>${rects(torso(0, 'up'))}${cycle(0, 2, 0.275)}</g>` +
    `<g>${rects(torso(0, 'out'))}${cycle(1, 2, 0.275)}</g>` +
    rects(legs('stand'), LEGS_ROW) +
    `</g>` +
    `<text x="-18" y="2" font-size="16" font-weight="bold" fill="${BODY}">✻</text>` +
    `<text x="${PET_W + 4}" y="2" font-size="16" font-weight="bold" fill="${BODY}">✻</text>` +
    `</g>`
  )
}

function sleeping(width: number): string {
  const x = Math.max(0, Math.min(width - PET_W - 30, width * 0.3))
  const snore = [0, 1, 2]
    .map(
      i =>
        `<text x="${PET_W + i * 8}" y="${3 * SCALE}" font-size="${11 + i * 3}" font-weight="bold" fill="${BODY}" opacity="0">z` +
        `<animate attributeName="y" values="${3 * SCALE};${-TOP + 14}" dur="3s" begin="${i}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;1;0" dur="3s" begin="${i}s" repeatCount="indefinite"/></text>`,
    )
    .join('')

  return (
    `<g transform="translate(${fmt(x)} ${TOP})">` +
    `<g>${rects(sprite({ eyes: 'sleepy', arms: 'out', legs: 'sit' }))}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 0" dur="3s" repeatCount="indefinite"/></g>` +
    snore +
    `</g>`
  )
}

export function svg(mood: Mood, width: number): string {
  const scene =
    mood === 'happy'
      ? happy(width)
      : mood === 'sleeping'
        ? sleeping(width)
        : walk(width, mood === 'working' ? 90 : 36, mood !== 'working')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${STRIP_H}" viewBox="0 0 ${width} ${STRIP_H}" shape-rendering="crispEdges" style="display:block">` +
    `<g font-family="ui-monospace, Menlo, monospace">${scene}</g></svg>`
  )
}
