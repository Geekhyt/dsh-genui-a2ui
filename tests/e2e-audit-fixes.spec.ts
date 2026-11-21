import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement, type ReactElement, type ReactNode, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  if (typeof globalThis.HTMLElement === 'undefined') {
    ;(globalThis as Record<string, unknown>).HTMLElement = class {}
  }
  if (typeof globalThis.customElements === 'undefined') {
    const reg = new Map<string, unknown>()
    ;(globalThis as Record<string, unknown>).customElements = {
      get: (name: string) => reg.get(name),
      define: (name: string, ctor: unknown) => reg.set(name, ctor),
    }
  }
})

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: undefined,
  Checkbox: undefined,
  Input: undefined,
  Pill: undefined,
  SegmentedTabs: undefined,
  Tag: undefined,
  Modal: ({ open, title, children }: { open: boolean; title: string; children?: ReactNode }) =>
    open ? createElement('div', { role: 'dialog', 'data-mock-modal': title }, children) : null,
  Menu: undefined,
  Toast: undefined,
  Tooltip: undefined,
  CodeBlock: undefined,
  JsonTree: undefined,
  DisclosureRow: undefined,
  MarkdownText: undefined,
  IconAppsAddOutlineRegular: undefined,
  IconSearchOutlineRegular: undefined,
  IconChevronDownOutlineRegular: undefined,
  IconChevronUpOutlineRegular: undefined,
  IconCheckOutlineRegular: undefined,
  IconWarningOutlineRegular: undefined,
}))

import {
  DshButtonView,
  DshCheckBoxView,
  DshTextFieldView,
} from '../src/client/catalog/InputWidgets.tsx'
import { DshModalView } from '../src/client/catalog/LayoutWidgets.tsx'
import {
  ModalCloseContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
} from '../src/client/catalog/widget-helpers.tsx'
import { createGenerator, SurfaceSessions } from '../src/host/generator.ts'
import {
  A2UI_SYSTEM_GUIDANCE,
  GOLDEN_VALIDATED_FORM_EXAMPLE,
  SKILL_PREAMBLE,
} from '../src/index.ts'

function findElements(
  node: unknown,
  predicate: (el: ReactElement<Record<string, unknown>>) => boolean,
  acc: Array<ReactElement<Record<string, unknown>>> = [],
): Array<ReactElement<Record<string, unknown>>> {
  if (!node || typeof node !== 'object') return acc
  if (Array.isArray(node)) {
    for (const item of node) findElements(item, predicate, acc)
    return acc
  }
  const el = node as ReactElement<Record<string, unknown>>
  if ('type' in el && 'props' in el && el.props && typeof el.props === 'object') {
    if (predicate(el)) acc.push(el)
    if ('children' in el.props) {
      findElements(el.props.children, predicate, acc)
    }
  }
  return acc
}

