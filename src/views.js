import { h, getReact } from './runtime.js'
import { SLASH_ITEMS } from './dicts.js'
import { PANEL_ID } from './ids.js'
import { MAX_PAGES, STORAGE_KEY, emptyDoc, loadState, mergeCollections, newPage, readStored, saveState as persistPage } from './store.js'
import { createEditor, exitEmptyItem, mergeBlankParagraphBeforeList } from './editor.js'
import { readSlash } from './slash.js'
import { CSS } from './styles.js'

const SAVE_DELAY = 400
const HINT_KEY = 'dsh-floating-notes/hint-seen'

/** Shown once per page lifetime, whether or not localStorage remembers it. */
let hintShownThisPage = false
const POSITION_KEY = 'dsh-floating-notes/position'
const SIZE_KEY = 'dsh-floating-notes/size'
const BUTTON_SIZE = 52
const EDGE_MARGIN = 8
const MIN_WIDTH = 320
const MIN_HEIGHT = 240

/** Keep the button inside the viewport. */
function clampPosition(left, top, view) {
  const maxLeft = Math.max(EDGE_MARGIN, view.w - BUTTON_SIZE - EDGE_MARGIN)
  const maxTop = Math.max(EDGE_MARGIN, view.h - BUTTON_SIZE - EDGE_MARGIN)
  return {
    left: Math.min(Math.max(EDGE_MARGIN, Number(left) || 0), maxLeft),
    top: Math.min(Math.max(EDGE_MARGIN, Number(top) || 0), maxTop),
  }
}

function readViewport() {
  return { w: window.innerWidth, h: window.innerHeight }
}

/**
 * Remember the button by its distance from the two nearest screen edges, so a
 * resized window keeps it in the same quadrant at the same offset.
 */
function anchorFromPosition(position, view) {
  const centerX = position.left + BUTTON_SIZE / 2
  const centerY = position.top + BUTTON_SIZE / 2
  const xSide = centerX >= view.w / 2 ? 'right' : 'left'
  const ySide = centerY >= view.h / 2 ? 'bottom' : 'top'
  return {
    xSide,
    x: Math.round(xSide === 'right' ? view.w - (position.left + BUTTON_SIZE) : position.left),
    ySide,
    y: Math.round(ySide === 'bottom' ? view.h - (position.top + BUTTON_SIZE) : position.top),
  }
}

function positionFromAnchor(anchor, view) {
  if (!anchor) return null
  return clampPosition(
    anchor.xSide === 'right' ? view.w - BUTTON_SIZE - anchor.x : anchor.x,
    anchor.ySide === 'bottom' ? view.h - BUTTON_SIZE - anchor.y : anchor.y,
    view,
  )
}

function loadAnchor() {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const view = readViewport()
    if ((parsed.xSide === 'left' || parsed.xSide === 'right')
      && (parsed.ySide === 'top' || parsed.ySide === 'bottom')
      && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      return anchorFromPosition(positionFromAnchor(parsed, view), view)
    }
    // Older builds stored absolute coordinates.
    if (Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
      return anchorFromPosition(clampPosition(parsed.left, parsed.top, view), view)
    }
    return null
  } catch (error) {
    return null
  }
}

function clampSize(width, height, view) {
  const maxWidth = Math.max(MIN_WIDTH, view.w - 2 * EDGE_MARGIN)
  const maxHeight = Math.max(MIN_HEIGHT, view.h - 2 * EDGE_MARGIN)
  return {
    width: Math.min(Math.max(MIN_WIDTH, Math.round(Number(width) || 0)), maxWidth),
    height: Math.min(Math.max(MIN_HEIGHT, Math.round(Number(height) || 0)), maxHeight),
  }
}

function loadSize() {
  try {
    const raw = window.localStorage.getItem(SIZE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Number.isFinite(parsed.width) || !Number.isFinite(parsed.height)) return null
    return clampSize(parsed.width, parsed.height, readViewport())
  } catch (error) {
    return null
  }
}

function saveSize(size) {
  try {
    window.localStorage.setItem(SIZE_KEY, JSON.stringify({ width: size.width, height: size.height }))
  } catch (error) {
    /* a full quota keeps the size for this page only */
  }
}

function saveAnchor(anchor) {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify({
      xSide: anchor.xSide,
      x: anchor.x,
      ySide: anchor.ySide,
      y: anchor.y,
    }))
  } catch (error) {
    /* a full quota keeps the position for this page only */
  }
}

/* ------------------------------------------------------------------ helpers */

