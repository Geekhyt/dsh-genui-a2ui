/**
 * Crisp 24x24 stroke/fill SVG icons for all standard A2UI v1.0 `Icon` names
 * plus custom `{ svgPath }` artwork.
 */
import css from './Catalog.module.css'

const ICON_PATHS: Record<string, string> = {
  check: 'M5 13l4 4L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  add: 'M12 5v14M5 12h14',
  delete: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
  edit: 'M15.2 5.2l3.6 3.6M4 20h4L19.3 8.7a1.5 1.5 0 000-2.1l-1.9-1.9a1.5 1.5 0 00-2.1 0L4 16v4z',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  help: 'M12 21a9 9 0 100-18 9 9 0 000 18zM9.5 9a2.5 2.5 0 014.6 1.3c0 1.7-2.1 2-2.1 3.2M12 17h.01',
  warning: 'M12 3L2 20h20L12 3zM12 9v5M12 17h.01',
  error: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15 9l-6 6M9 9l6 6',
  arrowBack: 'M19 12H5M11 18l-6-6 6-6',
  arrowForward: 'M5 12h14M13 6l6 6-6 6',
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9.5z',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0',
  accountCircle: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 13a3 3 0 100-6 3 3 0 000 6zM7 18.5a6 6 0 0110 0',
  calendarToday: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7zM16 3v4M8 3v4M4 11h16',
  event: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7zM16 3v4M8 3v4M4 11h16M12 15h4',
  mail: 'M4 6h16a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1zM4 7l8 6 8-6',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  share: 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  star: 'M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3z',
  favorite: 'M12 20s-7-4.4-9-8.8A5.2 5.2 0 0112 6a5.2 5.2 0 019 5.2C19 15.6 12 20 12 20z',
  locationOn: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  lock: 'M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1zM8 11V7a4 4 0 018 0v4',
  lockOpen: 'M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1zM8 11V7a4 4 0 017.5-1.8',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  shoppingCart: 'M3 4h2l2.4 10.2a1 1 0 001 .8h8.8a1 1 0 001-.8L20 7H6M10 19a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM17 19a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  payment: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 11h18',
  notifications: 'M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 20a2 2 0 01-3.4 0',
  visibility: 'M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7zM12 15a3 3 0 100-6 3 3 0 000 6z',
  visibilityOff: 'M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c6.2 0 10 7 10 7a18.2 18.2 0 01-4 4.9M6.2 6.2C3.6 8.1 2 12 2 12s3.8 7 10 7a9.8 9.8 0 005.8-1.9',
  call: 'M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A15 15 0 014 6a2 2 0 011-2z',
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A15 15 0 014 6a2 2 0 011-2z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  moreHoriz: 'M5 12h.01M12 12h.01M19 12h.01',
  moreVert: 'M12 5h.01M12 12h.01M12 19h.01',
  play: 'M7 5l12 7-12 7V5z',
  pause: 'M8 5h3v14H8V5zM13 5h3v14h-3V5z',
  stop: 'M6 6h12v12H6V6z',
}

export function renderCatalogIcon(
  nameProp: unknown,
  size = 18,
  weightStyle?: React.CSSProperties,
): React.JSX.Element {
  if (typeof nameProp === 'object' && nameProp !== null && 'svgPath' in nameProp) {
    const svgPath = String((nameProp as { svgPath: unknown }).svgPath ?? '')
    return (
      <span className={css.icon} style={weightStyle} aria-hidden="true">
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d={svgPath} />
        </svg>
      </span>
    )
  }

  const key = typeof nameProp === 'string' ? nameProp : 'info'
  const path = ICON_PATHS[key] ?? ICON_PATHS.info!
  return (
    <span className={css.icon} style={weightStyle} role="img" aria-label={key}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </span>
  )
}
