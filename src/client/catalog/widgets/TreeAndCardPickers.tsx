import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import {
  type CSSProperties,
  Fragment,
  useCallback,
  useContext,
  useDeferredValue,
  useId,
  useMemo,
  useState,
} from 'react'
import { CheckCardApi, TreeApi, TreeSelectApi } from '../../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { useDarkTheme } from '../../theme.ts'
import {
  DshCheckIcon,
  DshChevronDownIcon,
  DshInput,
  DshSearchIcon,
  DshStateDot,
  DshTag,
} from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import {
  collectBranchDepths,
  filterHierarchyTree,
  findBreadcrumbByValue,
  type NormalizedHierarchyNode,
  normalizeCheckCardOptions,
  normalizeHierarchyTree,
} from '../v5-helpers.ts'
import {
  defineComponent,
  isLocalFunctionAction,
  isWritableProp,
  ModalCloseContext,
  normalizeStringArrayValue,
  PortalPopoverShell,
  runSurfaceAction,
  SurfaceActionStatusContext,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  usePickerPopover,
  useSurfaceActionRunner,
  useWritablePropState,
  weightStyle,
} from '../widget-helpers.tsx'

const SEARCH_ICON_14 = <DshSearchIcon size={14} />
const CHEVRON_DOWN_14 = <DshChevronDownIcon size={14} />
const CHECK_ICON_12 = <DshCheckIcon size={12} />