/** Count unchecked task items in one ProseMirror JSON document. */
function countTodos(node) {
  const result = { open: 0, total: 0 }
  const walk = (current) => {
    if (!current || typeof current !== 'object') return
    if (current.type === 'taskItem') {
      result.total += 1
      if (!(current.attrs && current.attrs.checked)) result.open += 1
    }
    if (Array.isArray(current.content)) current.content.forEach(walk)
  }
  walk(node)
  return result
}

/**
 * Per-document cache: a page's doc keeps its identity until that page is edited,
 * so typing only re-walks the page being typed in.
 */
const todoCache = new WeakMap()

function todosOf(doc) {
  if (!doc || typeof doc !== 'object') return { open: 0, total: 0 }
  const cached = todoCache.get(doc)
  if (cached) return cached
  const result = countTodos(doc)
  todoCache.set(doc, result)
  return result
}

function countOpenTodos(pages) {
  return pages.reduce((sum, page) => sum + todosOf(page.doc).open, 0)
}

/** The page is still the blank template. */
function isEmptyPage(page) {
  if (page.title) return false
  const content = page.doc && Array.isArray(page.doc.content) ? page.doc.content : []
  if (content.length !== 1) return false
  const only = content[0]
  return only.type === 'paragraph' && !(Array.isArray(only.content) && only.content.length > 0)
}

/** Re-render on every locale revision so the panel follows a language switch. */
function useLocaleRevision(face) {
  const React = getReact()
  const usable = Boolean(face)
    && typeof face.subscribe === 'function'
    && typeof face.getSnapshot === 'function'
  const [revision, setRevision] = React.useState(() => (usable ? face.getSnapshot().revision : 0))
  React.useEffect(() => {
    if (!usable) return undefined
    const sync = () => setRevision(face.getSnapshot().revision)
    sync()
    return face.subscribe(sync)
  }, [face, usable])
  return revision
}

function activeLocale(face) {
  try {
    const snapshot = face && typeof face.getSnapshot === 'function' ? face.getSnapshot() : null
    return snapshot && typeof snapshot.active === 'string' ? snapshot.active : 'en'
  } catch (error) {
    return 'en'
  }
}

function nodeText(node) {
  if (!node || typeof node !== 'object') return ''
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.content)) return node.content.map(nodeText).join(' ')
  return ''
}

/** The first line of content, used as a tab label while the page has no title. */
function firstLine(page) {
  const content = page.doc && Array.isArray(page.doc.content) ? page.doc.content : []
  for (const node of content) {
    const text = nodeText(node).replace(/\s+/g, ' ').trim()
    if (text) return text.slice(0, 40)
  }
  return ''
}

function pageLabel(page, tr) {
  const title = typeof page.title === 'string' ? page.title.trim() : ''
  if (title) return title
  return firstLine(page) || tr('page.untitled')
}

function formatTime(value, localeId, tr) {
  const stamp = Number(value) || 0
  const diff = Math.max(0, Date.now() - stamp)
  if (diff < 60e3) return tr('time.now')
  if (diff < 3600e3) return tr('time.minutes', { count: String(Math.floor(diff / 60e3)) })
  if (diff < 6 * 3600e3) return tr('time.hours', { count: String(Math.floor(diff / 3600e3)) })
  try {
    return new Intl.DateTimeFormat(localeId || 'en', { month: 'short', day: 'numeric' }).format(new Date(stamp))
  } catch (error) {
    return new Date(stamp).toLocaleDateString()
  }
}

/** The button's viewport rect: the panel is placed around it. */
function buttonRect(position, view) {
  const edge = view.w <= 560 ? 12 : 22
  if (position) {
    return {
      left: position.left,
      top: position.top,
      right: position.left + BUTTON_SIZE,
      bottom: position.top + BUTTON_SIZE,
    }
  }
  return {
    left: view.w - edge - BUTTON_SIZE,
    top: view.h - edge - BUTTON_SIZE,
    right: view.w - edge,
    bottom: view.h - edge,
  }
}

/**
 * Panel box for the current button position.
 *
 * The panel opens toward the side with more room (above/below, left/right) and
 * is then shrunk to whatever space that side actually has, so it never reaches
 * back over the button and never spills far off screen. The preferred size is
 * not overwritten: it is only the upper bound for the displayed box.
 *
 * `freeX`/`freeY` are the edges away from the button; only those resize.
 */
