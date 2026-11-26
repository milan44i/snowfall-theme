// scene.js: the Snowfall backdrop as one SVG string. Pure string building:
// no DOM, nothing read from outside; the same percent always gives the same picture.
//
// Portions adapted from hooks/scenes/snow-pines.ts in
// https://github.com/anthropics/claude-plugins-official (plugins/theme-examples),
// licensed under the Apache License 2.0 (see licenses/Apache-2.0.txt and
// THIRD_PARTY_NOTICES.md). hash() below is copied from that file. The forest in
// three depths, the light from one side, the snow on exposed boughs and the
// shadow under each tier's overhang follow its approach, redrawn here as vector
// shapes instead of character cells. Changes were made.

const W = 1600
const MOON_X = 1380
const MOON_Y = 150

/** A deterministic hash to 0..1 (from snow-pines.ts), so every build is the same. */
function hash(a, b, c) {
  let value = (a * 374761393 + b * 668265263 + c * 2147483647) | 0
  value = (value ^ (value >>> 13)) * 1274126177
  value = value ^ (value >>> 16)
  return ((value >>> 0) % 100000) / 100000
}

/** The original smooth noise, kept so stars and flakes land where they always did. */
function noise(i, salt) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const n = v => String(Math.round(v * 10) / 10)
const pt = (x, y) => `${n(x)} ${n(y)}`
// Trees use whole pixels: the desktop app takes at most 131072 characters of SVG, and the forest is most of it.
const pti = (x, y) => `${Math.round(x)} ${Math.round(y)}`
/** The most SVG a backdrop may be (SvgProps.source), less a margin. */
const MAX_SVG = 126000
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** 0 under the reading column in the middle of the window, 1 at the left and right edges. */
function edgeness(x) {
  const d = Math.abs(x - W / 2) / (W / 2)
  return Math.min(1, Math.max(0, (d - 0.35) / 0.55))
}

// ---------------------------------------------------------------- ground

const farHill = x => 640 + Math.sin(x * 0.0042 + 0.6) * 20 - edgeness(x) * 44
const midHill = x => 706 + Math.sin(x * 0.0051 + 2.1) * 14 - edgeness(x) * 28
const field = x => 772 + Math.sin(x * 0.0038 + 1.2) * 12 - edgeness(x) * 18
const driftAt = lift => x => 832 + Math.sin(x * 0.0033 + 4.4) * 14 - edgeness(x) * 16 - lift

function hill(crest, fill) {
  let d = `M-20 ${n(crest(-20))}`
  for (let x = 0; x <= W + 20; x += 20) d += `L${x} ${n(crest(x))}`
  return `<path d="${d}V960H-20Z" fill="${fill}"/>`
}

const PEAKS = [[-40, 600], [120, 488], [250, 548], [390, 462], [540, 575], [760, 612], [980, 596], [1130, 515], [1250, 566], [1420, 476], [1560, 540], [1660, 590]]

/** A distant range behind the hills, its peaks capped with snow. */
function mountains() {
  let d = `M${PEAKS[0][0]} ${PEAKS[0][1]}`
  for (const [x, y] of PEAKS.slice(1)) d += `L${x} ${y}`
  d += 'V960H-40Z'
  let caps = ''
  for (let i = 1; i < PEAKS.length - 1; i++) {
    const [x, y] = PEAKS[i]
    const [lx, ly] = PEAKS[i - 1]
    const [rx, ry] = PEAKS[i + 1]
    if (y > ly || y > ry) continue
    const k = 0.24 + hash(i, 1, 91) * 0.1
    const L = { x: x + (lx - x) * k, y: y + (ly - y) * k }
    const R = { x: x + (rx - x) * k, y: y + (ry - y) * k }
    const depth = Math.min(L.y, R.y) - y
    caps += `M${pt(x, y)}L${pt(R.x, R.y)}L${pt(x + (R.x - x) * 0.5, y + depth * 0.72)}L${pt(x + (R.x - x) * 0.12, y + depth * 1.02)}` +
      `L${pt(x - (x - L.x) * 0.32, y + depth * 0.7)}L${pt(L.x, L.y)}Z`
  }
  return `<path d="${d}" fill="url(#range)"/><path d="${caps}" fill="#6b80b6" fill-opacity="0.5"/>`
}

// ---------------------------------------------------------------- pines

// `under` is the darker value of each half where it sits in the shadow of the tier above (mid and near trees only).
const TONES = {
  far: { id: 'far', trunk: '#16203c', shadow: '#1b315a', lit: '#264473', snowShade: '#7f92bd', snow: '#b3c3e4' },
  mid: { id: 'mid', trunk: '#2b1f19', shadow: '#11303a', lit: '#1e4f53', snowShade: '#9aadd2', snow: '#e4edfc', under: { shadow: '#0a2129', lit: '#143a40' } },
  near: { id: 'near', trunk: '#1f150e', shadow: '#09201f', lit: '#143c3a', snowShade: '#a3b5d9', snow: '#f0f5ff', under: { shadow: '#041312', lit: '#0b2827' } },
}

/** A gradient per tone and half: dark at the top of a tier, where the tier above overhangs it, easing to the half's own value. */
function pineGradients() {
  let out = ''
  for (const tone of [TONES.mid, TONES.near]) {
    for (const half of ['shadow', 'lit']) {
      out += `<linearGradient id="pine-${tone.id}-${half}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="${tone.under[half]}"/><stop offset="0.4" stop-color="${tone.under[half]}"/>` +
        `<stop offset="0.68" stop-color="${tone[half]}"/></linearGradient>`
    }
  }
  return out
}

