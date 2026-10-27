// The desktop pet: one SVG whose SMIL animations walk, blink and hop it, so
// the surface animates it with no redraws. A new mood draws a new SVG.

import type { Mood } from '../types'
import { BODY, HEIGHT, WIDTH, colorOf, legs, sprite, torso } from './sprites'
import type { Eyes } from './sprites'

const SCALE = 4
const PET_W = WIDTH * SCALE
const PET_H = HEIGHT * SCALE
export const STRIP_H = PET_H + 16
const TOP = STRIP_H - PET_H

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
  const lid = `<rect x="${2 * SCALE}" y="${SCALE}" width="${7 * SCALE}" height="${SCALE}" fill="${BODY}"/>`
  const dur = 3.5 + Math.random() * 2.5

  return `<g opacity="0">${lid}${discrete([0, 1, 0], [0, 0.95, 0.98], dur)}</g>`
}

function eyesOnly(eyes: Eyes): string {
  return rects(torso(eyes, 'out').map(row => row.replace(/O/g, '.')))
}

type Segment = { x: number; isMoving: boolean; dir: -1 | 0 | 1 }

// A looping walk over the strip: stretches of walking between random spots,
// with rests between them when `rest` is set.
function walk(width: number, speed: number, rest: boolean): string {
  const room = Math.max(1, width - PET_W)
  const start = Math.random() * room
  const points: Segment[] = []
  const times: number[] = [0]
  let x = start
  let t = 0

  const go = (target: number) => {
    const dir = target > x ? 1 : -1
    points.push({ x, isMoving: true, dir })
    t += Math.max(0.2, Math.abs(target - x) / speed)
    times.push(t)
    x = target
    if (rest) {
      points.push({ x, isMoving: false, dir: 0 })
      t += 1 + Math.random() * 3
      times.push(t)
    }
  }

  for (let i = 0; i < 5; i++) {
    let target = Math.random() * room
    if (Math.abs(target - x) < PET_W / 2) {
      target = x > room / 2 ? x - room / 2 : x + room / 2
    }
    go(target)
  }
  go(start)
  points.push({ x, isMoving: false, dir: 0 })

  const keyTimes = times.map(time => time / t)
  const moves = `<animateTransform attributeName="transform" type="translate" values="${points.map(p => `${fmt(p.x)} ${TOP}`).join(';')}" keyTimes="${keyTimes.map(fmt).join(';')}" dur="${fmt(t)}s" repeatCount="indefinite"/>`
  const layer = (body: string, show: (p: Segment) => boolean) =>
    `<g>${body}${discrete(points.map(p => (show(p) ? 1 : 0)), keyTimes, t)}</g>`
  const stride = speed > 50 ? 0.12 : 0.22

  const walking =
    `<g>${rects(legs('stepA'), 4)}${cycle(0, 2, stride)}</g>` +
    `<g>${rects(legs('stepB'), 4)}${cycle(1, 2, stride)}</g>`

  return (
    `<g transform="translate(${fmt(start)} ${TOP})">${moves}` +
    rects(torso('closed', 'out')) +
    layer(eyesOnly(-1), p => p.dir === -1) +
    layer(eyesOnly(0), p => p.dir === 0) +
    layer(eyesOnly(1), p => p.dir === 1) +
    blink() +
    layer(walking, p => p.isMoving) +
    layer(rects(legs('stand'), 4), p => !p.isMoving) +
    (speed > 50 ? sparks() : '') +
    `</g>`
  )
}

function sparks(): string {
  return SPARKS.map(
    (glyph, i) =>
      `<text x="${PET_W + 2}" y="2" font-size="15" font-weight="bold" fill="${BODY}" opacity="0">${glyph}${cycle(i, SPARKS.length, 0.15)}</text>`,
  ).join('')
}

function happy(width: number): string {
  const x = Math.max(0, (width - PET_W) / 2)

  return (
    `<g transform="translate(${fmt(x)} ${TOP})"><g>` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" dur="0.5s" repeatCount="indefinite"/>` +
    `<g>${rects(torso(0, 'up'))}${cycle(0, 2, 0.25)}</g>` +
    `<g>${rects(torso(0, 'out'))}${cycle(1, 2, 0.25)}</g>` +
    rects(legs('stand'), 4) +
    `</g>` +
    `<text x="-14" y="0" font-size="15" font-weight="bold" fill="${BODY}">✻</text>` +
    `<text x="${PET_W + 2}" y="0" font-size="15" font-weight="bold" fill="${BODY}">✻</text>` +
    `</g>`
  )
}

function sleeping(width: number): string {
  const x = Math.max(0, Math.min(width - PET_W, width * 0.3))
  const snore = [0, 1, 2]
    .map(
      i =>
        `<text x="${PET_W + i * 6}" y="${4 * SCALE}" font-size="${10 + i * 2}" fill="${BODY}" opacity="0">z` +
        `<animate attributeName="y" values="${4 * SCALE};${-2}" dur="3s" begin="${i}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;1;0" dur="3s" begin="${i}s" repeatCount="indefinite"/></text>`,
    )
    .join('')

  return (
    `<g transform="translate(${fmt(x)} ${TOP})">` +
    `<g>${rects(sprite({ eyes: 'sleepy', arms: 'out', legs: 'sit' }))}` +
    `<animateTransform attributeName="transform" type="translate" values="0 0;0 1;0 0" dur="3s" repeatCount="indefinite"/></g>` +
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
        : walk(width, mood === 'working' ? 80 : 28, mood !== 'working')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${STRIP_H}" viewBox="0 0 ${width} ${STRIP_H}" shape-rendering="crispEdges">` +
    `<g font-family="ui-monospace, Menlo, monospace">${scene}</g></svg>`
  )
}
