/**
 * Headless smoke test: mount the built bundle in jsdom, walk the page list, and
 * exercise the pure helpers (slash reader, migration) plus a real editor
 * round-trip and undo/redo. It cannot judge how the page looks.
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { blocksToDoc, emptyDoc, loadState, mergeCollections } from '../src/store.js'
import { readSlash } from '../src/slash.js'
import { createEditor, exitEmptyItem, mergeBlankParagraphBeforeList } from '../src/editor.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const virtualConsole = new VirtualConsole()
virtualConsole.sendTo(console, { omitJSDOMErrors: true })
virtualConsole.on('jsdomError', (error) => {
  // React 18's IE input-event polyfill calls attachEvent, which jsdom lacks.
  if (/(attach|detach)Event/.test(String(error && error.message))) return
  console.error('[jsdom]', error && error.message)
})

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  virtualConsole,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Element = dom.window.Element
globalThis.Node = dom.window.Node
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)
globalThis.DOMRect = dom.window.DOMRect
globalThis.Range = dom.window.Range
globalThis.Selection = dom.window.Selection

/* Seed a page written by the previous single-page build, to test migration. */
dom.window.localStorage.setItem('dsh-floating-notes/v1', JSON.stringify({
  version: 3,
  title: 'legacy page',
  doc: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Plan' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
    ],
  },
}))

let loaded
dom.window.__ModuleLoader__ = {
  load: (mod) => { loaded = mod },
}

await import('../client.js')
if (!loaded) throw new Error('bundle did not register itself')
if (loaded.id !== 'dsh-floating-notes') throw new Error('unexpected id: ' + loaded.id)

const plugin = loaded.factory((id) => {
  if (id === 'react') return React
  throw new Error('unexpected require: ' + id)
})

let registration
plugin.apply({
  effect: (callback) => callback(),
  locale: {
    register: () => () => {},
    bind: () => (key, params) => (params ? key + ':' + JSON.stringify(params) : key),
    subscribe: () => () => {},
    getSnapshot: () => ({ revision: 0, active: 'en' }),
  },
  slots: {
    inject: (key, callback) => callback(),
    register: (options, component) => {
      registration = { options, component }
      return () => {}
    },
  },
})

if (!registration || registration.options.id !== 'dsh-floating-notes') {
  throw new Error('slot registration missing')
}
console.log('slot entry:', registration.options.name, registration.options.order)

const container = dom.window.document.getElementById('root')
const root = createRoot(container)
const click = (element) => {
  element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
}

await act(async () => {
  root.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})

const fab = container.querySelector('.fn-fab')
if (!fab) throw new Error('floating button did not render')

/* ------------------------------------------------------------- draggable */

const pointer = (type, x, y) => {
  const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  return event
}

await act(async () => {
  fab.dispatchEvent(pointer('pointerdown', 10, 10))
  fab.dispatchEvent(pointer('pointermove', 90, -30))
  fab.dispatchEvent(pointer('pointerup', 90, -30))
})

const moved = JSON.parse(dom.window.localStorage.getItem('dsh-floating-notes/position'))
if (!moved || moved.xSide !== 'left' || moved.ySide !== 'top' || moved.x !== 80 || moved.y !== 8) {
  throw new Error('drag anchor: ' + JSON.stringify(moved))
}
const rootStyle = container.querySelector('.fn-root').getAttribute('style') || ''
if (!/left:\s*80px/.test(rootStyle)) throw new Error('root did not move: ' + rootStyle)
if (container.querySelector('.fn-panel')) throw new Error('panel opened during the drag')
console.log('dragged to', JSON.stringify(moved), '| root style', rootStyle)

await act(async () => { click(fab) })
if (container.querySelector('.fn-panel')) throw new Error('the click that ends a drag must not open the panel')

await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
await act(async () => { click(fab) })
if (!container.querySelector('.fn-panel')) throw new Error('panel did not open after the drag')
if (!container.querySelector('.fn-foot-hint')) {
  throw new Error('first-run "saved on this device" hint missing')
}
console.log('first-run hint:', container.querySelector('.fn-foot-hint').textContent)

