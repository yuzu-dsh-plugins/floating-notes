/**
 * React is owned by the Host page and handed to this bundle through the module
 * loader's `require`. Keeping it behind a setter lets the bundled code use the
 * same React instance as the Harness UI instead of shipping a second copy.
 */

let react = null

/** @param value - the Host React runtime. */
export function setReact(value) {
  react = value
}

/** @returns the Host React runtime. */
export function getReact() {
  if (!react) throw new Error('dsh-floating-notes: React runtime is not installed')
  return react
}

/** `React.createElement`, looked up at call time. */
export function h(...args) {
  return getReact().createElement(...args)
}