describe('E2E audit fixes (Items 2–5): Callout/CheckBox layout, Modal & readOnly isolation, deferred validation, and check/Table docs', () => {
  it('Item 2: prevents Callout header overflow and CheckBox flex collapse in Row and Column layouts', () => {
    const cssSource = readFileSync(
      resolve(process.cwd(), 'src/client/catalog/Catalog.module.css'),
      'utf8',
    )

    expect(cssSource).toMatch(/\.callout\s*\{[^}]*flex-shrink:\s*0;[^}]*overflow:\s*hidden;/s)
    expect(cssSource).toMatch(/\.calloutTopRow\s*\{[^}]*min-width:\s*0;/s)
    expect(cssSource).toMatch(/\.calloutTitle\s*\{[^}]*overflow-wrap:\s*anywhere;/s)

    expect(cssSource).toMatch(/\.row\s*\{[^}]*--a2ui-flex-basis:\s*0px;/s)
    expect(cssSource).toMatch(/\.column\s*\{[^}]*--a2ui-flex-basis:\s*auto;/s)

    expect(cssSource).toMatch(/\.checkboxField\s*\{[^}]*align-items:\s*flex-start;/s)
    const html = renderToStaticMarkup(
      createElement(DshCheckBoxView, {
        props: {
          label: '健康检查失败时自动回滚',
          value: true,
          weight: 1,
        },
      }),
    )
    expect(html).toContain('checkboxField')
    expect(html).toContain('min-width:min(100%, 140px)')
  })

  it('Item 3: closes open Modals on action dispatch or readOnly transition, and disables controls on historical snapshots', () => {
    const readOnlyMarkup = renderToStaticMarkup(
      createElement(
        SurfaceReadOnlyContext.Provider,
        { value: true },
        createElement(
          'div',
          null,
          createElement(DshButtonView, {
            props: {
              child: 'lbl',
              variant: 'primary',
              action: async () => {},
            },
            buildChild: () => '确认提交',
          }),
          createElement(DshTextFieldView, {
            props: {
              label: '备注',
              value: '初始值',
              isValid: false,
              validationErrors: ['Required check failed'],
            },
          }),
          createElement(DshCheckBoxView, {
            props: {
              label: '自动回滚',
              value: true,
            },
          }),
          createElement(DshModalView, {
            props: {
              trigger: 'trig',
              content: 'body',
            },
            buildChild: (id) => (id === 'trig' ? '打开弹窗' : '弹窗内容'),
          }),
        ),
      ),
    )

    expect(readOnlyMarkup).toContain('data-readonly="true"')
    expect(readOnlyMarkup).toContain('aria-disabled="true"')
    expect((readOnlyMarkup.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(readOnlyMarkup).not.toContain('Required check failed')
    expect(readOnlyMarkup).not.toContain('data-mock-modal')

    let actionCalls = 0
    let modalClosed = 0

    const renderedWithCloseCtx = renderToStaticMarkup(
      createElement(
        ModalCloseContext.Provider,
        {
          value: () => {
            modalClosed += 1
          },
        },
        createElement(function ActionInModalProbe() {
          const el = DshButtonView({
            props: {
              child: 'lbl',
              variant: 'primary',
              action: async () => {
                actionCalls += 1
              },
            },
            buildChild: () => '确认执行',
          }) as ReactElement<{ onClick?: () => void }>
          el.props.onClick?.()
          return el
        }),
      ),
    )
    expect(renderedWithCloseCtx).toContain('确认执行')
    expect(actionCalls).toBe(1)
    expect(modalClosed).toBe(1)

    let didOpenOnce = false
    function OpenModalProbe({ readOnly }: { readOnly: boolean }) {
      const tree = DshModalView({
        props: { trigger: 't', content: 'c' },
        buildChild: (id) => (id === 't' ? '打开详情' : '确认弹窗正文'),
      })
      if (!didOpenOnce && !readOnly) {
        didOpenOnce = true
        const triggers = findElements(tree, (el) => typeof el.props.onClickCapture === 'function')
        ;(
          triggers[0]?.props.onClickCapture as
            | ((e: { stopPropagation: () => void; preventDefault: () => void }) => void)
            | undefined
        )?.({
          stopPropagation: () => {},
          preventDefault: () => {},
        })
      }
      return tree
    }

    const activeOpenModalHtml = renderToStaticMarkup(
      createElement(
        SurfaceReadOnlyContext.Provider,
        { value: false },
        createElement(OpenModalProbe, { readOnly: false }),
      ),
    )
    expect(activeOpenModalHtml).toContain('data-mock-modal')
    expect(activeOpenModalHtml).toContain('确认弹窗正文')

    let capturedTriggerClick:
      | ((e: { stopPropagation: () => void; preventDefault: () => void }) => void)
      | undefined
    const readOnlyModalHtml = renderToStaticMarkup(
      createElement(
        SurfaceReadOnlyContext.Provider,
        { value: true },
        createElement(function ReadOnlyModalProbe() {
          const tree = DshModalView({
            props: { trigger: 't', content: 'c' },
            buildChild: (id) => id,
          })
          const triggers = findElements(tree, (el) => typeof el.props.onClickCapture === 'function')
          capturedTriggerClick = triggers[0]?.props.onClickCapture as typeof capturedTriggerClick
          return tree
        }),
      ),
    )
    let prevented = false
    capturedTriggerClick?.({
      stopPropagation: () => {},
      preventDefault: () => {
        prevented = true
      },
    })
    expect(prevented).toBe(true)
    expect(readOnlyModalHtml).not.toContain('data-mock-modal')
  })

  it('Item 4: hides initial Required check failed errors until field blur or submit attempt', () => {
    const initialHtml = renderToStaticMarkup(
      createElement(DshTextFieldView, {
        props: {
          label: '服务名称',
          value: '',
          isValid: false,
          validationErrors: ['Required check failed'],
        },
      }),
    )
    expect(initialHtml).toContain('服务名称')
    expect(initialHtml).not.toContain('Required check failed')
    expect(initialHtml).not.toContain('aria-invalid')

    let submitAttemptedFlag = false
    const markSubmitAttempted = () => {
      submitAttemptedFlag = true
    }

    renderToStaticMarkup(
      createElement(
        SurfaceValidationContext.Provider,
        { value: { submitAttempted: false, markSubmitAttempted } },
        createElement(function DisabledSubmitClickProbe() {
          const tree = DshButtonView({
            props: {
              child: 'lbl',
              variant: 'primary',
              isValid: false,
              validationErrors: ['请填写服务名称'],
              action: async () => {},
            },
            buildChild: () => '提交',
          })
          const wrappers = findElements(tree, (el) => typeof el.props.onClickCapture === 'function')
          ;(wrappers[0]?.props.onClickCapture as (() => void) | undefined)?.()
          return tree
        }),
      ),
    )
    expect(submitAttemptedFlag).toBe(true)

    const afterSubmitAttemptHtml = renderToStaticMarkup(
      createElement(
        SurfaceValidationContext.Provider,
        { value: { submitAttempted: true, markSubmitAttempted } },
        createElement(DshTextFieldView, {
          props: {
            label: '服务名称',
            value: '',
            isValid: false,
            validationErrors: ['Required check failed'],
          },
        }),
      ),
    )
    expect(afterSubmitAttemptHtml).toContain('Required check failed')
    expect(afterSubmitAttemptHtml).toContain('aria-invalid="true"')

    function BlurTriggerProbe() {
      const [triggered, setTriggered] = useState(false)
      const tree = DshTextFieldView({
        props: {
          label: '邮箱',
          value: 'invalid',
          isValid: false,
          validationErrors: ['Email check failed'],
        },
      })
      if (!triggered) {
        const inputs = findElements(tree, (el) => typeof el.props.onBlur === 'function')
        expect(inputs.length).toBeGreaterThan(0)
        ;(inputs[0]!.props.onBlur as () => void)()
        setTriggered(true)
      }
      return tree
    }
    const blurredHtml = renderToStaticMarkup(createElement(BlurTriggerProbe))
    expect(blurredHtml).toContain('Email check failed')
    expect(blurredHtml).toContain('aria-invalid="true"')
  })

  it('Item 5: documents plain-text Table cells and compiles canonical ?check validation rules cleanly', () => {
    const sessions = new SurfaceSessions(createGenerator())
    const snippet = sessions.promptSnippet()

    expect(A2UI_SYSTEM_GUIDANCE).toContain('NEVER nest `Badge`/`Button` inside `rows`')
    expect(SKILL_PREAMBLE).toContain('`Table` cells are plain scalar text only')
    expect(snippet).toContain(
      'nested A2UI components such as Badge or Button are NOT supported inside Table cells',
    )

    expect(SKILL_PREAMBLE).toContain('## Client Validation Rules (`?check`)')
    expect(SKILL_PREAMBLE).toContain('?required(')
    expect(SKILL_PREAMBLE).toContain('?email(')
    expect(SKILL_PREAMBLE).toContain('?regex(')
    expect(SKILL_PREAMBLE).toContain('?length(')
    expect(SKILL_PREAMBLE).toContain('?numeric(')

    const compiled = sessions.compile('sess-validated-form', GOLDEN_VALIDATED_FORM_EXAMPLE)
    expect(compiled.length).toBeGreaterThan(0)
    const wireJson = JSON.stringify(compiled)
    expect(wireJson).toContain('"checks"')
    expect(wireJson).toContain('请输入服务标识')
    expect(wireJson).toContain('自助审批范围为 200–3000 QPS')
  })

  it('Mermaid zoom upgrade: uses explicit vector dimensions (--mermaid-zoom-w/h), grab-to-pan cursors, and 96vw×94vh fullscreen', () => {
    const cssSource = readFileSync(
      resolve(process.cwd(), 'src/client/catalog/Catalog.module.css'),
      'utf8',
    )
    const widgetSource = readFileSync(
      resolve(process.cwd(), 'src/client/catalog/ExtendedWidgets.tsx'),
      'utf8',
    )

    expect(widgetSource).not.toContain('zoom: `${')
    expect(widgetSource).toContain("'--mermaid-zoom-w'")
    expect(widgetSource).toContain("'--mermaid-zoom-h'")
    expect(cssSource).toContain('width: var(--mermaid-zoom-w);')
    expect(cssSource).toContain('height: var(--mermaid-zoom-h);')

    expect(cssSource).toMatch(/\[data-pannable="true"\][\s\S]*?cursor:\s*grab;/)
    expect(cssSource).toMatch(/\[data-dragging="true"\][\s\S]*?cursor:\s*grabbing;/)
    expect(cssSource).toMatch(
      /\.mermaidFullscreenCard\s*\{[^}]*width:\s*96vw;[^}]*height:\s*94vh;/s,
    )
  })
})
