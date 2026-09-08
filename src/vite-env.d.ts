/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface Window {
  /** Present only when GlassGem is running inside the native Electron shell. */
  glassgem?: {
    isDesktop: boolean
    platform: string
    electronVersion: string
    openExternal: (url: string) => Promise<boolean>
  }
}