/** One side of a tier: bough tips out on the cone, notches tucked in between, the last tip drooping. */
function boughs(ax, ay, w, tierH, side, k, droop, seed, tier) {
  const pts = []
  for (let j = 1; j <= k; j++) {
    const t = j / k
    const jitter = j === k ? 1 : 0.9 + hash(seed, tier * 10 + j, side > 0 ? 7 : 8) * 0.2
    const tip = { x: ax + side * w * t * jitter, y: ay + tierH * t + droop * t * t }
    pts.push(tip)
    if (j < k) pts.push({ x: ax + side * w * t * 0.6, y: tip.y + tierH * 0.05 })
  }
  return pts
}

/**
 * A clump of snow resting on one bough, from partway along S..P out to the tip P: a soft mound just above the bough's
 * top edge, a rounded lip over the tip, and a scalloped underside that hangs down onto the needles.
 */
function snowOn(S, P, th, side, from) {
  const a = lerp(S, P, from)
  const at = t => lerp(a, P, t)
  const m = at(0.5)
  const c1 = at(0.68)
  const c2 = at(0.34)
  return `M${pti(a.x, a.y)}Q${pti(m.x, m.y - th * 0.75)} ${pti(P.x + side * th * 0.25, P.y - th * 0.1)}` +
    `Q${pti(P.x + side * th * 0.45, P.y + th * 0.9)} ${pti(c1.x, c1.y + th * 1.15)}` +
    `Q${pti(at(0.52).x, at(0.52).y + th * 0.45)} ${pti(c2.x, c2.y + th * 0.95)}` +
    `Q${pti(at(0.14).x, at(0.14).y + th * 0.35)} ${pti(a.x, a.y)}Z`
}

/**
 * One pine, built of tiers drawn from the bottom up. Each tier is split into the half that faces the moon
 * and the half in shadow, darkened at its top where the tier above overhangs it; snow rests on each bough's top.
 */
function pine(x, base, h, seed, tone, snow) {
  const parts = []
  const toLight = x < MOON_X ? 1 : -1
  const tiers = h > 320 ? 6 : h > 160 ? 5 : h > 70 ? 4 : 3
  const k = h > 120 ? 3 : 2
  const trunkH = h * 0.11
  const top = base - h
  const crownBottom = base - trunkH * 0.6
  const crownH = crownBottom - top
  const spread = h * (0.29 + hash(seed, 1, 3) * 0.07)
  const tw = Math.max(1.5, h * 0.045)
  parts.push(['trunk', `M${pti(x - tw * 0.45, crownBottom - trunkH)}L${pti(x + tw * 0.45, crownBottom - trunkH)}L${pti(x + tw * 0.7, base + 2)}L${pti(x - tw * 0.7, base + 2)}Z`])

  const shapes = []
  for (let i = 0; i < tiers; i++) {
    const bottom = top + crownH * Math.pow((i + 1) / tiers, 0.9)
    const above = i === 0 ? top : top + crownH * Math.pow(i / tiers, 0.9)
    const tTop = i === 0 ? top : above - (bottom - above) * 0.6
    const tierH = bottom - tTop
    const w = spread * ((bottom - top) / crownH) * (0.88 + hash(seed, i, 5) * 0.24)
    const ax = x + (hash(seed, i, 6) - 0.5) * h * 0.012
    const droop = tierH * (0.1 + hash(seed, i, 4) * 0.08)
    shapes.push({ ax, ay: tTop, w, tierH, bottom, droop })
  }

  const th = Math.max(0.9, h * 0.02 * (0.45 + snow))
  for (let i = tiers - 1; i >= 0; i--) {
    const { ax, ay, w, tierH, bottom, droop } = shapes[i]
    const apex = { x: ax, y: ay }
    const split = { x: ax + toLight * w * 0.16, y: bottom }
    for (const side of [-1, 1]) {
      const pts = boughs(ax, ay, w, tierH, side, k, droop, seed, i)
      const tip = pts[pts.length - 1]
      const midX = ax + side * w * 0.55
      let d = `M${pti(apex.x, apex.y)}` + pts.map(q => `L${pti(q.x, q.y)}`).join('')
      d += `Q${pti(tip.x - side * w * 0.12, bottom + tierH * 0.08)} ${pti(midX, bottom + droop * 0.25)}`
      d += `Q${pti((midX + split.x) / 2, bottom + tierH * 0.07)} ${pti(split.x, split.y)}Z`
      const half = side === toLight ? 'lit' : 'shadow'
      const shaded = tone.under && i > 0
      parts.push([half, d, shaded ? `url(#pine-${tone.id}-${half})` : undefined])

      let start = apex
      let snowD = ''
      pts.forEach((q, idx) => {
        if (idx % 2 === 1) {
          start = q
          return
        }
        const crown = i === 0 && idx === 0
        const bare = !crown && hash(seed, i * 20 + idx, side > 0 ? 12 : 13) < 0.14
        if (!bare) snowD += snowOn(start, q, th, side, crown ? 0.05 : 0.22 + hash(seed, i * 20 + idx, 14) * 0.2)
      })
      if (snowD) parts.push([half === 'lit' ? 'snow' : 'snowShade', snowD])
    }
  }

  return parts.map(([kind, d, fill]) => `<path d="${d}" fill="${fill || tone[kind]}"/>`).join('')
}

