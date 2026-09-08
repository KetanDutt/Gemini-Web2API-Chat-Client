import { Bug, HelpCircle, PanelLeft, Settings, Menu as MenuIcon, Search } from 'lucide-react'
import { useUI } from '@/stores/uiStore'
import { useSettings } from '@/stores/settingsStore'
import { Tooltip } from '@/components/ui/Tooltip'
import { Logo } from './Logo'
import { ConnectionStatus } from './ConnectionStatus'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { modKey } from '@/lib/utils'

export function TopBar() {
  const toggleSidebar = useUI((s) => s.toggleSidebar)
  const setDrawerOpen = useUI((s) => s.setDrawerOpen)
  const openDialog = useUI((s) => s.openDialog)
  const debugPanel = useSettings((s) => s.debugPanel)
  const isMobile = useIsMobile()
  const mod = modKey()

  return (
    <header className="glass glass-1 glass-flat relative z-30 flex h-[52px] shrink-0 items-center justify-between border-x-0 border-t-0 px-2.5 shadow-none sm:px-3" style={{ borderRadius: 0 }}>
      <div className="flex items-center gap-1">
        {isMobile ? (
          <button className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Open conversations">
            <MenuIcon size={19} />
          </button>
        ) : (
          <Tooltip content="Toggle sidebar" shortcut={`${mod}+B`}>
            <button className="icon-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
              <PanelLeft size={19} />
            </button>
          </Tooltip>
        )}
        <div className="ml-1">
          <Logo compact={isMobile} />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ConnectionStatus compact={isMobile} />
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
