/**
 * The `/` palette: read the query from the text between the current block start
 * and the caret, and place the menu at the caret. Works for any text block, so
 * it also opens inside list items and quotes.
 */

/**
 * @param editor - the TipTap editor.
 * @returns `{ query, from, to, left, top }` when a slash query is active, else null.
 */
export function readSlash(editor) {
  const view = editor && editor.view
  if (!view) return null
  const { state } = editor
  const { selection } = state
  if (!selection.empty) return null

  const $from = selection.$from
  const parent = $from.parent
  if (!parent.isTextblock) return null

  const offset = $from.parentOffset
  if (offset <= 0) return null
  const before = parent.textBetween(0, offset, '\n', '\n')
  const match = /^\/([^\s/]*)$/.exec(before)
  if (!match) return null

  const from = $from.pos - before.length
  let left = 0
  let top = 0
  try {
    const coords = view.coordsAtPos(selection.from)
    left = coords.left
    top = coords.bottom
  } catch (error) {
    const box = view.dom.getBoundingClientRect()
    left = box.left + 8
    top = box.top + 24
  }

  return { query: match[1], from, to: $from.pos, left, top }
}