/**
 * A far pine in a few whole-pixel points, merged into the sink by tone: the half in shadow, the half facing
 * the moon, a snow cap on the crown and a dab of snow on each lit bough tip. Small enough for dozens of them.
 */
function farPine(sink, x, base, h, seed, snow) {
  const toLight = x < MOON_X ? 1 : -1
  const top = base - h
  const crownH = h * 0.93
  const spread = h * (0.3 + hash(seed, 1, 3) * 0.07)
  const tiers = [1, 2, 3].map(i => {
    const bottom = top + crownH * Math.pow(i / 3, 0.9)
    return { bottom, w: spread * ((bottom - top) / crownH) }
  })
  for (const side of [-1, 1]) {
    let d = `M${pti(x, top)}`
    tiers.forEach(({ bottom, w }, i) => {
      d += `L${pti(x + side * w, bottom + h * 0.035)}`
      if (i < 2) d += `L${pti(x + side * w * 0.45, bottom - h * 0.01)}`
    })
    d += `L${pti(x + toLight * tiers[2].w * 0.15, tiers[2].bottom)}Z`
    sink[side === toLight ? 'lit' : 'shadow'] += d
  }
  const capY = top + (tiers[0].bottom - top) * (0.3 + snow * 0.3)
  const capW = tiers[0].w * (capY - top) / (tiers[0].bottom - top)
  sink.snow += `M${pti(x, top)}L${pti(x + capW, capY)}L${pti(x - capW, capY + 1)}Z`
  for (const { bottom, w } of tiers.slice(1)) {
    const tx = x + toLight * w
    const ty = bottom + h * 0.035
    sink.snow += `M${pti(tx, ty)}L${pti(tx - toLight * w * 0.4, ty - h * (0.05 + snow * 0.04))}L${pti(tx - toLight * w * 0.32, ty - h * 0.01)}Z`
  }
}

/** The far tree line: two woods along the back hill, none under the reading column. */
function farForest(snow) {
  const sink = { shadow: '', lit: '', snow: '' }
  const woods = [[-30, 560, 0.62], [1060, 1630, 0.55]]
  for (const [from, to, chance] of woods) {
    for (let x = from; x <= to; x += 15) {
      const col = Math.round(x / 15) + 200
      if (hash(col, 3, 11) > chance) continue
      const middle = (from + to) / 2
      const taper = 1 - (Math.abs(x - middle) / ((to - from) / 2)) * 0.5
      const h = (26 + hash(col, 5, 11) * 60) * taper * (0.6 + edgeness(x) * 0.6)
      const jx = x + (hash(col, 6, 11) - 0.5) * 8
      farPine(sink, jx, farHill(jx) + 6 + hash(col, 7, 11) * 8, h, col, snow)
    }
  }
  const far = TONES.far
  return `<path d="${sink.shadow}" fill="${far.shadow}"/><path d="${sink.lit}" fill="${far.lit}"/><path d="${sink.snow}" fill="${far.snow}"/>`
}

const MID_PINES = [[40, 250], [130, 300], [205, 215], [292, 160], [362, 112], [1185, 205], [1505, 262], [1585, 200]]
const NEAR_PINES = [[-24, 560], [86, 400], [1630, 470]]

/** Middle trees on the snow field, each with its shadow thrown away from the moon. */
function midForest(snow) {
  const stands = MID_PINES.map(([x, h], i) => ({ x, h, base: field(x) + 6 + hash(i, 2, 23) * 10, seed: 300 + i }))
  stands.sort((a, b) => a.base - b.base)
  let shadows = ''
  for (const { x, h, base } of stands) {
    const away = x < MOON_X ? -1 : 1
    shadows += `<ellipse cx="${n(x + away * h * 0.16)}" cy="${n(base + 1)}" rx="${n(h * 0.26)}" ry="${n(h * 0.028)}"/>`
  }
  return `<g fill="#5d70a3" fill-opacity="0.38">${shadows}</g>` +
    stands.map(({ x, h, base, seed }) => pine(x, base, h, seed, TONES.mid, snow)).join('')
}

function nearForest(snow) {
  return NEAR_PINES.map(([x, h], i) => pine(x, 948 + hash(i, 9, 31) * 14, h, 500 + i, TONES.near, snow)).join('')
}

// ---------------------------------------------------------------- cabin

/**
 * A log cabin seen from the front left: a gable end with a window and a door, a long side wall
 * with two windows, a snow-laden roof with icicles, a stone chimney with smoke, a lantern,
 * a woodpile and a bit of fence. (ox, oy) is the front-left corner at the ground.
 */
