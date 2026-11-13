/**
 * Accessible workspace file path chip / right-sidebar open button shared by
 * `Code` and `DiffView` when `filePath` is explicitly declared in A2UI props.
 */
import { parseFileTarget, useFileOpener } from '../file-opener.tsx'
import css from './Catalog.module.css'

export function FileOpenChip(props: {
  readonly filePath: unknown
  readonly line?: unknown
}) {
  const openFile = useFileOpener()
  const target = parseFileTarget(props.filePath, props.line)
  if (!target) return null

  const label = target.line !== undefined ? `${target.path}:${target.line}` : target.path

  if (openFile) {
    return (
      <button
        type="button"
        className={css.fileOpenBtn}
        onClick={() => openFile(target.path, target.line)}
        title={`在右侧栏打开 ${label}`}
        data-a2ui-file-link={target.path}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3.5 2.5H9.5L12.5 5.5V13.5H3.5V2.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M9 2.5V6H12.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
        <span className={css.fileOpenPath}>{label}</span>
        <span className={css.fileOpenArrow} aria-hidden="true">↗</span>
      </button>
    )
  }

  return (
    <span className={css.fileOpenStatic} data-a2ui-file-link={target.path}>
      <span className={css.fileOpenPath}>{label}</span>
    </span>
  )
}
