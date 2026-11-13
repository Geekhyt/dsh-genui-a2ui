/**
 * Browser platform modules shared by the DSH 0.2.x web shell through its frozen
 * `staticModules` table (`dsh-web-frontend`).
 *
 * Note: `zod` is intentionally omitted here — DSH 0.2.x ships Zod v4 in its
 * static table, whereas `@a2ui/web_core@0.15.0` requires Zod v3 (`^3.25.76`),
 * so `zod` is bundled privately inside `dsh-genui-a2ui`.
 */
export const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const