/* ---------------------------------------------------------------- resizing */

const handles = container.querySelectorAll('.fn-resize')
if (handles.length !== 3) throw new Error('resize handles: ' + handles.length)
const east = container.querySelector('.fn-resize-e')
const south = container.querySelector('.fn-resize-s')
const corner = container.querySelector('.fn-resize-corner')
if (!east || !south) throw new Error('resize handles missing')
if (container.querySelector('.fn-resize-n')) {
  throw new Error('a panel below a top button must resize from its bottom edge')
}
const panelBefore = container.querySelector('.fn-panel').getAttribute('style') || ''
const startWidth = Number(/width:\s*(\d+)px/.exec(panelBefore)[1])
const startHeight = Number(/height:\s*(\d+)px/.exec(panelBefore)[1])
const startTop = Number(/top:\s*(-?\d+)px/.exec(panelBefore)[1])
const startLeft = Number(/left:\s*(-?\d+)px/.exec(panelBefore)[1])
if (startLeft !== 0) throw new Error('panel is not aligned with the button left edge: ' + startLeft)
if (startTop !== 64) throw new Error('panel should open below a top button: ' + startTop)

await act(async () => {
  east.dispatchEvent(pointer('pointerdown', 400, 300))
  east.dispatchEvent(pointer('pointermove', 440, 300))
})
const afterEast = container.querySelector('.fn-panel').getAttribute('style') || ''
if (!afterEast.includes('width: ' + (startWidth + 40) + 'px')) {
  throw new Error('east edge did not resize: ' + afterEast)
}
if (/left:\s*(-?\d+)px/.exec(afterEast)[1] !== String(startLeft)) {
  throw new Error('east resize moved the anchored edge')
}
await act(async () => { east.dispatchEvent(pointer('pointerup', 440, 300)) })

await act(async () => {
  south.dispatchEvent(pointer('pointerdown', 300, 200))
  south.dispatchEvent(pointer('pointermove', 300, 220))
})
const afterSouth = container.querySelector('.fn-panel').getAttribute('style') || ''
if (!afterSouth.includes('height: ' + (startHeight + 20) + 'px')) {
  throw new Error('south edge did not resize: ' + afterSouth)
}
if (/top:\s*(-?\d+)px/.exec(afterSouth)[1] !== String(startTop)) {
  throw new Error('south resize moved the anchored edge')
}
await act(async () => { south.dispatchEvent(pointer('pointerup', 300, 220)) })

/* The corner moves both axes at once. */
await act(async () => {
  corner.dispatchEvent(pointer('pointerdown', 400, 300))
  corner.dispatchEvent(pointer('pointermove', 430, 320))
  corner.dispatchEvent(pointer('pointerup', 430, 320))
})
const afterCorner = container.querySelector('.fn-panel').getAttribute('style') || ''
if (!afterCorner.includes('width: ' + (startWidth + 40 + 30) + 'px')) {
  throw new Error('corner did not widen: ' + afterCorner)
}
if (!afterCorner.includes('height: ' + (startHeight + 20 + 20) + 'px')) {
  throw new Error('corner did not heighten: ' + afterCorner)
}

const storedSize = JSON.parse(dom.window.localStorage.getItem('dsh-floating-notes/size'))
if (!storedSize || storedSize.width !== startWidth + 70 || storedSize.height !== startHeight + 40) {
  throw new Error('stored size: ' + JSON.stringify(storedSize))
}
console.log('resized below-placement panel to', storedSize.width + 'x' + storedSize.height,
  'from', startWidth + 'x' + startHeight, '| button side and top fixed')

/* ------------------------------------------------------------------ tabs */

let tabs = container.querySelectorAll('.fn-tab')
if (tabs.length !== 1) throw new Error('tabs: ' + tabs.length)
if (tabs[0].querySelector('.fn-tab-title').textContent !== 'legacy page') {
  throw new Error('tab title: ' + tabs[0].textContent)
}
console.log('tabs at start:', tabs.length)