function cabin(ox, oy, snow) {
  const P = (x, y) => pt(ox + x, oy + y)
  const S = (t, y) => P(130 + 110 * t, y - 16 * t)
  const th = 6 + snow * 10
  const SNOW = '#eef4ff'
  const SNOW_DIM = '#c3d0e8'
  const WOOD_DARK = '#1f150e'
  let s = ''

  // warm haze, its shadow on the snow, and light from the windows spilling onto the snow
  s += `<ellipse class="sp" cx="${n(ox + 120)}" cy="${n(oy - 50)}" rx="230" ry="130" fill="url(#haze)"/>`
  s += `<path d="M${P(-2, 2)}L${P(120, 2)}Q${P(40, 18)} ${P(-170, 20)}Q${P(-60, 8)} ${P(-2, 2)}Z" fill="#5d70a3" fill-opacity="0.24"/>`
  s += `<ellipse class="sp" cx="${n(ox + 36)}" cy="${n(oy + 12)}" rx="62" ry="11" fill="url(#spill)"/>`
  s += `<ellipse class="sp" cx="${n(ox + 196)}" cy="${n(oy + 4)}" rx="96" ry="14" fill="url(#spill)"/>`

  // side wall, lit by the moon, with its logs
  s += `<path d="M${P(130, 0)}L${S(1, 0)}L${S(1, -72)}L${P(130, -72)}Z" fill="#4c3829"/>`
  let logs = ''
  let shine = ''
  for (let k = 1; k <= 7; k++) {
    logs += `M${P(130, -9 * k)}L${S(1, -9 * k)}`
    shine += `M${P(130, -9 * k + 1.6)}L${S(1, -9 * k + 1.6)}`
  }
  // front wall and gable
  s += `<path d="M${P(0, -72)}L${P(130, -72)}L${P(130, 0)}L${P(0, 0)}Z" fill="#35251b"/>`
  for (let k = 1; k <= 7; k++) {
    logs += `M${P(0, -9 * k)}L${P(130, -9 * k)}`
    shine += `M${P(0, -9 * k + 1.6)}L${P(130, -9 * k + 1.6)}`
  }
  s += `<path d="${logs}" stroke="#22160e" stroke-width="1.5" fill="none"/>`
  s += `<path d="${shine}" stroke="#5a4231" stroke-width="0.8" stroke-opacity="0.6" fill="none"/>`
  s += `<path d="M${P(0, -72)}L${P(65, -134)}L${P(130, -72)}Z" fill="#2f2017"/>`
  let planks = ''
  for (let x = 9; x < 130; x += 9) {
    const yTop = -72 - 62 * (1 - Math.abs(x - 65) / 65)
    planks += `M${P(x, yTop)}L${P(x, -72)}`
  }
  s += `<path d="${planks}" stroke="#20150e" stroke-width="1" fill="none"/>`
  s += `<circle cx="${n(ox + 65)}" cy="${n(oy - 100)}" r="9" fill="${WOOD_DARK}"/><circle class="w w3" cx="${n(ox + 65)}" cy="${n(oy - 100)}" r="6.5"/>`
  s += `<path d="M${P(65, -106.5)}L${P(65, -93.5)}M${P(58.5, -100)}L${P(71.5, -100)}" stroke="${WOOD_DARK}" stroke-width="1.6"/>`

  // the ends of the logs, sticking out past both corners
  let ends = ''
  let rings = ''
  for (let k = 0; k < 8; k++) {
    const y = -4.5 - 9 * k
    for (const x of [-2, 132]) {
      ends += `<circle cx="${n(ox + x)}" cy="${n(oy + y)}" r="4.4"/>`
      rings += `<circle cx="${n(ox + x)}" cy="${n(oy + y)}" r="2"/>`
    }
  }
  s += `<g fill="#6e5038" stroke="#2a1c13" stroke-width="0.8">${ends}</g><g fill="none" stroke="#4f3826" stroke-width="0.6">${rings}</g>`

  // front window with mullions and a little snow on the sill
  s += `<path d="M${P(14, -58)}H${n(ox + 58)}V${n(oy - 22)}H${n(ox + 14)}Z" fill="${WOOD_DARK}"/>`
  s += `<path class="w" d="M${P(17, -55)}H${n(ox + 55)}V${n(oy - 25)}H${n(ox + 17)}Z"/>`
  s += `<path d="M${P(36, -55)}V${n(oy - 25)}M${P(17, -40)}H${n(ox + 55)}" stroke="${WOOD_DARK}" stroke-width="2.4"/>`
  s += `<path d="M${P(12, -21)}Q${P(36, -27 - snow * 3)} ${P(60, -21)}L${P(60, -19)}L${P(12, -19)}Z" fill="${SNOW}"/>`

  // door with a small lit pane, and a lantern beside it
  s += `<path d="M${P(82, -54)}H${n(ox + 110)}V${n(oy)}H${n(ox + 82)}Z" fill="#291b12" stroke="${WOOD_DARK}" stroke-width="1.5"/>`
  s += `<path d="M${P(89, -52)}V${n(oy)}M${P(96, -52)}V${n(oy)}M${P(103, -52)}V${n(oy)}" stroke="#1a110b" stroke-width="0.9"/>`
  s += `<path class="w w2" d="M${P(88, -48)}H${n(ox + 104)}V${n(oy - 37)}H${n(ox + 88)}Z"/>`
  s += `<circle cx="${n(ox + 105)}" cy="${n(oy - 26)}" r="1.6" fill="#c9a36a"/>`
  s += `<circle class="sp" cx="${n(ox + 121.5)}" cy="${n(oy - 44)}" r="24" fill="url(#lamp)"/>`
  s += `<path d="M${P(114, -51)}H${n(ox + 122)}" stroke="${WOOD_DARK}" stroke-width="1.5"/>`
  s += `<path d="M${P(117.5, -51)}L${P(121.5, -55)}L${P(125.5, -51)}Z" fill="${WOOD_DARK}"/>`
  s += `<path class="w w3" d="M${P(118, -51)}H${n(ox + 125)}V${n(oy - 41)}H${n(ox + 118)}Z"/>`

  // side windows in perspective
  for (const [t1, t2, cls] of [[0.14, 0.4, 'w'], [0.6, 0.86, 'w w2']]) {
    const tm = (t1 + t2) / 2
    s += `<path d="M${S(t1 - 0.025, -60)}L${S(t2 + 0.025, -60)}L${S(t2 + 0.025, -24)}L${S(t1 - 0.025, -24)}Z" fill="${WOOD_DARK}"/>`
    s += `<path class="${cls}" d="M${S(t1, -57)}L${S(t2, -57)}L${S(t2, -27)}L${S(t1, -27)}Z"/>`
    s += `<path d="M${S(tm, -57)}L${S(tm, -27)}M${S(t1, -42)}L${S(t2, -42)}" stroke="${WOOD_DARK}" stroke-width="2.2"/>`
    s += `<path d="M${S(t1 - 0.035, -23)}Q${S(tm, -29 - snow * 3)} ${S(t2 + 0.035, -23)}L${S(t2 + 0.035, -21)}L${S(t1 - 0.035, -21)}Z" fill="${SNOW}"/>`
  }

  // the roof: the side plane under a thick, moonlit layer of snow with a lip over the eave
  s += `<path d="M${P(65, -134)}L${P(175, -150)}L${P(252, -82)}L${P(142, -66)}Z" fill="#241a24"/>`
  s += `<path d="M${P(64, -134 - th)}L${P(176, -150 - th)}L${P(254, -82 - th * 0.3)}Q${P(261, -78)} ${P(252, -74)}` +
    `L${P(144, -58)}Q${P(137, -59)} ${P(141, -64 - th * 0.3)}Z" fill="url(#roofsnow)"/>`
  // wind-carved ridges in the roof snow, and the chimney's shadow lying down the slope away from the moon
  const R = (u, v) => P(65 + 110 * u + 77 * v, -134 - th - 16 * u + 70 * v)
  s += `<path d="M${R(0.1, 0.35)}Q${R(0.35, 0.3)} ${R(0.55, 0.42)}M${R(0.3, 0.68)}Q${R(0.55, 0.6)} ${R(0.85, 0.72)}M${R(0.62, 0.18)}Q${R(0.78, 0.14)} ${R(0.95, 0.24)}" stroke="#bccbe6" stroke-width="1.6" stroke-linecap="round" fill="none" stroke-opacity="0.7"/>`
  s += `<path d="M${R(0.88, 0.2)}L${R(0.7, 0.24)}Q${R(0.62, 0.42)} ${R(0.58, 0.56)}L${R(0.72, 0.53)}Q${R(0.8, 0.38)} ${R(0.88, 0.2)}Z" fill="#9fb2d6" fill-opacity="0.38"/>`
  // barge boards, and the edge of the snow slab seen along both slopes of the gable
  s += `<path d="M${P(65, -130)}L${P(143, -58)}L${P(143, -53)}L${P(65, -124)}L${P(-13, -53)}L${P(-13, -58)}Z" fill="${WOOD_DARK}"/>`
  s += `<path d="M${P(64, -134 - th)}L${P(141, -64 - th * 0.3)}Q${P(147, -60)} ${P(143, -57)}L${P(65, -129)}Z" fill="${SNOW_DIM}"/>`
  s += `<path d="M${P(66, -134 - th)}L${P(-14, -62 - th * 0.3)}Q${P(-21, -58)} ${P(-14, -56)}L${P(65, -129)}Z" fill="#d3deef"/>`
  // icicles under the side eave
  let ice = ''
  for (let i = 0; i < 11; i++) {
    const t = 0.04 + i * 0.09 + (hash(i, 2, 77) - 0.5) * 0.04
    const x = 145 + 104 * t
    const y = -58 - 16 * t
    const len = (3 + hash(i, 1, 77) * 11) * (0.5 + snow)
    ice += `M${P(x - 1.8, y)}L${P(x + 1.8, y)}L${P(x, y + len)}Z`
  }
  s += `<path d="${ice}" fill="#d4e4fa" fill-opacity="0.9"/>`

  // stone chimney standing in the roof snow, capped with snow, with smoke
  const foot = -129 - th
  s += `<path d="M${P(160, -176)}H${n(ox + 176)}V${n(oy + foot + 4)}H${n(ox + 160)}Z" fill="#4d3f3b"/>`
  s += `<path d="M${P(176, -176)}L${P(182, -178)}L${P(182, foot + 2)}L${P(176, foot + 4)}Z" fill="#6e5d55"/>`
  let stones = ''
  for (let y = -169, r = 0; y > foot; y += 7, r++) {
    stones += `M${P(160, y)}H${n(ox + 176)}`
    const off = r % 2 === 0 ? 165 : 170
    stones += `M${P(off, y)}V${n(oy + y - 7)}`
  }
  s += `<path d="${stones}" stroke="#3a2f2c" stroke-width="0.9" fill="none"/>`
  s += `<ellipse cx="${n(ox + 171)}" cy="${n(oy + foot + 3)}" rx="15" ry="4.5" fill="${SNOW}"/>`
  s += `<path d="M${P(157, -181)}H${n(ox + 184)}V${n(oy - 176)}H${n(ox + 157)}Z" fill="#3a302d"/>`
  s += `<path d="M${P(156, -181)}Q${P(170, -191 - snow * 4)} ${P(185, -182)}Q${P(187, -179)} ${P(183, -179.5)}L${P(158, -179.5)}Q${P(154, -179)} ${P(156, -181)}Z" fill="${SNOW}"/>`
  for (let i = 0; i < 4; i++) {
    s += `<circle class="smk" cx="${n(ox + 170)}" cy="${n(oy - 188)}" r="6" fill="#c3cde3" style="animation-delay:-${(i * 2.25).toFixed(2)}s"/>`
  }

  // a woodpile against the front left corner
  const logsAt = [[-40, -5], [-30, -5], [-20, -5], [-10, -5], [-35, -14], [-25, -14], [-15, -14], [-30, -23], [-20, -23]]
  s += `<g fill="#6b4b33" stroke="#2e2016" stroke-width="1">${logsAt.map(([x, y]) => `<circle cx="${n(ox + x)}" cy="${n(oy + y)}" r="5"/>`).join('')}</g>`
  s += `<g fill="none" stroke="#8a6a4c" stroke-width="0.7">${logsAt.map(([x, y]) => `<circle cx="${n(ox + x)}" cy="${n(oy + y)}" r="2.2"/>`).join('')}</g>`
  s += `<path d="M${P(-38, -26)}Q${P(-25, -36 - snow * 4)} ${P(-12, -26)}Q${P(-25, -24)} ${P(-38, -26)}Z" fill="${SNOW}"/>`

  // a short run of fence, half buried
  let posts = ''
  let caps = ''
  for (const x of [-112, -86, -60]) {
    posts += `M${P(x - 2.5, -30)}H${n(ox + x + 2.5)}V${n(oy + 2)}H${n(ox + x - 2.5)}Z`
    caps += `<ellipse cx="${n(ox + x)}" cy="${n(oy - 31)}" rx="4.5" ry="2.4"/>`
  }
  s += `<path d="M${P(-112, -21)}H${n(ox - 60)}M${P(-112, -10)}H${n(ox - 60)}" stroke="#2a1d15" stroke-width="3"/>`
  s += `<path d="${posts}" fill="#2a1d15"/>`
  s += `<path d="M${P(-112, -23)}H${n(ox - 60)}" stroke="#dfe8f7" stroke-width="1.4"/>`
  s += `<g fill="${SNOW}">${caps}</g>`

  // snow banked against the walls
  s += `<path d="M${P(-30, 8)}Q${P(-12, 0)} ${P(4, -5)}Q${P(36, -8)} ${P(72, -3)}Q${P(110, -10)} ${P(134, -5)}` +
    `Q${S(0.5, -9)} ${S(1, -5)}Q${S(1.12, -1)} ${S(1.16, 6)}Q${S(0.6, 10)} ${P(134, 12)}Q${P(60, 16)} ${P(-30, 8)}Z" fill="#dfe8f6"/>`
  return s
}