function computeBox(anchor, view, size) {
  const gap = 12
  const roomAbove = anchor.top - gap - EDGE_MARGIN
  const roomBelow = view.h - anchor.bottom - gap - EDGE_MARGIN
  const roomLeft = anchor.right - EDGE_MARGIN
  const roomRight = view.w - anchor.left - EDGE_MARGIN

  const goAbove = roomAbove >= roomBelow
  const goRight = roomRight >= roomLeft

  const height = Math.min(size.height, Math.max(1, goAbove ? roomAbove : roomBelow))
  const width = Math.min(size.width, Math.max(1, goRight ? roomRight : roomLeft))

  return {
    left: goRight ? anchor.left : anchor.right - width,
    top: goAbove ? anchor.top - gap - height : anchor.bottom + gap,
    width,
    height,
    freeX: goRight ? 'e' : 'w',
    freeY: goAbove ? 'n' : 's',
  }
}

function resizeBox(box, edge, dx, dy, view) {
  let { left, top, width, height } = box
  if (edge.indexOf('e') !== -1) width += dx
  if (edge.indexOf('w') !== -1) {
    left += dx
    width -= dx
  }
  if (edge.indexOf('s') !== -1) height += dy
  if (edge.indexOf('n') !== -1) {
    top += dy
    height -= dy
  }

  if (width < MIN_WIDTH) {
    if (edge.indexOf('w') !== -1) left -= MIN_WIDTH - width
    width = MIN_WIDTH
  }
  if (height < MIN_HEIGHT) {
    if (edge.indexOf('n') !== -1) top -= MIN_HEIGHT - height
    height = MIN_HEIGHT
  }

  if (left < EDGE_MARGIN) {
    width += left - EDGE_MARGIN
    left = EDGE_MARGIN
  }
  if (top < EDGE_MARGIN) {
    height += top - EDGE_MARGIN
    top = EDGE_MARGIN
  }
  if (left + width > view.w - EDGE_MARGIN) width = view.w - EDGE_MARGIN - left
  if (top + height > view.h - EDGE_MARGIN) height = view.h - EDGE_MARGIN - top

  return {
    left,
    top,
    width: Math.max(MIN_WIDTH, width),
    height: Math.max(MIN_HEIGHT, height),
  }
}



function matchesQuery(item, query, tr) {
  const needle = query.toLowerCase()
  if (!needle) return true
  return tr(item.key).toLowerCase().includes(needle) || item.type.includes(needle)
}

function slashItemsFor(query, tr) {
  return SLASH_ITEMS
    .filter((item) => matchesQuery(item, query, tr))
    .map((item) => ({ type: item.type, mark: item.mark, label: tr(item.key) }))
}

/* -------------------------------------------------------------------- icons */

function Glyph(props) {
  return h('svg', {
    viewBox: '0 0 24 24',
    width: props.size || 16,
    height: props.size || 16,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    style: { display: 'block' },
  }, props.children)
}

function NoteGlyph(props) {
  return h(Glyph, props,
    h('rect', { x: 4.5, y: 3.5, width: 15, height: 17, rx: 3 }),
    h('path', { d: 'M8.5 8.5h7' }),
    h('path', { d: 'M8.5 12h7' }),
    h('path', { d: 'M9 15.6l1.9 1.9 3.3-3.6' }),
  )
}

function CloseGlyph(props) {
  return h(Glyph, props, h('path', { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }))
}

function CheckGlyph(props) {
  return h(Glyph, props, h('path', { d: 'M5 12.6l4.2 4.2L19 7.2' }))
}

function LockGlyph(props) {
  return h(Glyph, props,
    h('rect', { x: 5, y: 11, width: 14, height: 9, rx: 2 }),
    h('path', { d: 'M8.5 11V7.8a3.5 3.5 0 017 0V11' }),
  )
}

function PlusGlyph(props) {
  return h(Glyph, props, h('path', { d: 'M12 5.5v13M5.5 12h13' }))
}

/* -------------------------------------------------------------- slash menu */

function SlashMenu(props) {
  const { tr, items, index, left, top, onPick, onHover } = props
  return h('div', {
    className: 'fn-slash-menu',
    role: 'listbox',
    'aria-label': tr('slash.hint'),
    style: { left: left + 'px', top: top + 'px' },
  },
  items.length
    ? items.map((item, itemIndex) => h('button', {
      key: item.type,
      type: 'button',
      role: 'option',
      'aria-selected': itemIndex === index,
      className: 'fn-slash-item',
      onMouseDown: (event) => event.preventDefault(),
      onMouseEnter: () => onHover(itemIndex),
      onClick: () => onPick(item.type),
    },
    h('span', { className: 'fn-slash-mark', 'aria-hidden': true }, item.mark),
    h('span', null, item.label),
    ))
    : h('div', { className: 'fn-slash-empty' }, tr('slash.empty')),
  )
}