await act(async () => { click(container.querySelector('.fn-tab-new')) })
tabs = container.querySelectorAll('.fn-tab')
if (tabs.length !== 2) throw new Error('tabs after create: ' + tabs.length)
const activeTabTitle = container.querySelector('.fn-tab-active .fn-tab-title').textContent
if (activeTabTitle !== 'page.untitled') throw new Error('new tab is not active: ' + activeTabTitle)
if (container.querySelector('.fn-title').value !== '') throw new Error('new page is not empty')
console.log('tabs after create:', tabs.length, 'active:', activeTabTitle)

const legacyTab = [...container.querySelectorAll('.fn-tab')]
  .find((tab) => tab.querySelector('.fn-tab-title').textContent === 'legacy page')
await act(async () => { click(legacyTab) })
if (container.querySelector('.fn-title').value !== 'legacy page') throw new Error('switching tabs lost the title')
console.log('switched back to the legacy tab')

const newTab = [...container.querySelectorAll('.fn-tab')]
  .find((tab) => tab.querySelector('.fn-tab-title').textContent === 'page.untitled')
await act(async () => { click(newTab.querySelector('.fn-tab-close')) })
const confirm = container.querySelector('.fn-tab-danger')
if (!confirm) throw new Error('delete confirmation missing')
await act(async () => { click(confirm) })
tabs = container.querySelectorAll('.fn-tab')
if (tabs.length !== 1) throw new Error('tabs after delete: ' + tabs.length)
console.log('deleted a tab, remaining:', tabs.length)

/* ---------------------------------------------------------- persistence */

await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)) })
const stored = JSON.parse(dom.window.localStorage.getItem('dsh-floating-notes/v1'))
if (!Array.isArray(stored.pages) || stored.pages.length !== 1) {
  throw new Error('stored pages: ' + JSON.stringify(stored).slice(0, 120))
}
if (stored.version !== 5) throw new Error('stored version: ' + stored.version)
if (!stored.deleted || Object.keys(stored.deleted).length !== 1) {
  throw new Error('tombstone missing: ' + JSON.stringify(stored.deleted))
}
console.log('persisted version', stored.version, 'pages', stored.pages.length,
  'tombstones', Object.keys(stored.deleted).length, 'active', Boolean(stored.activeId))

/* ------------------------------------------------------- merge semantics */

const stamp = Date.now()
const pageOld = { id: 'a', title: 'A', doc: emptyDoc(), createdAt: 1, updatedAt: stamp - 1000 }
const pageOther = { id: 'b', title: 'B', doc: emptyDoc(), createdAt: 2, updatedAt: stamp - 500 }
const localWins = mergeCollections(
  { activeId: 'a', pages: [{ ...pageOld, title: 'A local', updatedAt: stamp }], deleted: {} },
  { activeId: 'b', pages: [pageOld, pageOther], deleted: {} },
)
if (localWins.pages.length !== 2) throw new Error('merge dropped a page: ' + localWins.pages.length)
if (localWins.pages.find((page) => page.id === 'a').title !== 'A local') {
  throw new Error('merge lost the newer local edit')
}

const tombstoned = mergeCollections(
  { activeId: 'a', pages: [pageOld], deleted: { b: stamp } },
  { activeId: 'a', pages: [pageOld, pageOther], deleted: {} },
)
if (tombstoned.pages.some((page) => page.id === 'b')) throw new Error('tombstone did not delete the page')
if (!tombstoned.deleted.b) throw new Error('tombstone was not kept')
console.log('merge: newer edit wins, tombstone deletes')

/* ----------------------------------------------------------- pure helpers */

const fakeEditor = {
  state: {
    selection: {
      empty: true,
      from: 4,
      $from: {
        parent: { isTextblock: true, textBetween: () => '/he' },
        parentOffset: 3,
        pos: 4,
      },
    },
  },
  view: { coordsAtPos: () => ({ left: 12, bottom: 30 }) },
}
const slash = readSlash(fakeEditor)
if (!slash || slash.query !== 'he' || slash.from !== 1 || slash.to !== 4) {
  throw new Error('slash reader returned ' + JSON.stringify(slash))
}
console.log('slash reader:', JSON.stringify(slash))

