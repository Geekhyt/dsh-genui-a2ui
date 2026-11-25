import type { ActionDispatchOptions } from '@a2ui/web_core/v1_0'
import { useContext, useMemo, useState } from 'react'
import { AnnotationTextApi, ImageCompareApi, RatingApi } from '../../../shared/catalog-schema.ts'
import { useRuntimeMessages } from '../../i18n.ts'
import { DshHoverCard, DshHoverCardGroup, DshTag, type TagTone } from '../../ui/primitives.tsx'
import css from '../Catalog.module.css'
import {
  buildAnnotatedTextSegments,
  clampImageComparePosition,
  clampRatingScore,
  normalizeRatingLabels,
} from '../v6-helpers.ts'
import {
  defineComponent,
  handleHorizontalArrowKey,
  isSafeImageUrl,
  SurfaceReadOnlyContext,
  SurfaceValidationContext,
  useSurfaceActionRunner,
  useWritablePropState,
  weightStyle,
} from '../widget-helpers.tsx'

function StarGlyph({ fill }: { readonly fill: 'full' | 'half' | 'empty' }) {
  if (fill === 'half') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M10 2.2l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.18 5.3 16.65l.9-5.23-3.8-3.7 5.25-.76L10 2.2z"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinejoin="round"
        />
        <path d="M10 2.2v11.98l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L10 2.2z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 2.2l2.35 4.76 5.25.76-3.8 3.7.9 5.23L10 14.18 5.3 16.65l.9-5.23-3.8-3.7 5.25-.76L10 2.2z"
        fill={fill === 'full' ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export const DshRatingImpl = defineComponent<{
  label?: unknown
  value?: unknown
  setValue?: (next: number) => void
  max?: number
  allowHalf?: boolean
  labels?: unknown
  variant?: 'star' | 'scale'
  isValid?: boolean
  validationErrors?: readonly string[]
  weight?: number
}>(RatingApi, function DshRating({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const { submitAttempted } = useContext(SurfaceValidationContext)
  const [touched, setTouched] = useState(false)
  const [rawVal, commitVal] = useWritablePropState(context, 'value', props.value, props.setValue)

  const max =
    typeof props.max === 'number' && Number.isFinite(props.max)
      ? Math.max(3, Math.min(10, Math.trunc(props.max)))
      : 5
  const variant = props.variant === 'scale' ? 'scale' : 'star'
  const allowHalf = variant === 'star' && Boolean(props.allowHalf)
  const score = clampRatingScore(rawVal, max, allowHalf)
  const labels = useMemo(() => normalizeRatingLabels(props.labels), [props.labels])
  const label = props.label !== undefined && props.label !== null ? String(props.label) : ''
  const showError = !readOnly && (touched || submitAttempted) && props.isValid === false
  const err = showError ? props.validationErrors?.[0] : undefined
  const activeDesc = score > 0 ? (labels[Math.ceil(score) - 1] ?? '') : ''

  const selectScore = (next: number) => {
    if (readOnly) return
    setTouched(true)
    commitVal(next)
  }

  return (
    <div
      className={`${css.field} ${css.ratingField}`}
      style={weightStyle(props.weight, 160)}
      data-a2ui-rating=""
    >
      <div className={css.fieldHeader}>
        {label ? <span className={css.label}>{label}</span> : <span />}
        <span className={css.ratingSummary}>
          {activeDesc ? `${activeDesc} · ` : ''}
          {msg.ratingScoreOf(score, max)}
        </span>
      </div>
      {variant === 'scale' ? (
        <div
          className={css.ratingScaleRow}
          role="radiogroup"
          aria-label={label || msg.ratingAria}
          aria-invalid={showError || undefined}
          onKeyDown={(e) => {
            if (readOnly) return
            handleHorizontalArrowKey(e, e.currentTarget, '[role="radio"]', (idx) => {
              selectScore(idx + 1)
            })
          }}
        >
          {Array.from({ length: max }, (_, idx) => {
            const val = idx + 1
            const active = score === val
            const itemDesc = labels[idx]
            const tabIdx = readOnly ? -1 : active || (score === 0 && idx === 0) ? 0 : -1
            return (
              <button
                key={val}
                type="button"
                role="radio"
                tabIndex={tabIdx}
                aria-checked={active}
                aria-label={
                  itemDesc
                    ? `${itemDesc} (${msg.ratingScoreOf(val, max)})`
                    : msg.ratingScoreOf(val, max)
                }
                disabled={readOnly}
                className={css.ratingScaleBtn}
                data-active={active ? 'true' : 'false'}
                onClick={() => selectScore(val)}
              >
                {val}
              </button>
            )
          })}
        </div>
      ) : (
        <div
          className={css.ratingStarsRow}
          role="radiogroup"
          aria-label={label || msg.ratingAria}
          aria-invalid={showError || undefined}
          onKeyDown={(e) => {
            if (readOnly) return
            handleHorizontalArrowKey(e, e.currentTarget, '[role="radio"]', (idx) => {
              selectScore(idx + 1)
            })
          }}
        >
          {Array.from({ length: max }, (_, idx) => {
            const fullVal = idx + 1
            const halfVal = idx + 0.5
            const fill: 'full' | 'half' | 'empty' =
              score >= fullVal ? 'full' : allowHalf && score >= halfVal ? 'half' : 'empty'
            const isHalfChecked = allowHalf && score === halfVal
            const isChecked = score === fullVal || isHalfChecked
            const tabIdx = readOnly ? -1 : isChecked || (score === 0 && idx === 0) ? 0 : -1
            return (
              <button
                key={fullVal}
                type="button"
                role="radio"
                tabIndex={tabIdx}
                aria-checked={isChecked}
                aria-label={msg.ratingScoreOf(isHalfChecked ? halfVal : fullVal, max)}
                disabled={readOnly}
                className={css.ratingStarBtn}
                data-filled={fill !== 'empty' ? 'true' : 'false'}
                onClick={() => {
                  if (allowHalf && score === fullVal) {
                    selectScore(halfVal)
                  } else {
                    selectScore(fullVal)
                  }
                }}
              >
                <StarGlyph fill={fill} />
              </button>
            )
          })}
        </div>
      )}
      {err ? <span className={css.errorText}>{err}</span> : null}
    </div>
  )
})

export const DshImageCompareImpl = defineComponent<{
  beforeUrl?: unknown
  afterUrl?: unknown
  beforeLabel?: unknown
  afterLabel?: unknown
  title?: unknown
  initialPosition?: number
  height?: number
  weight?: number
}>(ImageCompareApi, function DshImageCompare({ props }) {
  const msg = useRuntimeMessages()
  const initialPos = clampImageComparePosition(props.initialPosition)
  const [prevInit, setPrevInit] = useState(initialPos)
  const [pos, setPos] = useState(initialPos)
  const [brokenSrcs, setBrokenSrcs] = useState<ReadonlySet<string>>(() => new Set())
  if (prevInit !== initialPos) {
    setPrevInit(initialPos)
    setPos(initialPos)
  }

  if (!isSafeImageUrl(props.beforeUrl) || !isSafeImageUrl(props.afterUrl)) return null
  const beforeSrc = String(props.beforeUrl)
  const afterSrc = String(props.afterUrl)
  const markBroken = (src: string) => {
    setBrokenSrcs((prev) => {
      if (prev.has(src)) return prev
      const next = new Set(prev)
      next.add(src)
      return next
    })
  }
  const beforeFailed = brokenSrcs.has(beforeSrc)
  const afterFailed = brokenSrcs.has(afterSrc)
  const beforeLabel = props.beforeLabel ? String(props.beforeLabel) : msg.imageCompareDefaultBefore
  const afterLabel = props.afterLabel ? String(props.afterLabel) : msg.imageCompareDefaultAfter
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const height =
    typeof props.height === 'number' && Number.isFinite(props.height)
      ? Math.max(160, Math.min(520, props.height))
      : 260

  return (
    <div
      className={css.imageCompareCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-imagecompare=""
    >
      {title ? (
        <div className={css.imageCompareHeader}>
          <span className={css.imageCompareTitle}>{title}</span>
          <span className={css.imageComparePct}>{pos}%</span>
        </div>
      ) : null}
      <div className={css.imageCompareStage} style={{ minHeight: height }}>
        {afterFailed ? (
          <div className={css.emptyCell} style={{ minHeight: height }}>
            {afterLabel}
          </div>
        ) : (
          <img
            src={afterSrc}
            alt={afterLabel}
            className={css.imageCompareImg}
            loading="lazy"
            draggable={false}
            onError={() => markBroken(afterSrc)}
          />
        )}
        <div className={css.imageCompareOverlay} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {beforeFailed ? (
            <div className={css.emptyCell} style={{ minHeight: height }}>
              {beforeLabel}
            </div>
          ) : (
            <img
              src={beforeSrc}
              alt={beforeLabel}
              className={css.imageCompareImg}
              loading="lazy"
              draggable={false}
              onError={() => markBroken(beforeSrc)}
            />
          )}
        </div>
        <span className={`${css.imageCompareBadge} ${css.imageCompareBadgeLeft}`}>
          {beforeLabel}
        </span>
        <span className={`${css.imageCompareBadge} ${css.imageCompareBadgeRight}`}>
          {afterLabel}
        </span>
        <div className={css.imageCompareDivider} style={{ left: `${pos}%` }} aria-hidden="true">
          <span className={css.imageCompareHandle}>⇄</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          aria-label={msg.imageCompareSliderAria}
          className={css.imageCompareRange}
          onChange={(e) => {
            setPos(clampImageComparePosition(e.target.value))
          }}
        />
      </div>
    </div>
  )
})

export const DshAnnotationTextImpl = defineComponent<{
  text?: unknown
  annotations?: unknown
  title?: unknown
  showLegend?: boolean
  action?: ((options?: ActionDispatchOptions) => unknown) | undefined
  weight?: number
}>(AnnotationTextApi, function DshAnnotationText({ props, context }) {
  const msg = useRuntimeMessages()
  const readOnly = useContext(SurfaceReadOnlyContext)
  const runAction = useSurfaceActionRunner(context, props.action)

  const sourceText = props.text !== undefined && props.text !== null ? String(props.text) : ''
  const { segments, legend } = useMemo(
    () => buildAnnotatedTextSegments(sourceText, props.annotations),
    [sourceText, props.annotations],
  )
  const title = props.title !== undefined && props.title !== null ? String(props.title) : ''
  const showLegend = props.showLegend !== false && legend.length > 0
  const clickable = !readOnly && Boolean(runAction)

  const triggerSpan = (ann: Extract<(typeof segments)[number], { kind: 'mark' }>['annotation']) => {
    if (!clickable || !runAction) return
    void runAction({
      metadata: {
        extensions: {
          dshSelection: {
            source: 'annotationText',
            text: ann.text,
            label: ann.label,
            note: ann.note,
            sourceId: ann.sourceId,
          },
        },
      },
    })
  }

  return (
    <div
      className={css.annotationCard}
      style={weightStyle(props.weight, 220)}
      data-a2ui-annotationtext=""
    >
      <div className={css.annotationInner}>
        {title || showLegend ? (
          <div className={css.annotationHeader}>
            {title ? <span className={css.annotationTitle}>{title}</span> : null}
            {showLegend ? (
              <div className={css.annotationLegend}>
                {legend.map((entry) => (
                  <span
                    key={`${entry.tone}-${entry.label}`}
                    className={css.annotationLegendPill}
                    data-tone={entry.tone}
                  >
                    <span className={css.annotationLegendDot} data-tone={entry.tone} />
                    <span>{entry.label}</span>
                    <span className={css.annotationLegendCount}>{entry.count}</span>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {segments.length === 0 ? (
          <div className={css.emptyCell}>{msg.annotationEmpty}</div>
        ) : (
          <div className={css.annotationBody}>
            <DshHoverCardGroup>
              {segments.map((seg, idx) => {
                if (seg.kind === 'plain') {
                  return <span key={idx}>{seg.text}</span>
                }
                const ann = seg.annotation
                const markEl = clickable ? (
                  <mark
                    role="button"
                    tabIndex={0}
                    className={`${css.annotationMark} ${css.annotationMarkBtn}`}
                    data-tone={ann.tone}
                    onClick={() => triggerSpan(ann)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        triggerSpan(ann)
                      }
                    }}
                  >
                    <span>{ann.text}</span>
                    {ann.label ? <span className={css.annotationMarkTag}>{ann.label}</span> : null}
                  </mark>
                ) : (
                  <mark
                    className={css.annotationMark}
                    data-tone={ann.tone}
                    tabIndex={ann.note || ann.sourceId ? 0 : undefined}
                  >
                    <span>{ann.text}</span>
                    {ann.label ? <span className={css.annotationMarkTag}>{ann.label}</span> : null}
                  </mark>
                )
                if (!ann.note && !ann.sourceId) {
                  return <span key={idx}>{markEl}</span>
                }
                const hoverContent = (
                  <div className={css.annotationHoverBody}>
                    {ann.label || ann.sourceId ? (
                      <div className={css.annotationHoverTitle}>
                        {ann.label ? <DshTag tone={ann.tone as TagTone}>{ann.label}</DshTag> : null}
                        {ann.sourceId ? (
                          <span className={css.annotationHoverSrc}>{ann.sourceId}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {ann.note ? <div className={css.annotationHoverNote}>{ann.note}</div> : null}
                  </div>
                )
                return (
                  <DshHoverCard
                    key={idx}
                    grouped
                    inline
                    anchor={markEl}
                    content={hoverContent}
                    fallbackTitle={ann.note || ann.label}
                  />
                )
              })}
            </DshHoverCardGroup>
          </div>
        )}
      </div>
    </div>
  )
})
