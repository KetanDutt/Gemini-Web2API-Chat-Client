import { AnimatePresence, motion } from 'motion/react'
import { TopBar } from '@/components/layout/TopBar'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { useUI } from '@/stores/uiStore'
import { useIsMobile, usePrefersReducedMotion } from '@/hooks/useMediaQuery'
import { useSettings } from '@/stores/settingsStore'

const SIDEBAR_WIDTH = 288

export function AppLayout() {
  const sidebarOpen = useUI((s) => s.sidebarOpen)
  const drawerOpen = useUI((s) => s.drawerOpen)
  const setDrawerOpen = useUI((s) => s.setDrawerOpen)
  const isMobile = useIsMobile()
  const prefersReduced = usePrefersReducedMotion()
  const reduceMotion = useSettings((s) => s.reduceMotion) || prefersReduced
  const spring = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 40, mass: 0.8 }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="relative flex min-h-0 flex-1 gap-3 p-2 sm:p-3">
        {!isMobile && (
          <motion.aside
            initial={false}
            animate={{ width: sidebarOpen ? SIDEBAR_WIDTH : 0, opacity: sidebarOpen ? 1 : 0, marginRight: sidebarOpen ? 0 : -12 }}
            transition={spring}
            className="glass glass-2 shrink-0 overflow-hidden rounded-[var(--radius-glass-lg)]"
            aria-hidden={!sidebarOpen}
            style={{ pointerEvents: sidebarOpen ? 'auto' : 'none' }}
          >
            <div style={{ width: SIDEBAR_WIDTH }} className="h-full">
              <Sidebar />
            </div>
          </motion.aside>
        )}

        <ChatArea />

        <AnimatePresence>
          {isMobile && drawerOpen && (
            <>
              <motion.div
                key="scrim"
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                onClick={() => setDrawerOpen(false)}
              />
              <motion.aside
                key="drawer"
                className="glass glass-4 fixed inset-y-0 left-0 z-50 w-[min(86vw,320px)] rounded-r-[28px]"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={spring}
                role="dialog"
                aria-modal
                aria-label="Conversations"
                drag={reduceMotion ? false : 'x'}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0.4, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -80 || info.velocity.x < -400) setDrawerOpen(false)
                }}
              >
                <Sidebar isDrawer onNavigate={() => setDrawerOpen(false)} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