const legacyDoc = blocksToDoc([
  { type: 'bulleted', text: 'a' },
  { type: 'bulleted', text: 'b' },
  { type: 'todo', text: 'task', done: true },
  { type: 'heading1', text: 'title' },
  { type: 'divider' },
])
const kinds = legacyDoc.content.map((node) => node.type).join(',')
if (kinds !== 'bulletList,taskList,heading,horizontalRule') {
  throw new Error('migration produced ' + kinds)
}
if (legacyDoc.content[1].content[0].attrs.checked !== true) throw new Error('task state lost')

/* --------------------------------------------- real editor round trip */

const host = dom.window.document.createElement('div')
dom.window.document.body.appendChild(host)
const editor = createEditor({
  element: host,
  content: legacyDoc,
  placeholder: () => 'placeholder',
  onKeyDown: () => false,
})
const roundTrip = editor.getJSON()
const roundKinds = roundTrip.content.map((node) => node.type).join(',')
if (roundKinds !== 'bulletList,taskList,heading,horizontalRule') {
  throw new Error('editor round trip: ' + roundKinds)
}
const checkboxes = host.querySelectorAll('ul[data-type="taskList"] li input[type="checkbox"]')
if (checkboxes.length !== 1) throw new Error('task inputs: ' + checkboxes.length)
if (checkboxes[0].checked !== true) throw new Error('checked task lost in the DOM')
console.log('editor round trip:', roundKinds, '| task inputs:', checkboxes.length)

const before = JSON.stringify(editor.getJSON())
editor.commands.insertContent('x')
const afterInsert = JSON.stringify(editor.getJSON())
if (before === afterInsert) throw new Error('insertContent changed nothing')
editor.commands.undo()
if (JSON.stringify(editor.getJSON()) !== before) throw new Error('undo did not restore the document')
editor.commands.redo()
if (JSON.stringify(editor.getJSON()) !== afterInsert) throw new Error('redo did not reapply')
console.log('undo/redo: ok')

editor.destroy()
host.remove()

/* ------------------------------------------ leaving a list from an empty item */

function listDoc(type, items) {
  return {
    type: 'doc',
    content: [{
      type: type === 'taskList' ? 'taskList' : 'bulletList',
      content: items.map((text, index) => ({
        type: type === 'taskList' ? 'taskItem' : 'listItem',
        attrs: type === 'taskList' ? { checked: false } : undefined,
        content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
      })),
    }],
  }
}

function exitAt(doc, label) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ element: host, content: doc, placeholder: () => '', onKeyDown: () => false })
  let emptyPos = null
  editor.state.doc.descendants((node, pos) => {
    const item = node.type.name === 'taskItem' || node.type.name === 'listItem'
    if (item && node.textContent === '') emptyPos = pos + 2
  })
  editor.commands.setTextSelection(emptyPos)
  const changed = exitEmptyItem(editor.view)
  const shape = editor.getJSON().content.map((node) => node.type).join(',')
  const caret = editor.state.selection.$from.parent.type.name
  editor.destroy()
  host.remove()
  if (!changed) throw new Error(label + ': exit reported no change')
  if (caret !== 'paragraph') throw new Error(label + ': caret stayed in ' + caret)
  console.log(label, '->', shape)
  return shape
}

if (exitAt(listDoc('taskList', ['a', '', 'b']), 'todo in the middle') !== 'taskList,paragraph,taskList') {
  throw new Error('middle item did not split the list')
}
if (exitAt(listDoc('taskList', ['a', '']), 'todo at the end') !== 'taskList,paragraph') {
  throw new Error('last item did not exit')
}
if (exitAt(listDoc('taskList', ['', 'a']), 'todo at the start') !== 'paragraph,taskList') {
  throw new Error('first item did not exit')
}
if (exitAt(listDoc('bulletList', ['a', '', 'b']), 'bullet in the middle') !== 'bulletList,paragraph,bulletList') {
  throw new Error('bullet item did not split the list')
}