// ---------------------------------------------------------------- sky and snowfall

/**
 * Falling snow in four layers, far to near: small, faint and slow to large, bright and quick. Like snow-pines,
 * each layer moves as ONE element, so the markup stays small and the browser animates four things, not hundreds.
 * A flake is a zero-length stroke with a round cap (`M x y h0`), drawn twice a screen apart so the fall loops
 * without a seam.
 */
const FLAKE_LAYERS = [
  { size: 2.4, opacity: 0.45, seconds: 30, sway: 9, share: 0.36 },
  { size: 3.6, opacity: 0.6, seconds: 21, sway: 7.5, share: 0.3 },
  { size: 5, opacity: 0.8, seconds: 14, sway: 6, share: 0.21 },
  { size: 7, opacity: 0.92, seconds: 10, sway: 5, share: 0.13 },
]

function flakes(count) {
  return FLAKE_LAYERS.map((layer, which) => {
    const k = Math.round(count * layer.share)
    let d = ''
    for (let i = 0; i < k; i++) {
      const x = Math.round(noise(i, 11 + which * 7) * 1600)
      const y = Math.round(noise(i, 12 + which * 7) * 960)
      d += `M${x} ${y}h0m0 -960h0`
    }
    const delay = (layer.seconds * (0.17 + which * 0.23)).toFixed(1)
    return `<g class="sw" style="animation-duration:${layer.sway}s;animation-delay:-${which * 2}s">` +
      `<path class="fl" d="${d}" stroke="#fff" stroke-width="${layer.size}" stroke-linecap="round" stroke-opacity="${layer.opacity}" ` +
      `style="animation-duration:${layer.seconds}s;animation-delay:-${delay}s"/></g>`
  }).join('')
}

