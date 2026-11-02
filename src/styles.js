/**
 * Every color comes from the Host's `--dsw-alias-*` theme tokens, so the page
 * follows light/dark and any future token change. Only artwork (glyphs, the
 * brand-filled button, shadow alpha) keeps literal values.
 */
export const CSS = `
.fn-root{position:fixed;right:22px;bottom:22px;display:flex;flex-direction:column;align-items:flex-end;font-family:inherit;color:var(--dsw-alias-label-primary);pointer-events:none}
.fn-root *{box-sizing:border-box}

.fn-fab{pointer-events:auto;position:relative;display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;padding:0;border:none;border-radius:999px;cursor:pointer;color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-brand-primary);box-shadow:0 10px 26px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08);transition:transform .16s ease,box-shadow .16s ease}
.fn-fab:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(0,0,0,.22),0 2px 8px rgba(0,0,0,.1)}
.fn-fab:active{transform:translateY(0);box-shadow:0 8px 20px rgba(0,0,0,.18)}
.fn-fab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}
.fn-fab{touch-action:none;user-select:none;-webkit-user-select:none}
.fn-fab-dragging{transition:none;cursor:grabbing;transform:none!important;box-shadow:0 12px 30px rgba(0,0,0,.24)}
.fn-badge{position:absolute;top:-3px;right:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);font-size:11px;line-height:17px;font-weight:600;text-align:center;font-variant-numeric:tabular-nums;box-shadow:0 1px 3px rgba(0,0,0,.08)}

.fn-panel{pointer-events:auto;position:absolute;right:0;bottom:76px;width:min(460px,calc(100vw - 32px));height:min(74vh,620px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:18px;box-shadow:0 24px 64px rgba(0,0,0,.16),0 4px 14px rgba(0,0,0,.06);animation:fn-in .18s cubic-bezier(.2,.8,.2,1)}

.fn-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .12s ease,color .12s ease}
.fn-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fn-icon-btn[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fn-icon-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}

.fn-page{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:22px 24px 24px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}
.fn-title{display:block;width:100%;margin:0 0 6px;padding:0;border:none;background:transparent;outline:none;font-family:inherit;font-size:20px;font-weight:650;line-height:1.4;letter-spacing:-.012em;color:var(--dsw-alias-label-primary);caret-color:var(--dsw-alias-brand-primary)}
.fn-title::placeholder{color:var(--dsw-alias-label-secondary);opacity:.5}
.fn-title:focus-visible{outline:none}

.fn-editor{position:relative;min-height:120px}
.fn-prose{outline:none;min-height:120px;font-size:14.5px;line-height:1.62;color:var(--dsw-alias-label-primary);caret-color:var(--dsw-alias-brand-primary);white-space:pre-wrap;word-break:break-word}
.fn-prose p{margin:0;min-height:24px}
.fn-prose h1,.fn-prose h2,.fn-prose h3{margin:14px 0 2px;line-height:1.4;letter-spacing:-.01em;font-weight:650}
.fn-prose h1{font-size:20px}
.fn-prose h2{font-size:17px;font-weight:600}
.fn-prose h3{font-size:15px;font-weight:600}
.fn-prose h1:first-child,.fn-prose h2:first-child,.fn-prose h3:first-child{margin-top:0}
.fn-prose strong{font-weight:650}
.fn-prose ul:not([data-type="taskList"]),.fn-prose ol{margin:2px 0;padding-left:24px}
.fn-prose ul:not([data-type="taskList"]){list-style:disc}
.fn-prose ol{list-style:decimal}
.fn-prose li > p{margin:0;min-height:24px}
.fn-prose li::marker{color:var(--dsw-alias-label-secondary)}
.fn-prose blockquote{margin:6px 0;padding-left:12px;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.fn-prose hr{margin:14px 0;border:none;border-top:1px solid var(--dsw-alias-border-l1)}
.fn-prose code{padding:1px 4px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;background:var(--dsw-alias-bg-layer-2);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}
.fn-prose p.is-editor-empty:first-child::before{content:attr(data-placeholder);float:left;height:0;pointer-events:none;color:var(--dsw-alias-label-secondary);opacity:.55}

.fn-prose ul[data-type="taskList"]{list-style:none;margin:2px 0;padding-left:0}
.fn-prose ul[data-type="taskList"] li{display:flex;align-items:flex-start;gap:8px}
.fn-prose ul[data-type="taskList"] li > label{flex:none;position:relative;display:inline-flex;width:16px;height:16px;margin-top:4px;align-items:center;justify-content:center}
.fn-prose ul[data-type="taskList"] li > label span{display:none}
.fn-prose ul[data-type="taskList"] li > label input{appearance:none;-webkit-appearance:none;position:relative;width:15px;height:15px;margin:0;border:1.5px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;cursor:pointer;transition:background .12s ease,border-color .12s ease}
.fn-prose ul[data-type="taskList"] li > label input:hover{border-color:var(--dsw-alias-label-secondary)}
.fn-prose ul[data-type="taskList"] li > label input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.fn-prose ul[data-type="taskList"] li[data-checked="true"] > label input{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.fn-prose ul[data-type="taskList"] li[data-checked="true"] > label::after{content:"";position:absolute;left:5px;top:3px;width:4px;height:8px;border-right:1.5px solid var(--dsw-alias-label-primary-foreground);border-bottom:1.5px solid var(--dsw-alias-label-primary-foreground);transform:rotate(45deg);pointer-events:none}
.fn-prose ul[data-type="taskList"] li > div{flex:1;min-width:0}
.fn-prose ul[data-type="taskList"] li[data-checked="true"] > div{color:var(--dsw-alias-label-secondary);text-decoration:line-through;text-decoration-color:var(--dsw-alias-border-l2)}

.fn-filler{min-height:56px;cursor:text}

.fn-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none;padding:9px 24px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.fn-foot-error{color:var(--dsw-alias-state-error-primary);cursor:help}
.fn-foot-hint{opacity:.85}

.fn-slash-menu{position:fixed;z-index:5;width:220px;max-height:252px;overflow-y:auto;padding:5px;pointer-events:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.16),0 2px 8px rgba(0,0,0,.06);scrollbar-width:thin}
.fn-slash-item{display:flex;align-items:center;gap:10px;width:100%;padding:6px 9px;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:18px;text-align:left;cursor:pointer}
.fn-slash-item:hover,.fn-slash-item[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.fn-slash-mark{flex:none;width:20px;color:var(--dsw-alias-label-secondary);font-size:11px;font-variant-numeric:tabular-nums;text-align:center}
.fn-slash-empty{padding:8px 9px;color:var(--dsw-alias-label-secondary);font-size:12px}

.fn-tabs{display:flex;align-items:center;gap:6px;flex:none;padding:8px 8px 8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.fn-tabs-scroll{display:flex;align-items:center;gap:4px;flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.fn-tabs-scroll::-webkit-scrollbar{display:none}
.fn-tab{display:flex;align-items:center;gap:2px;flex:none;max-width:180px;padding:4px 3px 4px 9px;border-radius:8px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none;transition:background .12s ease,color .12s ease}
.fn-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fn-tab-active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fn-tab:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.fn-tab-title{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12.5px;line-height:18px}
.fn-tab-close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;padding:0;border:none;border-radius:5px;background:transparent;color:inherit;opacity:0;cursor:pointer}
.fn-tab:hover .fn-tab-close,.fn-tab-active .fn-tab-close,.fn-tab-close:focus-visible{opacity:.7}
.fn-tab-close:hover{opacity:1;background:var(--dsw-alias-bg-layer-2)}
.fn-tab-new{display:inline-flex;align-items:center;justify-content:center;flex:none;width:26px;height:26px;padding:0;border:none;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.fn-tab-new:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.fn-tab-new:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.fn-tab-confirming{display:flex;align-items:center;gap:2px;flex:none;padding:3px 4px 3px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover)}
.fn-tab-hint{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.fn-tab-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.fn-tab-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.fn-tab-danger:hover{color:var(--dsw-alias-state-error-primary)}
@media (hover:none){.fn-tab-close{opacity:.7}.fn-tab-active .fn-tab-close{opacity:1}}

.fn-notice{display:flex;align-items:center;gap:8px;flex:none;padding:6px 8px 6px 12px;background:var(--dsw-alias-interactive-bg-hover);border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:16px}
.fn-notice span{flex:1;min-width:0}
.fn-notice-close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:20px;height:20px;padding:0;border:none;border-radius:5px;background:transparent;color:inherit;cursor:pointer}
.fn-notice-close:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}

.fn-resize{position:absolute;z-index:3;touch-action:none}
.fn-resize-n{top:-4px;left:16px;right:16px;height:10px}
.fn-resize-s{bottom:-4px;left:16px;right:16px;height:10px}
.fn-resize-e{right:-4px;top:16px;bottom:16px;width:10px}
.fn-resize-w{left:-4px;top:16px;bottom:16px;width:10px}
.fn-resize-corner{z-index:4;width:18px;height:18px}
.fn-resize-nw{top:-4px;left:-4px}
.fn-resize-ne{top:-4px;right:-4px}
.fn-resize-sw{bottom:-4px;left:-4px}
.fn-resize-se{bottom:-4px;right:-4px}

@keyframes fn-in{from{opacity:0;transform:translateY(6px) scale(.995)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.fn-panel{animation:none}.fn-fab{transition:none}}
@media (max-width:560px){.fn-root{right:12px;bottom:12px}}
`