/* The same exit for the Delete key and for lines that only look empty. */
function keyExitAt(doc, key, index, label) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({
    element: host,
    content: doc,
    placeholder: () => '',
    onKeyDown: (event, view) => (
      (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete')
        ? exitEmptyItem(view)
        : false
    ),
  })
  const listNode = editor.state.doc.child(0)
  let position = 1
  for (let i = 0; i < index; i += 1) position += listNode.child(i).nodeSize
  editor.commands.setTextSelection(position + 2)
  editor.view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  }))
  const shape = editor.getJSON().content.map((node) => node.type).join(',')
  editor.destroy()
  host.remove()
  if (shape !== 'taskList,paragraph,taskList') {
    throw new Error(label + ' produced ' + shape)
  }
  console.log(label, '->', shape)
}

keyExitAt(listDoc('taskList', ['a', '', 'b']), 'Delete', 1, 'Delete on an empty to-do')
keyExitAt(listDoc('taskList', ['a', ' ', 'b']), 'Backspace', 1, 'space-only to-do')
keyExitAt({
  type: 'doc',
  content: [{
    type: 'taskList',
    content: [
      { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
      { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'hardBreak' }] }] },
      { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
    ],
  }],
}, 'Backspace', 1, 'hard-break-only to-do')

/* ---- regression: a to-do with a trailing empty line keeps its text ---- */

const twoParagraphDoc = {
  type: 'doc',
  content: [{
    type: 'taskList',
    content: [{
      type: 'taskItem',
      attrs: { checked: true },
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '发版 admin' }] },
        { type: 'paragraph' },
      ],
    }],
  }],
}
const twoHost = document.createElement('div')
document.body.appendChild(twoHost)
const twoEditor = createEditor({
  element: twoHost,
  content: twoParagraphDoc,
  placeholder: () => '',
  onKeyDown: () => false,
})
let blankPos = null
twoEditor.state.doc.descendants((node, pos) => {
  if (node.type.name === 'paragraph' && node.content.size === 0) blankPos = pos + 1
})
twoEditor.commands.setTextSelection(blankPos)
if (exitEmptyItem(twoEditor.view)) {
  throw new Error('exit helper must not fire inside a to-do that still has text')
}
twoEditor.view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
  key: 'Backspace',
  bubbles: true,
  cancelable: true,
}))
const afterJoin = twoEditor.getJSON()
const keptItem = afterJoin.content[0].content[0]
if (keptItem.content.length !== 1 || keptItem.content[0].content[0].text !== '发版 admin') {
  throw new Error('backspace removed the to-do text: ' + JSON.stringify(afterJoin))
}
console.log('two-paragraph to-do: backspace keeps the text, drops only the blank line')
twoEditor.destroy()
twoHost.remove()

/* ---- regression: backspace on the blank line a list exit leaves behind ---- */

const blankAfterList = {
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
      ],
    },
    { type: 'paragraph' },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] },
      ],
    },
  ],
}
const mergeHost = document.createElement('div')
document.body.appendChild(mergeHost)
const mergeEditor = createEditor({
  element: mergeHost,
  content: blankAfterList,
  placeholder: () => '',
  onKeyDown: (event, view) => {
    if (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') {
      if (exitEmptyItem(view)) return true
      if (event.key === 'Backspace' && mergeBlankParagraphBeforeList(view)) return true
    }
    return false
  },
})
let blankParagraph = null
mergeEditor.state.doc.descendants((node, pos) => {
  if (node.type.name === 'paragraph' && node.content.size === 0) blankParagraph = pos + 1
})
mergeEditor.commands.setTextSelection(blankParagraph)
mergeEditor.view.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
  key: 'Backspace',
  bubbles: true,
  cancelable: true,
}))
const merged = mergeEditor.getJSON()
const mergedShape = merged.content.map((node) => node.type).join(',')
if (mergedShape !== 'taskList,taskList') {
  throw new Error('blank line came back as a to-do: ' + JSON.stringify(merged))
}
if (merged.content[0].content.length !== 2) {
  throw new Error('merging the blank line changed the list: ' + JSON.stringify(merged.content[0]))
}
if (mergeEditor.state.selection.$from.parent.type.name !== 'paragraph') {
  throw new Error('caret did not land in the list text')
}
console.log('blank line after a list merges upwards ->', mergedShape)
mergeEditor.destroy()
mergeHost.remove()

