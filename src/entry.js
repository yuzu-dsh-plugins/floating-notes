import { setReact } from './runtime.js'
import { createPlugin } from './plugin.js'

/**
 * Entry point of the built `client.js`. The Host page loads this file as a plain
 * script and hands it the module factory contract: the factory receives the
 * page's `require` so `react` resolves to the Host's own React instance.
 */
// Lets the console tell which build the page actually loaded, since the Host
// serves the bundle composed at startup and a stale page is otherwise silent.
console.info('[dsh-floating-notes] bundle ' + __FLOATING_NOTES_BUILD__)

window.__ModuleLoader__.load({
  id: 'dsh-floating-notes',
  factory(require) {
    setReact(require('react'))
    return createPlugin()
  },
})