/* --------------------------------------------------------------------- tabs */

/**
 * One tab per page, ordered by creation so tabs never jump while typing.
 * Closing a tab asks once inside the tab itself.
 */
function Tabs(props) {
  const React = getReact()
  const { tr, pages, activeId, localeId, locked, onOpen, onCreate, onDelete, onClose, onToggleLock } = props
  const [confirmId, setConfirmId] = React.useState(null)
  const activeRef = React.useRef(null)

  React.useEffect(() => {
    const element = activeRef.current
    if (element && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [activeId])

  const ordered = pages.slice().sort((left, right) => left.createdAt - right.createdAt)

  const tab = (page) => {
    if (confirmId === page.id) {
      return h('div', { key: page.id, className: 'fn-tab fn-tab-confirming' },
        h('span', { className: 'fn-tab-hint' }, tr('pages.confirm.short')),
        h('button', {
          type: 'button',
          className: 'fn-tab-btn fn-tab-danger',
          'aria-label': tr('pages.confirm.yes'),
          title: tr('pages.confirm.yes'),
          onClick: () => {
            setConfirmId(null)
            onDelete(page.id)
          },
        }, h(CheckGlyph, { size: 11 })),
        h('button', {
          type: 'button',
          className: 'fn-tab-btn',
          'aria-label': tr('pages.confirm.no'),
          title: tr('pages.confirm.no'),
          onClick: () => setConfirmId(null),
        }, h(CloseGlyph, { size: 10 })),
      )
    }

    const active = page.id === activeId
    return h('div', {
      key: page.id,
      ref: active ? activeRef : undefined,
      role: 'tab',
      tabIndex: active ? 0 : -1,
      'aria-selected': active,
      className: 'fn-tab' + (active ? ' fn-tab-active' : ''),
      title: pageLabel(page, tr) + ' · ' + formatTime(page.updatedAt, localeId, tr),
      onClick: () => onOpen(page.id),
      onKeyDown: (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen(page.id)
      },
    },
    h('span', { className: 'fn-tab-title' }, pageLabel(page, tr)),
    h('button', {
      type: 'button',
      className: 'fn-tab-close',
      'aria-label': tr('pages.delete'),
      title: tr('pages.delete'),
      onClick: (event) => {
        event.stopPropagation()
        setConfirmId(page.id)
      },
    }, h(CloseGlyph, { size: 10 })),
    )
  }

  return h('div', { className: 'fn-tabs' },
    h('div', { className: 'fn-tabs-scroll', role: 'tablist', 'aria-label': tr('pages.title') },
      ordered.map(tab),
    ),
    h('button', {
      type: 'button',
      className: 'fn-icon-btn fn-lock',
      'aria-pressed': locked,
      'aria-label': locked ? tr('panel.unlock') : tr('panel.lock'),
      title: locked ? tr('panel.unlock') : tr('panel.lock'),
      onClick: onToggleLock,
    }, h(LockGlyph, { size: 14 })),
    h('button', {
      type: 'button',
      className: 'fn-tab-new',
      'aria-label': tr('pages.new'),
      title: tr('pages.new'),
      onClick: onCreate,
    }, h(PlusGlyph, { size: 13 })),
    h('button', {
      type: 'button',
      className: 'fn-icon-btn',
      'aria-label': tr('panel.close'),
      title: tr('panel.close'),
      onClick: onClose,
    }, h(CloseGlyph, { size: 14 })),
  )
}

/* ---------------------------------------------------------------- page body */

/**
 * The body for one page: title, ProseMirror host, footer and the slash palette.
 * The editor is recreated whenever the active page changes, so undo history
 * never leaks between pages.
 */
function PageBody(props) {
  const React = getReact()
  const { tr, page, saveProblem, showHint, focusTitle, onPatch } = props
  const latest = React.useRef(props)
  const hostRef = React.useRef(null)
  const titleRef = React.useRef(null)
  const editorRef = React.useRef(null)
  const slashRef = React.useRef(null)
  const [slash, setSlash] = React.useState(null)
  const revision = useLocaleRevision(props.localeFace)

  React.useEffect(() => {
    latest.current = props
  }, [props])

  const publishSlash = React.useCallback((next) => {
    slashRef.current = next
    setSlash(next)
  }, [])

  const applySlash = React.useCallback((type) => {
    const editor = editorRef.current
    const current = slashRef.current
    if (!editor || !current) return
    const chain = editor.chain().focus().deleteRange({ from: current.from, to: current.to })
    switch (type) {
      case 'heading1': chain.setHeading({ level: 1 }); break
      case 'heading2': chain.setHeading({ level: 2 }); break
      case 'heading3': chain.setHeading({ level: 3 }); break
      case 'bulleted': chain.toggleBulletList(); break
      case 'numbered': chain.toggleOrderedList(); break
      case 'todo': chain.toggleTaskList(); break
      case 'quote': chain.toggleBlockquote(); break
      case 'divider': chain.setHorizontalRule(); break
      default: chain.setParagraph()
    }
    chain.run()
    publishSlash(null)
  }, [publishSlash])

  const refreshSlash = React.useCallback((editor) => {
    const next = readSlash(editor)
    const current = slashRef.current
    if (!next) {
      if (current) publishSlash(null)
      return
    }
    if (current
      && current.query === next.query
      && current.from === next.from
      && current.to === next.to) return
    publishSlash({
      query: next.query,
      index: current ? current.index : 0,
      from: next.from,
      to: next.to,
      left: next.left,
      top: next.top,
    })
  }, [publishSlash])

  const handleEditorKeyDown = React.useCallback((event, view) => {
    const current = slashRef.current
    if (current) {
      const list = slashItemsFor(current.query, latest.current.tr)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (list.length === 0) return false
        const delta = event.key === 'ArrowDown' ? 1 : -1
        const index = (Math.min(current.index, list.length - 1) + delta + list.length) % list.length
        publishSlash({ ...current, index })
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = list[Math.min(current.index, Math.max(0, list.length - 1))]
        if (item) applySlash(item.type)
        else publishSlash(null)
        return true
      }
      if (event.key === 'Escape') {
        publishSlash(null)
        return true
      }
    }

    if (event.nativeEvent && event.nativeEvent.isComposing) return false

    // An empty to-do line leaves the list on Enter or Backspace, wherever it is:
    // ProseMirror only does that for the last item, which made to-dos feel stuck.
    if ((event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete')
      && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      if (exitEmptyItem(view)) return true
      // The blank line a list exit leaves behind must not be pulled back in.
      if (event.key === 'Backspace' && mergeBlankParagraphBeforeList(view)) return true
    }
    return false
  }, [applySlash, publishSlash])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    publishSlash(null)
    const options = {
      element: host,
      content: latest.current.page.doc,
      ariaLabel: latest.current.tr('panel.title'),
      placeholder: () => latest.current.tr('editor.placeholder'),
      onUpdate: (instance) => {
        latest.current.onPatch({ doc: instance.getJSON() })
        refreshSlash(instance)
      },
      onSelection: (instance) => refreshSlash(instance),
      onKeyDown: handleEditorKeyDown,
    }
    let editor
    try {
      editor = createEditor(options)
    } catch (error) {
      // Malformed stored content must not blank the whole panel: report it and
      // mount an empty page instead.
      try {
        host.replaceChildren()
      } catch (cleanupError) {
        /* the host may already be gone */
      }
      if (latest.current.onProblem) latest.current.onProblem()
      editor = createEditor({ ...options, content: emptyDoc() })
    }
    editorRef.current = editor
    if (latest.current.focusTitle && titleRef.current) {
      titleRef.current.focus()
    } else {
      editor.commands.focus('end')
    }
    return () => {
      editorRef.current = null
      editor.destroy()
    }
  }, [page.id, focusTitle, handleEditorKeyDown, publishSlash, refreshSlash])

  // A locale switch changes the placeholder text; one empty transaction makes
  // the placeholder plugin recompute its decoration.
  const firstRevision = React.useRef(revision)
  React.useEffect(() => {
    if (revision === firstRevision.current) return
    const editor = editorRef.current
    if (editor) editor.view.dispatch(editor.state.tr)
  }, [revision])

  const items = slash ? slashItemsFor(slash.query, tr) : []
  const activeIndex = slash ? Math.min(slash.index, Math.max(0, items.length - 1)) : 0
  const todos = todosOf(page.doc)
  const empty = isEmptyPage(page)

  const menuLeft = slash ? Math.max(8, Math.min(slash.left, window.innerWidth - 236)) : 0
  const menuTop = slash ? Math.max(8, Math.min(slash.top + 6, window.innerHeight - 286)) : 0

  return h(React.Fragment, null,
    h('div', { className: 'fn-page' },
      h('input', {
        ref: titleRef,
        className: 'fn-title',
        type: 'text',
        value: page.title,
        placeholder: tr('title.placeholder'),
        maxLength: 200,
        'aria-label': tr('title.placeholder'),
        onChange: (event) => latest.current.onPatch({ title: event.target.value }),
        onKeyDown: (event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          const editor = editorRef.current
          if (editor) editor.commands.focus('start')
        },
      }),
      h('div', { className: 'fn-editor', ref: hostRef }),
      h('div', {
        className: 'fn-filler',
        onClick: () => {
          const editor = editorRef.current
          if (editor) editor.commands.focus('end')
        },
      }),
    ),
    h('div', { className: 'fn-foot' },
      h('span', null, empty ? tr('status.empty') : tr('status.todos', { count: String(todos.open) })),
      saveProblem
        ? h('span', {
          className: 'fn-foot-error',
          role: 'status',
          title: tr('status.failed.' + saveProblem),
        }, tr('status.failed'))
        : showHint
          ? h('span', { className: 'fn-foot-hint' }, tr('status.localOnly'))
          : null,
    ),
    slash
      ? h(SlashMenu, {
        tr,
        items,
        index: activeIndex,
        left: menuLeft,
        top: menuTop,
        onPick: applySlash,
        onHover: (index) => publishSlash({ ...slash, index }),
      })
      : null,
  )
}