/* Storage reader still accepts the old single-page shape. */
dom.window.localStorage.setItem('dsh-floating-notes/v1', JSON.stringify({ version: 3, title: 'old', doc: legacyDoc }))
const migrated = loadState()
if (migrated.pages.length !== 1 || migrated.pages[0].title !== 'old') {
  throw new Error('loadState migration failed: ' + JSON.stringify(migrated).slice(0, 120))
}
console.log('loadState migrated a single page')

await act(async () => { root.unmount() })

/* --------------------------------------------------- corrupt data recovery */

dom.window.localStorage.setItem('dsh-floating-notes/v1', '{ this is not json')
const recovered = loadState()
if (!recovered.recovered) throw new Error('corrupt data was not flagged')
if (!dom.window.localStorage.getItem(recovered.recovered)) throw new Error('corrupt backup missing')
console.log('corrupt data backed up as', recovered.recovered)

const root2 = createRoot(container)
await act(async () => {
  root2.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})
const fab2 = container.querySelector('.fn-fab')
if (!fab2) throw new Error('second mount failed')
await act(async () => { click(fab2) })
const notice = container.querySelector('.fn-notice')
if (!notice) throw new Error('recovery notice missing')
console.log('notice rendered:', notice.textContent.slice(0, 60))
await act(async () => { root2.unmount() })

/* Default corner placement: no room on the right, so the panel opens to the left. */
dom.window.localStorage.removeItem('dsh-floating-notes/position')
const root3 = createRoot(container)
await act(async () => {
  root3.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})
const fab3 = container.querySelector('.fn-fab')
await act(async () => { click(fab3) })
const cornerStyle = container.querySelector('.fn-panel').getAttribute('style') || ''
const cornerLeft = Number(/left:\s*(-?\d+)px/.exec(cornerStyle)[1])
const cornerTop = Number(/top:\s*(-?\d+)px/.exec(cornerStyle)[1])
const cornerWidth = Number(/width:\s*(\d+)px/.exec(cornerStyle)[1])
const cornerHeight = Number(/height:\s*(\d+)px/.exec(cornerStyle)[1])
if (cornerLeft !== 52 - cornerWidth) {
  throw new Error('corner placement left: ' + cornerLeft + ' expected ' + (52 - cornerWidth))
}
if (cornerTop !== -12 - cornerHeight) {
  throw new Error('panel is not above the button: top ' + cornerTop + ' expected ' + (-12 - cornerHeight))
}
if (!container.querySelector('.fn-resize-w') || container.querySelector('.fn-resize-e')) {
  throw new Error('wrong resize edge for a panel on the left')
}
if (!container.querySelector('.fn-resize-n') || container.querySelector('.fn-resize-s')) {
  throw new Error('wrong resize edge for a panel above the button')
}
if (!container.querySelector('.fn-resize-corner.fn-resize-nw')) {
  throw new Error('an above-left panel should offer its top-left corner')
}
console.log('corner placement: above-left of the button', cornerLeft + ',' + cornerTop, 'size', cornerWidth + 'x' + cornerHeight)
await act(async () => { root3.unmount() })

/* ------------------------------------- Enter on an empty to-do, end to end */

const taskItem = (text) => ({
  type: 'taskItem',
  attrs: { checked: false },
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
})
dom.window.localStorage.setItem('dsh-floating-notes/v1', JSON.stringify({
  version: 5,
  activeId: 'p1',
  pages: [{
    id: 'p1',
    title: 'tasks',
    doc: { type: 'doc', content: [{ type: 'taskList', content: [taskItem('first'), taskItem('')] }] },
    createdAt: 1,
    updatedAt: 1,
  }],
  deleted: {},
}))
const root4 = createRoot(container)
await act(async () => {
  root4.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})
