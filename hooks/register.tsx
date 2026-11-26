import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { scene } from './scene.js'

// Context fill, 0 to 100, as the last API response reported it.
const fill = atom({ plugin: 'snowfall-theme', key: 'fill' } as const, 0)

// A dark winter night: deep blue surfaces, snow-white text.
const { theme, problems } = makeColors({
  label: 'Snowfall',
  only: 'dark',
  roles: { accent: '#7fb3ff', danger: '#ff7b6b', success: '#7bd88f', warning: '#ffc46b', pro: '#c49bff' },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0b1430',
        'surface-1': '#121c3a',
        'surface-2': '#182444',
        'surface-3': '#1a2446',
        'text-primary': '#eef3ff',
        'text-secondary': '#c3cde6',
        'text-muted': '#9aa7c8',
      },
    },
  },
})

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'snow', glass: { blur: 0, tint: '#0b1430', opacity: 0.15 } },
}

const box = { backgroundColor: '#0b1430cc', color: '#eef3ff', radius: 12, padding: 14, shadow: { y: 2, blur: 10, color: '#00000066' } }

const BOXED: ThemeSetArgs = {
  ...LOOK,
  style: { AssistantMessage: box, UserMessage: { ...box, backgroundColor: '#182444e6' } },
}

// A build without `style` throws, so fall back to the plain look.
async function applyLook($: EngineInterface) {
  try {
    return await $.theme.set(BOXED)
  } catch (error) {
    $.ui.log(String(error))
    return await $.theme.set(LOOK)
  }
}

let isDrawn = false

async function paint($: EngineInterface) {
  const set = await applyLook($)
  isDrawn = set.isDrawn
  $.ui.status(set.isDrawn ? undefined : set.reason)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await paint($)
    const usage = await $.session.usage()
    await update($, fill, () => usage.context.percent ?? 0)

    return next(e)
  })

  // After each model response, read the context fill and let the snow follow it.
  // A client that attached after session start gets the look on the next step.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (!isDrawn) {
      await paint($)
    }
    const usage = await $.session.usage()
    const percent = usage.context.percent
    if (percent !== undefined) {
      await update($, fill, () => percent)
    }

    return result
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.props.plugin !== 'snowfall-theme' || (e.surface !== 'desktop' && e.surface !== 'mobile')) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    const percent = await read($, fill)

    return <Svg source={scene(percent)} alt={`A snowy night; context is ${percent}% full`} isInteractive />
  })
}