function TreeSelectOptionBranch(props: {
  readonly node: NormalizedHierarchyNode
  readonly depth: number
  readonly selectedValue: string
  readonly forceExpanded: boolean
  readonly onSelect: (val: string) => void
}) {
  const { node, depth, selectedValue, forceExpanded, onSelect } = props
  const [expanded, setExpanded] = useState(true)
  const isBranch = node.children.length > 0
  const isOpen = forceExpanded || expanded
  const selectableBranch = isBranch && Boolean(node.hasExplicitValue)
  const isSelected = (!isBranch || selectableBranch) && node.value === selectedValue

  return (
    <Fragment>
      <div
        className={css.treeSelectRow}
        data-selected={isSelected ? 'true' : 'false'}
        style={{ paddingLeft: 8 + Math.min(depth, 5) * 13 }}
      >
        {isBranch ? (
          <button
            type="button"
            className={css.treeCaretBtn}
            disabled={forceExpanded}
            aria-label={node.label}
            aria-expanded={isOpen}
            onClick={(e) => {
              e.stopPropagation()
              if (!forceExpanded) setExpanded((v) => !v)
            }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className={css.treeLeafSpacer} />
        )}
        <button
          type="button"
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={isBranch ? isOpen : undefined}
          className={css.treeSelectNodeBtn}
          onClick={() => {
            if (isBranch && !selectableBranch) {
              if (!forceExpanded) setExpanded((v) => !v)
            } else {
              onSelect(node.value)
            }
          }}
        >
          <span className={isBranch ? css.treeSelectGroupText : css.treeSelectLeafText}>
            {node.label}
          </span>
          {node.badge ? <DshTag tone="neutral">{node.badge}</DshTag> : null}
          {isSelected ? <span className={css.selectOptionCheck}>{CHECK_ICON_12}</span> : null}
        </button>
      </div>
      {isBranch && isOpen
        ? node.children.map((child) => (
            <TreeSelectOptionBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedValue={selectedValue}
              forceExpanded={forceExpanded}
              onSelect={onSelect}
            />
          ))
        : null}
    </Fragment>
  )
}

export const DshTreeSelectImpl = defineComponent<{
  label?: unknown
  nodes?: unknown
  value?: unknown
  setValue?: (next: string) => void
  placeholder?: unknown
  searchable?: boolean
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(TreeSelectApi, function DshTreeSelect({ props, context }) {
  const fieldId = useId()
  const msg = useRuntimeMessages()
  const dark = useDarkTheme()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const onBeforeClose = useCallback(() => {
    setQuery('')
    setTouched(true)
  }, [])
  const { setOpen, effectiveOpen, popoverBox, triggerRef, popoverRef, closePopover, toggleOpen } =
    usePickerPopover<HTMLButtonElement>({
      readOnly,
      minWidth: 240,
      estHeight: 280,
      onBeforeClose,
    })
  const handleToggleOpen = toggleOpen
  const [rawVal, commitVal] = useWritablePropState(context, 'value', props.value, props.setValue)

  const tree = useMemo(() => normalizeHierarchyTree(props.nodes), [props.nodes])
  const filteredTree = useMemo(
    () => (props.searchable === false ? tree : filterHierarchyTree(tree, deferredQuery)),
    [tree, props.searchable, deferredQuery],
  )
  const selectedVal = rawVal === undefined || rawVal === null ? '' : String(rawVal)
  const breadcrumb = useMemo(() => findBreadcrumbByValue(tree, selectedVal), [tree, selectedVal])

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const placeholder =
    props.placeholder !== undefined && props.placeholder !== null
      ? String(props.placeholder)
      : msg.treeSelectPlaceholder
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  return (
    <div className={css.field} style={weightStyle(props.weight, 180)} data-a2ui-treeselect="">
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? (
            <label htmlFor={fieldId} className={css.label}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}

      <button
        ref={triggerRef}
        id={fieldId}
        type="button"
        className={css.selectTrigger}
        disabled={readOnly}
        aria-haspopup="tree"
        aria-expanded={effectiveOpen}
        aria-invalid={showError || undefined}
        data-placeholder={breadcrumb || selectedVal ? 'false' : 'true'}
        onClick={handleToggleOpen}
      >
        <span className={css.selectTriggerText}>{breadcrumb ?? (selectedVal || placeholder)}</span>
        <span className={css.selectTriggerChevron} aria-hidden="true">
          {CHEVRON_DOWN_14}
        </span>
      </button>

      <PortalPopoverShell
        open={effectiveOpen}
        box={popoverBox}
        dark={dark}
        popoverRef={popoverRef}
        onClose={closePopover}
        roleSelector='[role="treeitem"]'
      >
        {props.searchable !== false ? (
          <div className={css.selectSearchRow}>
            <DshInput
              autoFocus
              icon={SEARCH_ICON_14}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={msg.treeSearchPlaceholder}
            />
          </div>
        ) : null}
        <div role="tree" aria-label={label || placeholder} className={css.selectOptionList}>
          {filteredTree.length === 0 ? (
            <div className={css.selectEmpty}>{msg.treeEmpty}</div>
          ) : (
            filteredTree.map((node) => (
              <TreeSelectOptionBranch
                key={node.id}
                node={node}
                depth={0}
                selectedValue={selectedVal}
                forceExpanded={deferredQuery.trim() !== ''}
                onSelect={(val) => {
                  if (readOnly) return
                  setTouched(true)
                  commitVal(val)
                  setOpen(false)
                  setQuery('')
                }}
              />
            ))
          )}
        </div>
      </PortalPopoverShell>
    </div>
  )
})

export const DshCheckCardImpl = defineComponent<{
  label?: unknown
  options?: unknown
  value?: unknown
  setValue?: (next: string | string[]) => void
  multiple?: boolean
  columns?: number
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(CheckCardApi, function DshCheckCard({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const closeModal = useContext(ModalCloseContext)
  const getActionStatus = useContext(SurfaceActionStatusContext)
  const { submitAttempted, markSubmitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)

  const options = useMemo(() => normalizeCheckCardOptions(props.options), [props.options])
  const hasWritableValue = isWritableProp(context, 'value', props.setValue)
  const [hadInitialLiteralValue] = useState(
    () =>
      props.value !== undefined &&
      props.value !== null &&
      (Array.isArray(props.value) ? props.value.length > 0 : String(props.value) !== ''),
  )
  const isPromptMode =
    typeof props.action === 'function' && !hasWritableValue && !hadInitialLiteralValue
  const isFormBound = !isPromptMode
  const multiple = Boolean(props.multiple)
  const [selectedVal, commitSelectedVal] = useWritablePropState<unknown>(
    context,
    'value',
    props.value,
    props.setValue as ((next: unknown) => void) | undefined,
  )
  const cols =
    typeof props.columns === 'number' && props.columns >= 1 && props.columns <= 4
      ? Math.trunc(props.columns)
      : Math.min(3, Math.max(1, options.length))

  const selectedSet = useMemo(() => {
    if (Array.isArray(selectedVal)) return new Set(normalizeStringArrayValue(selectedVal))
    if (selectedVal !== undefined && selectedVal !== null && String(selectedVal) !== '') {
      return new Set([String(selectedVal)])
    }
    return new Set<string>()
  }, [selectedVal])

  if (options.length === 0) return null

  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined

  const handleCardClick = (opt: (typeof options)[number]) => {
    if (readOnly) return
    setTouched(true)
    if (isFormBound) {
      if (multiple) {
        const cur = [...selectedSet]
        const next = selectedSet.has(opt.value)
          ? cur.filter((v) => v !== opt.value)
          : [...cur, opt.value]
        commitSelectedVal(next)
      } else {
        commitSelectedVal(opt.value)
      }
    }
    if (typeof props.action === 'function') {
      if (props.isValid === false) {
        markSubmitAttempted()
        return
      }
      const localFn = isLocalFunctionAction(context)
      const actionFn = props.action
      void runSurfaceAction(
        () =>
          actionFn({
            metadata: {
              extensions: {
                dshSelection: {
                  source: 'checkCard',
                  label: opt.title,
                  value: opt.value,
                  option: opt.raw,
                },
              },
            },
          }),
        getActionStatus,
      ).then((ok) => {
        if (!localFn && !multiple && ok) closeModal?.()
      })
    }
  }

  return (
    <div
      className={`${css.field} ${css.checkCardField}`}
      style={weightStyle(props.weight, 220)}
      data-a2ui-checkcard=""
    >
      {label || err ? (
        <div className={css.fieldHeader}>
          {label ? <span className={css.label}>{label}</span> : <span />}
          {err ? <span className={css.errorText}>{err}</span> : null}
        </div>
      ) : null}

      <div
        className={css.checkCardGrid}
        role="group"
        aria-label={label || undefined}
        aria-invalid={showError || undefined}
        data-columns={String(cols)}
        style={{ '--a2ui-grid-cols': cols } as CSSProperties}
      >
        {options.map((opt) => {
          const checked = isFormBound && selectedSet.has(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              disabled={readOnly}
              className={css.checkCardItem}
              aria-pressed={isPromptMode ? undefined : checked}
              data-checked={checked ? 'true' : 'false'}
              data-prompt={isPromptMode ? 'true' : 'false'}
              onClick={() => handleCardClick(opt)}
            >
              <div className={css.checkCardTop}>
                <span className={css.checkCardTitle}>{opt.title}</span>
                {isPromptMode ? (
                  <span className={css.checkCardPromptArrow} aria-hidden="true">
                    ↗
                  </span>
                ) : (
                  <span
                    className={css.checkCardIndicator}
                    data-checked={checked ? 'true' : 'false'}
                  >
                    {checked ? '✓' : ''}
                  </span>
                )}
              </div>
              {opt.recommended || opt.badge ? (
                <div className={css.checkCardBadges}>
                  {opt.recommended ? (
                    <DshTag tone="info">{msg.comparisonRecommended}</DshTag>
                  ) : null}
                  {opt.badge ? <span className={css.checkCardBadgeText}>{opt.badge}</span> : null}
                </div>
              ) : null}
              {opt.description ? <div className={css.checkCardDesc}>{opt.description}</div> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
})

function GeneralTreeBranch(props: {
  readonly node: NormalizedHierarchyNode
  readonly depth: number
  readonly expandedDepth: number
  readonly treeMode: 'default' | 'all' | 'none'
  readonly toggledMap: ReadonlyMap<string, boolean>
  readonly forceExpandAll: boolean
  readonly onToggle: (id: string, currentlyOpen: boolean) => void
  readonly onSelect?: ((node: NormalizedHierarchyNode) => void) | undefined
}) {
  const { node, depth, expandedDepth, treeMode, toggledMap, forceExpandAll, onToggle, onSelect } =
    props
  const msg = useRuntimeMessages()
  const isBranch = node.children.length > 0
  const baseOpen = treeMode === 'all' ? true : treeMode === 'none' ? false : depth < expandedDepth
  const isOpen = forceExpandAll || (toggledMap.get(node.id) ?? baseOpen)
  const dotState =
    node.status === 'healthy'
      ? 'done'
      : node.status === 'warning'
        ? 'warning'
        : node.status === 'error'
          ? 'error'
          : null

  return (
    <li className={css.fileTreeLi} role="treeitem" aria-expanded={isBranch ? isOpen : undefined}>
      <div
        className={css.generalTreeRow}
        data-status={node.status}
        style={{ '--tree-depth': Math.min(depth, 6) } as CSSProperties}
      >
        {isBranch ? (
          <button
            type="button"
            className={css.treeCaretBtn}
            disabled={forceExpandAll}
            onClick={() => {
              if (!forceExpandAll) onToggle(node.id, isOpen)
            }}
            aria-label={msg.treeToggleBranchAria}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className={css.treeLeafConnector} aria-hidden="true">
            ├─
          </span>
        )}

        {onSelect || isBranch ? (
          <button
            type="button"
            className={css.generalTreeMainBtn}
            onClick={() => {
              if (onSelect) onSelect(node)
              else if (isBranch) onToggle(node.id, isOpen)
            }}
          >
            {dotState ? <DshStateDot state={dotState} size={8} /> : null}
            <span className={isBranch ? css.generalTreeBranchLabel : css.generalTreeLeafLabel}>
              {node.label}
            </span>
            {node.sublabel ? <span className={css.generalTreeSub}>{node.sublabel}</span> : null}
            {node.badge ? <DshTag tone="neutral">{node.badge}</DshTag> : null}
          </button>
        ) : (
          <div className={css.generalTreeMainBtn} style={{ cursor: 'default' }}>
            {dotState ? <DshStateDot state={dotState} size={8} /> : null}
            <span className={css.generalTreeLeafLabel}>{node.label}</span>
            {node.sublabel ? <span className={css.generalTreeSub}>{node.sublabel}</span> : null}
            {node.badge ? <DshTag tone="neutral">{node.badge}</DshTag> : null}
          </div>
        )}

        {node.sharePct !== undefined || node.metric ? (
          <div className={css.generalTreeRight}>
            {node.sharePct !== undefined ? (
              <span className={css.generalTreeBarTrack} aria-hidden="true">
                {(() => {
                  const off = node.offsetPct ?? 0
                  const maxW = Math.max(3, 100 - off)
                  const widthPct = Math.min(maxW, Math.max(3, node.sharePct))
                  return (
                    <span
                      className={css.generalTreeBarFill}
                      data-status={node.status}
                      style={{
                        ...(off > 0 ? { marginLeft: `${off}%` } : {}),
                        width: `${widthPct}%`,
                      }}
                    />
                  )
                })()}
              </span>
            ) : null}
            {node.metric ? <span className={css.generalTreeMetric}>{node.metric}</span> : null}
          </div>
        ) : null}
      </div>

      {isBranch && isOpen ? (
        <ul className={css.fileTreeUl} role="group">
          {node.children.map((child) => (
            <GeneralTreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedDepth={expandedDepth}
              treeMode={treeMode}
              toggledMap={toggledMap}
              forceExpandAll={forceExpandAll}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export const DshTreeImpl = defineComponent<{
  nodes?: unknown
  title?: unknown
  summary?: unknown
  searchable?: boolean
  expandedDepth?: number
  action?: ((options?: ActionDispatchOptions) => Promise<void>) | undefined
  weight?: number
}>(TreeApi, function DshTree({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)
  const tree = useMemo(() => normalizeHierarchyTree(props.nodes), [props.nodes])
  const expandedDepth =
    typeof props.expandedDepth === 'number' && props.expandedDepth >= 0
      ? Math.trunc(props.expandedDepth)
      : 3

  const branches = useMemo(() => collectBranchDepths(tree), [tree])
  const branchSig = useMemo(
    () => `${tree.length}:${branches.map((b) => b.id).join('\0')}`,
    [tree.length, branches],
  )
  const [prevBranchSig, setPrevBranchSig] = useState(branchSig)
  const [treeMode, setTreeMode] = useState<'default' | 'all' | 'none'>('default')
  const [toggledMap, setToggledMap] = useState<ReadonlyMap<string, boolean>>(() => new Map())
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  if (prevBranchSig !== branchSig) {
    setPrevBranchSig(branchSig)
    if (toggledMap.size > 0) setToggledMap(new Map())
    if (treeMode !== 'default') setTreeMode('default')
  }

  const filtered = useMemo(
    () => (props.searchable ? filterHierarchyTree(tree, deferredQuery) : tree),
    [tree, props.searchable, deferredQuery],
  )

  if (tree.length === 0) return null

  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const summary = props.summary !== undefined && props.summary !== null ? String(props.summary) : ''
  const canAct = !readOnly && Boolean(runAction)
  const searchActive = Boolean(props.searchable && deferredQuery.trim() !== '')
  const allOpen =
    searchActive ||
    (branches.length > 0 &&
      branches.every(({ id, depth }) => {
        const baseOpen =
          treeMode === 'all' ? true : treeMode === 'none' ? false : depth < expandedDepth
        return toggledMap.get(id) ?? baseOpen
      }))

  const toggleBranch = (id: string, currentlyOpen: boolean) => {
    setToggledMap((prev) => {
      const next = new Map(prev)
      next.set(id, !currentlyOpen)
      return next
    })
  }

  return (
    <div className={css.fileTreeCard} style={weightStyle(props.weight, 240)} data-a2ui-tree="">
      {title || summary || props.searchable || branches.length > 0 ? (
        <div className={css.fileTreeHeader}>
          <span className={css.fileTreeTitle}>{title}</span>
          <div className={css.proTableRightGroup}>
            {summary ? <span className={css.trackerSummary}>{summary}</span> : null}
            {branches.length > 0 && !searchActive ? (
              <button
                type="button"
                className={css.diffCopyBtn}
                onClick={() => {
                  setToggledMap(new Map())
                  setTreeMode(allOpen ? 'none' : 'all')
                }}
              >
                {allOpen ? msg.treeCollapseAll : msg.treeExpandAll}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {props.searchable ? (
        <div className={css.treeSearchHeader}>
          <DshInput
            icon={SEARCH_ICON_14}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={msg.treeSearchPlaceholder}
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className={css.emptyCell}>{msg.treeEmpty}</div>
      ) : (
        <ul className={css.fileTreeRoot} role="tree" aria-label={title || 'Tree'}>
          {filtered.map((node) => (
            <GeneralTreeBranch
              key={node.id}
              node={node}
              depth={0}
              expandedDepth={expandedDepth}
              treeMode={treeMode}
              toggledMap={toggledMap}
              forceExpandAll={searchActive}
              onToggle={toggleBranch}
              onSelect={
                canAct
                  ? (n) => {
                      void runAction?.({
                        metadata: {
                          extensions: {
                            dshSelection: {
                              source: 'tree',
                              label: n.breadcrumb,
                              value: n.metric,
                              node: n.raw,
                            },
                          },
                        },
                      })
                    }
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
})