const fab4 = container.querySelector('.fn-fab')
await act(async () => { click(fab4) })
const prose = container.querySelector('.ProseMirror')
if (!prose) throw new Error('editor missing for the task test')
await act(async () => {
  prose.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
})
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)) })
const taskStored = JSON.parse(dom.window.localStorage.getItem('dsh-floating-notes/v1'))
const storedDoc = taskStored.pages.find((page) => page.id === 'p1').doc
const storedShape = storedDoc.content.map((node) => node.type).join(',')
if (storedShape !== 'taskList,paragraph') {
  throw new Error('Enter did not leave the to-do list: ' + storedShape)
}
console.log('empty to-do + Enter ->', storedShape)
await act(async () => { root4.unmount() })

/* --------------------------- the button keeps its distance from the edges */

dom.window.localStorage.removeItem('dsh-floating-notes/position')
const root5 = createRoot(container)
await act(async () => {
  root5.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})
const fab5 = container.querySelector('.fn-fab')
await act(async () => {
  fab5.dispatchEvent(pointer('pointerdown', 10, 10))
  fab5.dispatchEvent(pointer('pointermove', 610, 510))
  fab5.dispatchEvent(pointer('pointerup', 610, 510))
})
const cornerAnchor = JSON.parse(dom.window.localStorage.getItem('dsh-floating-notes/position'))
if (cornerAnchor.xSide !== 'right' || cornerAnchor.ySide !== 'bottom') {
  throw new Error('quadrant anchor: ' + JSON.stringify(cornerAnchor))
}
if (cornerAnchor.x !== 1024 - 52 - 600 || cornerAnchor.y !== 768 - 52 - 500) {
  throw new Error('anchor distance: ' + JSON.stringify(cornerAnchor))
}

Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1280 })
Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 900 })
await act(async () => { dom.window.dispatchEvent(new dom.window.Event('resize')) })
const resizedStyle = container.querySelector('.fn-root').getAttribute('style') || ''
const expectedLeft = 1280 - 52 - cornerAnchor.x
const expectedTop = 900 - 52 - cornerAnchor.y
if (!resizedStyle.includes('left: ' + expectedLeft + 'px')) {
  throw new Error('resize left: ' + resizedStyle)
}
if (!resizedStyle.includes('top: ' + expectedTop + 'px')) {
  throw new Error('resize top: ' + resizedStyle)
}
console.log('resize keeps the corner distance:', expectedLeft + ',' + expectedTop,
  'from', cornerAnchor.x + ',' + cornerAnchor.y)
await act(async () => { root5.unmount() })

/* ---------------------- a big panel shrinks to the roomier side of the button */

dom.window.localStorage.removeItem('dsh-floating-notes/position')
dom.window.localStorage.setItem('dsh-floating-notes/size', JSON.stringify({ width: 900, height: 700 }))
const root6 = createRoot(container)
await act(async () => {
  root6.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})
const fab6 = container.querySelector('.fn-fab')
await act(async () => {
  fab6.dispatchEvent(pointer('pointerdown', 10, 10))
  fab6.dispatchEvent(pointer('pointermove', 410, 310))
  fab6.dispatchEvent(pointer('pointerup', 410, 310))
})
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)) })
await act(async () => { click(container.querySelector('.fn-fab')) })

const viewportWidth = dom.window.innerWidth
const viewportHeight = dom.window.innerHeight
const buttonX = 400
const buttonY = 300
const roomAbove = buttonY - 12 - 8
const roomBelow = viewportHeight - (buttonY + 52) - 12 - 8
const roomLeft = buttonX + 52 - 8
const roomRight = viewportWidth - buttonX - 8
const goAbove = roomAbove >= roomBelow
const goRight = roomRight >= roomLeft
const fitWidth = Math.min(900, goRight ? roomRight : roomLeft)
const fitHeight = Math.min(700, goAbove ? roomAbove : roomBelow)
const fitLeft = goRight ? buttonX : buttonX + 52 - fitWidth
const fitTop = goAbove ? buttonY - 12 - fitHeight : buttonY + 52 + 12