function stars(count) {
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = Math.round(noise(i, 7) * 1600)
    const y = Math.round(noise(i, 8) * 420)
    const r = (0.6 + noise(i, 9) * 1.4).toFixed(1)
    const delay = (-noise(i, 10) * 6).toFixed(1)
    out += `<circle class="s" cx="${x}" cy="${y}" r="${r}" style="animation-delay:${delay}s"/>`
  }
  return out
}

/** Glints on the front drift, near the edges of the window. */
function sparkles(drift) {
  let out = ''
  for (let i = 0; i < 46; i++) {
    const side = i % 2 === 0 ? 0 : 1
    const x = side === 0 ? hash(i, 1, 61) * 520 : 1080 + hash(i, 1, 61) * 520
    const y = drift(x) + 6 + hash(i, 2, 61) * 70
    const r = (0.7 + hash(i, 3, 61) * 1.1).toFixed(1)
    out += `<circle class="s" cx="${n(x)}" cy="${n(y)}" r="${r}" style="animation-delay:-${(hash(i, 4, 61) * 6).toFixed(1)}s"/>`
  }
  return out
}

/** A few meteors that cross the sky now and then, each on its own long cycle. */
function shootingStars() {
  return [[260, 70, 17, -4], [640, 40, 23, -13], [980, 110, 31, -24]].map(([x, y, cycle, delay]) =>
    `<g transform="translate(${x} ${y})"><g class="ss" style="animation-duration:${cycle}s;animation-delay:${delay}s">` +
    `<line x1="0" y1="0" x2="-110" y2="-36" stroke="url(#tail)" stroke-width="2" stroke-linecap="round"/>` +
    `<circle r="1.8" fill="#ffffff"/></g></g>`).join('')
}

