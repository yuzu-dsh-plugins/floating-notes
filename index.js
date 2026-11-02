/**
 * Host half of the floating-notes bundle.
 *
 * The plugin is a pure Client surface: the memo pad renders into `shell.overlay`
 * and persists to the browser's localStorage, so this half registers nothing and
 * needs no configuration. It exists so the Loader row has a plugin to activate.
 */
export function apply() {}
