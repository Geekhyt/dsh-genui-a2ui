/**
 * Accessible workspace file path chip / right-sidebar open button shared by
 * `Code`, `DiffView`, `LogViewer`, and `SourceList`, powered by DSH's native
 * `FileTypeIcon` and `PathLabel` primitives.
 */
import { parseFileTarget, useFileOpener } from '../file-opener.tsx'
import { useRuntimeMessages } from '../i18n.ts'
import { DshFileTypeIcon, DshPathLabel } from '../ui/primitives.tsx'
import css from './Catalog.module.css'

export function FileOpenChip(props: { readonly filePath: unknown; readonly line?: unknown }) {
  const msg = useRuntimeMessages()
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
        title={msg.openInSidebar(label)}
        data-a2ui-file-link={target.path}
      >
        <DshFileTypeIcon path={target.path} size={13} />
        {target.line !== undefined ? (
          <span className={css.fileOpenPath}>{label}</span>
        ) : (
          <DshPathLabel path={target.path} className={css.fileOpenPath} />
        )}
        <span className={css.fileOpenArrow} aria-hidden="true">
          ↗
        </span>
      </button>
    )
  }

  return (
    <span className={css.fileOpenStatic} data-a2ui-file-link={target.path}>
      <DshFileTypeIcon path={target.path} size={13} />
      <span className={css.fileOpenPath}>{label}</span>
    </span>
  )
}