/** A snowman beside the cabin, lit by the moon from the right, its shadow falling to the left. */
function snowman(x, base) {
  const SNOW = '#eef4ff'
  const SHADE = '#b9c7e2'
  let s = `<ellipse cx="${n(x - 22)}" cy="${n(base)}" rx="30" ry="5" fill="#7f93c0" opacity="0.45"/>`
  for (const [r, cy] of [[17, base - 15], [12.5, base - 41], [9, base - 60]]) {
    s += `<circle cx="${n(x)}" cy="${n(cy)}" r="${r}" fill="${SNOW}"/>`
    s += `<path d="M${pt(x, cy - r)}A${r} ${r} 0 0 0 ${pt(x, cy + r)}A${r * 0.8} ${r} 0 0 1 ${pt(x, cy - r)}Z" fill="${SHADE}" opacity="0.6"/>`
  }
  const hy = base - 60
  s += `<path d="M${pt(x - 12, base - 46)}L${pt(x - 30, base - 58)}M${pt(x - 25, base - 55)}L${pt(x - 31, base - 52)}M${pt(x + 12, base - 46)}L${pt(x + 29, base - 60)}M${pt(x + 24, base - 56)}L${pt(x + 27, base - 64)}" stroke="#3a2a1c" stroke-width="2" stroke-linecap="round" fill="none"/>`
  s += `<path d="M${pt(x - 9, hy + 6)}Q${pt(x, hy + 10)} ${pt(x + 9, hy + 6)}L${pt(x + 8, hy + 10)}Q${pt(x, hy + 13)} ${pt(x - 9, hy + 10)}Z M${pt(x + 4, hy + 9)}L${pt(x + 7, hy + 20)}L${pt(x + 10, hy + 19)}L${pt(x + 7, hy + 9)}Z" fill="#b8323a"/>`
  s += `<circle cx="${n(x - 3.5)}" cy="${n(hy - 2)}" r="1.3" fill="#1a1a22"/><circle cx="${n(x + 3)}" cy="${n(hy - 2)}" r="1.3" fill="#1a1a22"/>`
  s += `<path d="M${pt(x - 1, hy + 0.5)}L${pt(x - 11, hy + 2.5)}L${pt(x - 1, hy + 3)}Z" fill="#e07b2e"/>`
  s += `<path d="M${pt(x - 9, hy - 7)}H${n(x + 9)}V${n(hy - 9)}H${n(x + 6)}V${n(hy - 21)}H${n(x - 6)}V${n(hy - 9)}H${n(x - 9)}Z" fill="#15131c"/>`
  s += `<path d="M${pt(x - 6, hy - 21)}Q${pt(x, hy - 24)} ${pt(x + 6, hy - 21)}Z" fill="${SNOW}"/>`
  for (const dy of [-41, -32, -23]) s += `<circle cx="${n(x - 1)}" cy="${n(base + dy)}" r="1.4" fill="#1a1a22"/>`
  return s
}

/** A fox that trots along the front drift, left to right, then is gone for a while. */
function fox(drift) {
  let d = ''
  for (let x = -80; x <= 1680; x += 40) d += `${d ? 'L' : 'M'}${pti(x, drift(x) + 14)}`
  const leg = (x, hind, phase, coat, sock) => {
    const coatPath = hind ? `M${x} -12L${x + 1.6} -7L${x - 2} -3.5` : `M${x} -12L${x} -6`
    const sockPath = hind ? `M${x - 2} -3.5L${x - 1} 0.8L${x + 1} 1` : `M${x} -6L${x + 0.5} -2.5L${x + 0.3} 0.8L${x + 2} 1`
    return `<g class="lg ${phase}" style="transform-origin:${x}px -12px">` +
      `<path d="${coatPath}" stroke="${coat}" stroke-width="${hind ? 3.4 : 2.6}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
      `<path d="${sockPath}" stroke="${sock}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`
  }
  const far = leg(9, false, 'pb', '#a8541f', '#1c120a') + leg(-9, true, 'pa', '#a8541f', '#1c120a')
  const near = leg(6, false, 'pa', '#c86a2d', '#2a1a10') + leg(-6, true, 'pb', '#c86a2d', '#2a1a10')
  const body = `<g transform="translate(0 -3)"><g class="fb">` +
    `<path d="M-15 -13Q-30 -20 -42 -9Q-31 -6 -15 -9Z" fill="#c2652b"/><path d="M-36 -12Q-42 -10 -42 -9Q-38 -7 -34 -8Z" fill="#f1ece4"/>` +
    `<ellipse cx="0" cy="-12" rx="15" ry="6.5" fill="#c86a2d"/><ellipse cx="3" cy="-8.5" rx="8" ry="2.6" fill="#efe4d4"/>` +
    `<path d="M11 -15Q16 -24 21 -19L28 -15L19 -12Q13 -11 11 -15Z" fill="#c86a2d"/><path d="M21 -15L28 -15L20 -12Z" fill="#efe4d4"/>` +
    `<path d="M14 -20L15 -27L18 -21ZM18 -20L20 -26L21 -19Z" fill="#7a3a18"/><circle cx="21" cy="-17.5" r="0.9" fill="#120c08"/></g></g>`
  return `<g class="fox" style="offset-path:path('${d}')"><g transform="scale(1.25)">${far}${body}${near}</g></g>`
}

