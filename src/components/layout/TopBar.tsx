import { Bug, HelpCircle, PanelLeft, Settings, Menu as MenuIcon, Search } from 'lucide-react'
import { useUI } from '@/stores/uiStore'
import { useSettings } from '@/stores/settingsStore'
import { Tooltip } from '@/components/ui/Tooltip'
import { Logo } from './Logo'
import { ConnectionStatus } from './ConnectionStatus'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { cn, modKey } from '@/lib/utils'

/** App chrome. Transparent — the glass panels below are the material; this row is quiet. */
export function TopBar() {
  const toggleSidebar = useUI((s) => s.toggleSidebar)
  const sidebarOpen = useUI((s) => s.sidebarOpen)
  const setDrawerOpen = useUI((s) => s.setDrawerOpen)
  const openDialog = useUI((s) => s.openDialog)
  const debugPanel = useSettings((s) => s.debugPanel)
  const isMobile = useIsMobile()
  const mod = modKey()

  return (
    <header className="relative z-(--z-nav) flex h-[52px] shrink-0 items-center justify-between px-2.5 sm:px-3">
      <div className="flex items-center gap-1">
        {isMobile ? (
          <button className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open conversations">
            <MenuIcon size={19} />
          </button>
        ) : (
          <Tooltip content={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} shortcut={`${mod}+B`}>
            <button className={cn('icon-btn', sidebarOpen && 'text-fg')} onClick={toggleSidebar} aria-label="Toggle sidebar" aria-pressed={sidebarOpen}>
              <PanelLeft size={19} className={cn('transition-transform duration-(--duration-base) ease-(--ease-spring)', !sidebarOpen && 'scale-x-[-1]')} />
            </button>
          </Tooltip>
        )}
        <div className="ml-1">
          <Logo compact={isMobile} />
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <ConnectionStatus compact={isMobile} />
        <span className="mx-1 hidden h-5 w-px bg-line-strong sm:block" aria-hidden />
        <Tooltip content="Search" shortcut={`${mod}+K`}>
          <button className="icon-btn" onClick={() => openDialog('search')} aria-label="Search conversations">
            <Search size={18} />
          </button>
        </Tooltip>
        {debugPanel && (
          <Tooltip content="Debug panel">
            <button className="icon-btn" onClick={() => openDialog('debug')} aria-label="Open debug panel">
              <Bug size={18} />
            </button>
          </Tooltip>
        )}
        {!isMobile && (
          <Tooltip content="Keyboard shortcuts" shortcut={`${mod}+Shift+/`}>
            <button className="icon-btn" onClick={() => openDialog('shortcuts')} aria-label="Keyboard shortcuts">
              <HelpCircle size={18} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Settings" shortcut={`${mod}+Shift+S`}>
          <button className="icon-btn" onClick={() => openDialog('settings')} aria-label="Settings">
            <Settings size={18} />
          </button>
        </Tooltip>
      </div>
    </header>
  )
}