/* -------------------------------------------------------------------- root */

/**
 * The corner button and the tabbed pad.
 * @param props - `translate` (bound namespace translator) and `localeFace`.
 */
export function FloatingNotes(props) {
  const React = getReact()
  const tr = typeof props.translate === 'function' ? props.translate : (key) => key
  useLocaleRevision(props.localeFace)

  const [state, setState] = React.useState(loadState)
  const [open, setOpen] = React.useState(false)
  const [epoch, setEpoch] = React.useState(0)
  const [saveProblem, setSaveProblem] = React.useState(null)
  const [hintVisible, setHintVisible] = React.useState(false)
  const [focusTitle, setFocusTitle] = React.useState(false)
  const [noticeKey, setNoticeKey] = React.useState(null)
  const [locked, setLocked] = React.useState(false)
  const [anchorState, setAnchorState] = React.useState(loadAnchor)
  const [dragPosition, setDragPosition] = React.useState(null)
  const [size, setSize] = React.useState(loadSize)
  const [box, setBox] = React.useState(null)
  const [dragging, setDragging] = React.useState(false)
  const [viewport, setViewport] = React.useState(readViewport)
  const rootRef = React.useRef(null)
  const timerRef = React.useRef(null)
  const dirtyRef = React.useRef(false)
  const anchorRef = React.useRef(anchorState)
  const dragPositionRef = React.useRef(null)
  const sizeRef = React.useRef(size)
  const boxRef = React.useRef(null)
  const dragRef = React.useRef(null)
  const resizeRef = React.useRef(null)
  const suppressClickUntilRef = React.useRef(0)

  const active = state.pages.find((page) => page.id === state.activeId) || state.pages[0]

  React.useEffect(() => {
    if (state.recovered) setNoticeKey('notice.recovered')
  }, [state.recovered])

  // The lock belongs to one open/close cycle: a closed panel opens unlocked.
  React.useEffect(() => {
    if (!open) setLocked(false)
  }, [open])

  // One-time reassurance that the pad is local; never shown again afterwards.
  React.useEffect(() => {
    if (!open || hintShownThisPage) return undefined
    hintShownThisPage = true
    let seen = true
    try {
      seen = window.localStorage.getItem(HINT_KEY) === '1'
    } catch (error) {
      seen = false
    }
    if (seen) return undefined
    try {
      window.localStorage.setItem(HINT_KEY, '1')
    } catch (error) {
      /* the hint still shows for this page */
    }
    setHintVisible(true)
    const timer = window.setTimeout(() => setHintVisible(false), 6000)
    return () => window.clearTimeout(timer)
  }, [open])

  const patchPage = React.useCallback((patch) => {
    dirtyRef.current = true
    setState((previous) => ({
      ...previous,
      pages: previous.pages.map((page) => (
        page.id === previous.activeId
          ? { ...page, ...patch, updatedAt: Date.now() }
          : page
      )),
    }))
  }, [])

  const createPage = () => {
    const page = newPage()
    dirtyRef.current = true
    setState((previous) => ({
      activeId: page.id,
      pages: previous.pages.concat(page).slice(-MAX_PAGES),
      deleted: previous.deleted || {},
    }))
    setFocusTitle(true)
  }

  const openPage = (id) => {
    if (id === state.activeId) return
    setState((previous) => ({ ...previous, activeId: id }))
    setFocusTitle(false)
  }

  const deletePage = (id) => {
    const remaining = state.pages.filter((page) => page.id !== id)
    const pages = remaining.length ? remaining : [newPage()]
    const activeId = pages.some((page) => page.id === state.activeId)
      ? state.activeId
      : pages.slice().sort((left, right) => right.updatedAt - left.updatedAt)[0].id
    dirtyRef.current = true
    setState({
      activeId,
      pages,
      deleted: { ...(state.deleted || {}), [id]: Date.now() },
    })
    setFocusTitle(false)
  }

  const setDragSafe = React.useCallback((next) => {
    dragPositionRef.current = next
    setDragPosition(next)
  }, [])

  React.useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch (error) {
      /* capture is best effort */
    }
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    if (!drag.moved) {
      drag.moved = true
      setDragging(true)
      document.documentElement.style.userSelect = 'none'
    }
    setDragSafe(clampPosition(drag.originLeft + dx, drag.originTop + dy, readViewport()))
  }

  const finishDrag = (event) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    setDragging(false)
    document.documentElement.style.userSelect = ''
    try {
      event.currentTarget.releasePointerCapture(drag.pointerId)
    } catch (error) {
      /* already released */
    }
    if (drag.moved) {
      suppressClickUntilRef.current = Date.now() + 300
      const view = readViewport()
      const landed = dragPositionRef.current || { left: drag.originLeft, top: drag.originTop }
      const next = anchorFromPosition(clampPosition(landed.left, landed.top, view), view)
      anchorRef.current = next
      setAnchorState(next)
      saveAnchor(next)
      dragPositionRef.current = null
      setDragPosition(null)
    }
  }

  // Merge with what another tab may have written, then persist.
  const writeState = React.useCallback((snapshot) => (
    persistPage(mergeCollections(snapshot, readStored()))
  ), [])

  const stateRef = React.useRef(state)
  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  const setSizeSafe = React.useCallback((next) => {
    sizeRef.current = next
    setSize(next)
  }, [])

  const setBoxSafe = React.useCallback((next) => {
    boxRef.current = next
    setBox(next)
  }, [])

  // The panel box is derived from the button and the remembered size whenever it
  // opens, the button moves or the viewport changes; resizing then edits the box
  // directly, so every edge can move without snapping back.
  React.useEffect(() => {
    if (!open) {
      setBoxSafe(null)
      return
    }
    const view = readViewport()
    const stored = sizeRef.current
    const base = stored
      ? clampSize(stored.width, stored.height, view)
      : {
        width: Math.min(460, view.w - 32),
        height: Math.min(Math.round(view.h * 0.74), 620),
      }
    const button = dragPositionRef.current || positionFromAnchor(anchorRef.current, view)
    setBoxSafe(computeBox(buttonRect(button, view), view, base))
  }, [open, anchorState, dragPosition, viewport, setBoxSafe])

  const handleResizeDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (!boxRef.current) return
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...boxRef.current },
      edge: event.currentTarget.getAttribute('data-edge') || 'se',
    }
    event.preventDefault()
    event.stopPropagation()
    document.documentElement.style.userSelect = 'none'
    document.documentElement.style.cursor = event.currentTarget.style.cursor || ''
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch (error) {
      /* capture is best effort */
    }
  }

  const handleResizeMove = (event) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const next = resizeBox(
      resize.box,
      resize.edge,
      event.clientX - resize.startX,
      event.clientY - resize.startY,
      readViewport(),
    )
    setBoxSafe({ ...next, freeX: resize.box.freeX, freeY: resize.box.freeY })
  }

  const handleResizeUp = (event) => {
    const resize = resizeRef.current
    if (!resize) return
    resizeRef.current = null
    document.documentElement.style.userSelect = ''
    document.documentElement.style.cursor = ''
    try {
      event.currentTarget.releasePointerCapture(resize.pointerId)
    } catch (error) {
      /* already released */
    }
    const current = boxRef.current
    if (!current) return
    const next = { width: current.width, height: current.height }
    setSizeSafe(next)
    saveSize(next)
  }

  React.useEffect(() => {
    if (!dirtyRef.current) return undefined
    const snapshot = state
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      const result = writeState(snapshot)
      setSaveProblem(result.ok ? null : result.reason)
    }, SAVE_DELAY)
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [state, writeState])

  // A tab closed inside the debounce window still keeps its last keystroke.
  React.useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      writeState(stateRef.current)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [writeState])

  React.useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setOpen(false)
    }
    const onPointerDown = (event) => {
      if (locked) return
      const root = rootRef.current
      if (root && !root.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, locked])

  React.useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== STORAGE_KEY) return
      dirtyRef.current = false
      setState(loadState())
      setEpoch((value) => value + 1)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const openTodos = countOpenTodos(state.pages)

  const buttonPosition = dragPosition || positionFromAnchor(anchorState, viewport)
  const rootStyle = buttonPosition
    ? { left: buttonPosition.left + 'px', top: buttonPosition.top + 'px', right: 'auto', bottom: 'auto' }
    : undefined

  const anchorRect = buttonRect(buttonPosition, viewport)
  const panelStyle = box
    ? {
      left: (box.left - anchorRect.left) + 'px',
      top: (box.top - anchorRect.top) + 'px',
      width: box.width + 'px',
      height: box.height + 'px',
      right: 'auto',
      bottom: 'auto',
    }
    : undefined

  return h('div', { className: 'fn-root', ref: rootRef, style: rootStyle },
    h('style', { key: 'styles' }, CSS),
    open && box
      ? h('div', {
        key: 'panel-' + epoch,
        id: PANEL_ID,
        className: 'fn-panel',
        role: 'dialog',
        'aria-label': tr('panel.title'),
        style: panelStyle,
      },
      noticeKey
        ? h('div', { className: 'fn-notice', role: 'status' },
          h('span', null, tr(noticeKey)),
          h('button', {
            type: 'button',
            className: 'fn-notice-close',
            'aria-label': tr('notice.dismiss'),
            title: tr('notice.dismiss'),
            onClick: () => setNoticeKey(null),
          }, h(CloseGlyph, { size: 12 })),
        )
        : null,
      h(Tabs, {
        tr,
        pages: state.pages,
        activeId: state.activeId,
        localeId: activeLocale(props.localeFace),
        locked,
        onOpen: openPage,
        onCreate: createPage,
        onDelete: deletePage,
        onClose: () => setOpen(false),
        onToggleLock: () => setLocked((value) => !value),
      }),
      h(PageBody, {
        key: 'page-' + active.id,
        page: active,
        tr,
        saveProblem,
        showHint: hintVisible,
        focusTitle,
        localeFace: props.localeFace,
        onPatch: patchPage,
        onProblem: () => setNoticeKey('notice.editor'),
      }),
      [
        [box.freeY, 'ns-resize'],
        [box.freeX, 'ew-resize'],
      ].map(([edge, cursor]) => h('div', {
        key: edge,
        className: 'fn-resize fn-resize-' + edge,
        'data-edge': edge,
        'aria-hidden': true,
        style: { cursor },
        onPointerDown: handleResizeDown,
        onPointerMove: handleResizeMove,
        onPointerUp: handleResizeUp,
        onPointerCancel: handleResizeUp,
      })),
      h('div', {
        key: 'corner',
        className: 'fn-resize fn-resize-corner fn-resize-' + box.freeY + box.freeX,
        'data-edge': box.freeY + box.freeX,
        'aria-hidden': true,
        style: {
          cursor: ((box.freeY === 'n') === (box.freeX === 'w')) ? 'nwse-resize' : 'nesw-resize',
        },
        onPointerDown: handleResizeDown,
        onPointerMove: handleResizeMove,
        onPointerUp: handleResizeUp,
        onPointerCancel: handleResizeUp,
      }),
      )
      : null,
    h('button', {
      type: 'button',
      className: 'fn-fab' + (dragging ? ' fn-fab-dragging' : ''),
      'aria-label': open ? tr('fab.close') : tr('fab.open'),
      'aria-expanded': open,
      'aria-controls': PANEL_ID,
      title: (open ? tr('fab.close') : tr('fab.label')) + ' · ' + tr('fab.drag'),
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onClick: () => {
        if (Date.now() < suppressClickUntilRef.current) return
        if (open) {
          setOpen(false)
          return
        }
        setFocusTitle(false)
        setOpen(true)
      },
    },
    h(NoteGlyph, { size: 22 }),
    openTodos
      ? h('span', { className: 'fn-badge', 'aria-hidden': true }, openTodos > 99 ? '99+' : String(openTodos))
      : null,
    ),
  )
}
