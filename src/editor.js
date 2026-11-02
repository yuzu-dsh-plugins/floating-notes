/**
 * The editor is a TipTap (ProseMirror) instance mounted into a plain div. React
 * never renders inside that div, so ProseMirror owns its own DOM and the two
 * state machines cannot fight over the caret.
 *
 * StarterKit supplies the block vocabulary and the markdown input rules, so
 * `# `, `- `, `1. `, `> `, `---` and the inline `**bold**` / `*italic*` /
 * ``` `code` ``` shortcuts all work without custom code. Task lists and the
 * placeholder are separate extensions; their own node view already dispatches
 * the checkbox transaction, so no click handler is needed.
 */

import { Editor } from '@tiptap/core'
import { Selection, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'

/**
 * @param options.element - the host div the editor renders into.
 * @param options.content - the initial ProseMirror document.
 * @param options.ariaLabel - accessible name for the editable area.
 * @param options.placeholder - returns the localized placeholder text.
 * @param options.onUpdate - called after every document change.
 * @param options.onSelection - called after every selection change.
 * @param options.onKeyDown - `(event) => boolean`, true when the event was consumed.
 * @returns the editor instance.
 */
export function createEditor(options) {
  return new Editor({
    element: options.element,
    content: options.content,
    autofocus: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        dropcursor: false,
      }),
      Placeholder.configure({
        placeholder: options.placeholder,
        showOnlyWhenEditable: true,
      }),
      TaskList,
      TaskItem.configure({ nested: false }),
    ],
    editorProps: {
      attributes: {
        class: 'fn-prose',
        spellcheck: 'false',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': options.ariaLabel,
      },
      handleKeyDown: (view, event) => (options.onKeyDown ? options.onKeyDown(event, view) : false),
    },
    onUpdate: ({ editor }) => {
      if (options.onUpdate) options.onUpdate(editor)
    },
    onSelectionUpdate: ({ editor }) => {
      if (options.onSelection) options.onSelection(editor)
    },
  })
}

const LIST_ITEM_TYPES = new Set(['taskItem', 'listItem'])
const LIST_TYPES = new Set(['taskList', 'bulletList', 'orderedList'])

/** A line that looks empty: nothing, only whitespace, or only line breaks. */
function isEmptyLine(node) {
  if (!node || !node.isTextblock) return false
  if (node.content.size === 0) return true
  let blank = true
  node.forEach((child) => {
    if (child.isText) {
      if (child.text.trim() !== '') blank = false
    } else if (child.type.name !== 'hardBreak') {
      blank = false
    }
  })
  return blank
}

/**
 * Turn an empty list item into a paragraph, splitting the list around it.
 *
 * ProseMirror's own `liftListItem` only handles the last item of a list; for a
 * first or middle item it reorders the neighbours instead. This rebuilds the
 * list as [items before] [paragraph] [items after], which is what Notion does
 * when you press Enter (or Backspace) on an empty to-do line.
 *
 * @param view - the ProseMirror view.
 * @returns whether the document changed.
 */
export function exitEmptyItem(view) {
  if (!view || !view.state) return false
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty || !isEmptyLine($from.parent)) return false

  let depth = -1
  for (let level = $from.depth - 1; level > 0; level -= 1) {
    if (LIST_ITEM_TYPES.has($from.node(level).type.name)) {
      depth = level
      break
    }
  }
  if (depth < 2) return false
  // Only an item whose whole content is that empty block may leave the list.
  // A to-do with text plus a trailing empty line (its second paragraph) must
  // merge that line away, not take the item's text with it.
  if ($from.node(depth).childCount !== 1) return false

  const list = $from.node(depth - 1)
  if (!LIST_TYPES.has(list.type.name)) return false
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return false

  const listPos = $from.before(depth - 1)
  const index = $from.index(depth - 1)
  const before = []
  const after = []
  list.forEach((child, _offset, childIndex) => {
    if (childIndex < index) before.push(child)
    else if (childIndex > index) after.push(child)
  })

  const nodes = []
  if (before.length) nodes.push(list.type.create(list.attrs, before))
  nodes.push(paragraphType.create())
  if (after.length) nodes.push(list.type.create(list.attrs, after))

  const tr = state.tr.replaceWith(listPos, listPos + list.nodeSize, nodes)
  let caret = listPos
  if (before.length) caret += nodes[0].nodeSize
  tr.setSelection(TextSelection.create(tr.doc, caret + 1))
  view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Backspace on the blank paragraph that a list exit left behind.
 *
 * Left to ProseMirror, that paragraph is joined back into the list above and
 * becomes a fresh empty to-do — the checkbox the user just removed reappears.
 * Instead drop the paragraph and put the caret at the end of the list's last
 * text, which is what merging a blank line upwards means.
 *
 * @param view - the ProseMirror view.
 * @returns whether the document changed.
 */
export function mergeBlankParagraphBeforeList(view) {
  if (!view || !view.state) return false
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty || $from.depth !== 1 || !isEmptyLine($from.parent)) return false
  const index = $from.index(0)
  if (index === 0) return false
  const previous = state.doc.child(index - 1)
  if (!LIST_TYPES.has(previous.type.name)) return false

  const start = $from.before(1)
  const tr = state.tr.delete(start, start + $from.parent.nodeSize)
  const landing = tr.doc.resolve(Math.min(start, tr.doc.content.size))
  const selection = Selection.findFrom(landing, -1, true)
  if (selection) tr.setSelection(selection)
  view.dispatch(tr.scrollIntoView())
  return true
}
