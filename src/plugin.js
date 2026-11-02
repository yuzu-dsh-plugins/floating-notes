import { FloatingNotes } from './views.js'
import { DICTS, NS } from './dicts.js'

/**
 * The plugin module the Client loader instantiates: one locale namespace with
 * this bundle's copy, and one entry in the frame-wide overlay seat.
 * @returns the Cordis plugin object.
 */
export function createPlugin() {
  return {
    inject: ['slots', 'locale'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, DICTS), 'floating-notes: dictionaries')
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: NS,
        order: 40,
        locale: NS,
        inject: () => ({ localeFace: ctx.locale, translate: ctx.locale.bind(NS) }),
      }, FloatingNotes))
    },
  }
}