// ---------------------------------------------------------------- the whole scene

/**
 * The Snowfall backdrop for a context fill of 0 to 100. The desktop app refuses an SVG over 131072 characters
 * and then draws nothing at all, so if the full scene ever comes out too long, a lighter one is drawn instead.
 */
export function scene(percent) {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)))
  const full = compose(p, false)
  return full.length <= MAX_SVG ? full : compose(p, true)
}

function compose(p, lite) {
  const snow = 0.25 + (p / 100) * 0.75
  const drift = driftAt(p * 0.75)
  const flakeCount = Math.round((70 + p * 4.5) * (lite ? 0.5 : 1))
  const cabinX = 1225
  const cabinY = field(1290) + 4

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
<style>
  .fl { animation: fall linear infinite; }
  @keyframes fall { from { transform: translateY(0); } to { transform: translateY(960px); } }
  .sw { animation: sway ease-in-out infinite alternate; }
  @keyframes sway { from { transform: translateX(-24px); } to { transform: translateX(18px); } }
  .s { fill: #ffffff; animation: twinkle 3s ease-in-out infinite; }
  @keyframes twinkle { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
  .w { fill: #ffd27a; animation: flicker 2.4s ease-in-out infinite; }
  .w2 { animation-delay: -0.9s; animation-duration: 3.1s; }
  .w3 { animation-delay: -1.7s; animation-duration: 2.7s; }
  @keyframes flicker { 0%,100% { fill: #ffd27a; opacity: 0.85; } 35% { fill: #ffe6a8; opacity: 1; } 60% { fill: #ffc45e; opacity: 0.7; } 80% { fill: #ffe0a0; opacity: 0.95; } }
  .sp { animation: spill 2.4s ease-in-out infinite; }
  @keyframes spill { 0%,100% { opacity: 0.8; } 35% { opacity: 1; } 60% { opacity: 0.7; } }
  .smk { opacity: 0; transform-box: fill-box; transform-origin: center; animation: smoke 9s linear infinite; }
  @keyframes smoke { 0% { transform: translate(0, 0) scale(0.5); opacity: 0; } 12% { opacity: 0.32; } 100% { transform: translate(-46px, -150px) scale(2.8); opacity: 0; } }
  .ss { opacity: 0; animation: meteor linear infinite; }
  @keyframes meteor { 0% { transform: translate(0, 0); opacity: 0; } 1% { opacity: 1; } 5% { transform: translate(330px, 108px); opacity: 0; } 100% { transform: translate(330px, 108px); opacity: 0; } }
  .fox { offset-rotate: 0deg; offset-distance: 0%; animation: trot 75s linear infinite; animation-delay: -6s; }
  @keyframes trot { 0% { offset-distance: 0%; } 45% { offset-distance: 100%; } 100% { offset-distance: 100%; } }
  .fb { animation: bob 0.5s ease-in-out infinite alternate; }
  @keyframes bob { from { transform: translateY(0); } to { transform: translateY(-1.2px); } }
  .lg { animation: gait 0.5s ease-in-out infinite; }
  .pb { animation-delay: -0.25s; }
  @keyframes gait { 0%, 100% { transform: rotate(-20deg); } 50% { transform: rotate(20deg); } }
  @media (prefers-reduced-motion: reduce) { .ss, .fox { display: none; } .fl, .sw, .s, .w, .sp, .fb, .lg { animation: none; } .smk { animation: none; opacity: 0.18; } }
</style>
<svg width="100%" height="100%" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#060b1f"/>
      <stop offset="0.6" stop-color="#0f1b45"/>
      <stop offset="1" stop-color="#1b2b63"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff6d5" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#fff6d5" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="range" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a3c78"/>
      <stop offset="0.25" stop-color="#1c2b5f"/>
    </linearGradient>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.82" stop-color="#c6d4ec"/>
      <stop offset="1" stop-color="#9fb2d6"/>
    </linearGradient>
    <linearGradient id="drift" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.8" stop-color="#eef4fb"/>
      <stop offset="1" stop-color="#cbd8ee"/>
    </linearGradient>
    <linearGradient id="roofsnow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f4f8ff"/>
      <stop offset="1" stop-color="#d2deef"/>
    </linearGradient>
    <radialGradient id="spill" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffcf80" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffcf80" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd27a" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#ffd27a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="haze" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffcf80" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffcf80" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="tail" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="-110" y2="-36">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    ${pineGradients()}
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  ${stars(90)}
  ${lite ? '' : shootingStars()}
  <circle cx="${MOON_X}" cy="${MOON_Y}" r="140" fill="url(#glow)"/>
  <circle cx="${MOON_X}" cy="${MOON_Y}" r="48" fill="#fff4d6"/>
  <circle cx="1362" cy="140" r="7" fill="#efe3c0" opacity="0.6"/>
  <circle cx="1395" cy="168" r="10" fill="#efe3c0" opacity="0.5"/>
  ${mountains()}
  ${hill(farHill, '#22356f')}
  ${lite ? '' : farForest(snow)}
  ${hill(midHill, '#2d4486')}
  ${hill(field, 'url(#field)')}
  ${midForest(snow)}
  ${cabin(cabinX, cabinY, snow)}
  ${snowman(cabinX - 48, field(cabinX - 48) + 14)}
  ${hill(drift, 'url(#drift)')}
  ${lite ? '' : sparkles(drift)}
  ${fox(drift)}
  ${nearForest(snow)}
  ${flakes(flakeCount)}
</svg>
</svg>`
}