const fittedStyle = container.querySelector('.fn-panel').getAttribute('style') || ''
const fittedWidth = Number(/width:\s*(\d+)px/.exec(fittedStyle)[1])
const fittedHeight = Number(/height:\s*(\d+)px/.exec(fittedStyle)[1])
const fittedLeft = Number(/left:\s*(-?\d+)px/.exec(fittedStyle)[1])
const fittedTop = Number(/top:\s*(-?\d+)px/.exec(fittedStyle)[1])
if (fittedWidth !== fitWidth || fittedHeight !== fitHeight) {
  throw new Error('panel did not shrink to fit: ' + fittedStyle
    + ' expected ' + fitWidth + 'x' + fitHeight)
}
if (fittedLeft !== fitLeft - buttonX || fittedTop !== fitTop - buttonY) {
  throw new Error('panel moved to the wrong side: ' + fittedStyle)
}
if (fittedTop < 64) throw new Error('panel reaches back over the button: ' + fittedTop)
const sizeAfterFit = JSON.parse(dom.window.localStorage.getItem('dsh-floating-notes/size'))
if (sizeAfterFit.width !== 900 || sizeAfterFit.height !== 700) {
  throw new Error('preferred size was overwritten: ' + JSON.stringify(sizeAfterFit))
}
console.log('big panel fits the roomier side:', fittedWidth + 'x' + fittedHeight,
  'at', fittedLeft + ',' + fittedTop, '| preferred 900x700 kept')
await act(async () => { root6.unmount() })

/* ------------------------------------------- the keep-open lock */

dom.window.localStorage.removeItem('dsh-floating-notes/position')
const root7 = createRoot(container)
await act(async () => {
  root7.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})
const outside = () => dom.window.document.body.dispatchEvent(
  new dom.window.MouseEvent('mousedown', { bubbles: true }),
)
const openPanel = async () => { await act(async () => { click(container.querySelector('.fn-fab')) }) }

await openPanel()
if (!container.querySelector('.fn-panel')) throw new Error('panel did not open')
await act(async () => { outside() })
if (container.querySelector('.fn-panel')) throw new Error('unlocked panel should close on an outside click')
console.log('unlocked: outside click closes the panel')

await openPanel()
const lock = container.querySelector('.fn-lock')
if (!lock) throw new Error('lock button missing')
await act(async () => { click(lock) })
if (lock.getAttribute('aria-pressed') !== 'true') throw new Error('lock did not engage')
await act(async () => { outside() })
if (!container.querySelector('.fn-panel')) throw new Error('locked panel closed on an outside click')
console.log('locked: outside click keeps the panel open')

await act(async () => { click(container.querySelector('.fn-lock')) })
await act(async () => { outside() })
if (container.querySelector('.fn-panel')) throw new Error('unlocked panel did not close again')
console.log('unlock restores the outside-click close')
await act(async () => { root7.unmount() })

/* ------------------------- a failed write is reported, a good one is silent ------------------------- */

const storagePrototype = dom.window.Storage.prototype
const originalSetItem = storagePrototype.setItem
storagePrototype.setItem = function setItem() {
  const error = new Error('quota')
  error.name = 'QuotaExceededError'
  throw error
}
const root8 = createRoot(container)
await act(async () => {
  root8.render(React.createElement(registration.component, {
    translate: (key) => key,
    localeFace: undefined,
  }))
})
await act(async () => { click(container.querySelector('.fn-fab')) })
if (container.querySelector('.fn-foot-hint')) throw new Error('the hint must not repeat')
if (container.querySelector('.fn-foot-error')) throw new Error('no failure yet')
await act(async () => { click(container.querySelector('.fn-tab-new')) })
await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)) })
const failure = container.querySelector('.fn-foot-error')
if (!failure) throw new Error('a failed save was not reported')
if ((failure.getAttribute('title') || '') !== 'status.failed.quota') {
  throw new Error('wrong failure reason: ' + failure.getAttribute('title'))
}
console.log('failed save reported:', failure.textContent, '|', failure.getAttribute('title'))
storagePrototype.setItem = originalSetItem
await act(async () => { root8.unmount() })

console.log('ok')
