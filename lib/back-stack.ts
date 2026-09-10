/**
 * SakuKilat — Back Navigation Stack
 *
 * Lightweight navigation layer stack for managing sublayer back behavior.
 * Works with browser popstate and Capacitor hardware back button.
 *
 * Usage:
 *   pushBackLayer({ id: 'edit-modal', type: 'modal', onClose: () => setOpen(false) })
 *   popBackLayer()  // or let back button / gesture handle it
 *
 * Integration points:
 *   - Browser: popstate event
 *   - Android: Capacitor App.addListener('backButton')
 *   - Custom: sakukilat:back-layer-push / sakukilat:back-layer-pop events
 */

export interface BackLayer {
  id: string
  type: 'modal' | 'sheet' | 'sublayer' | 'dialog'
  onClose: () => void
}

// Private stack state (module-level singleton)
const stack: BackLayer[] = []
let initialized = false
let isProgrammaticBack = false

/**
 * Push a new layer onto the back stack.
 * Adds a history entry so browser back / Android back will close it.
 */
export function pushBackLayer(layer: BackLayer): void {
  // Prevent duplicate push of same ID
  if (stack.some(l => l.id === layer.id)) return
  stack.push(layer)
  if (typeof window !== 'undefined' && typeof history !== 'undefined') {
    try {
      history.pushState({ sakukilatLayer: layer.id }, '')
    } catch {
      // Ignore pushState errors in restricted environments
    }
  }
}

/**
 * Pop the topmost layer off the stack and call its onClose.
 * Returns true if a layer was closed, false if stack was empty.
 */
export function popBackLayer(): boolean {
  const layer = stack.pop()
  if (!layer) return false
  layer.onClose()
  if (typeof window !== 'undefined' && typeof history !== 'undefined') {
    try {
      if (history.state?.sakukilatLayer === layer.id) {
        isProgrammaticBack = true
        history.back()
      }
    } catch {
      // Ignore
    }
  }
  return true
}

/**
 * Remove a specific layer by ID (used when layer closes itself, not via back).
 * Does NOT call onClose (the caller already closed it).
 * Also cleans up history entry if this layer was at the top.
 */
export function removeBackLayer(id: string): void {
  const index = stack.findIndex(l => l.id === id)
  if (index < 0) return

  const isTop = index === stack.length - 1
  stack.splice(index, 1)

  if (isTop && typeof window !== 'undefined' && typeof history !== 'undefined') {
    try {
      if (history.state?.sakukilatLayer === id) {
        isProgrammaticBack = true
        history.back()
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Peek at the top layer without removing it.
 */
export function peekBackLayer(): BackLayer | undefined {
  return stack[stack.length - 1]
}

/**
 * Get current stack depth.
 */
export function backStackDepth(): number {
  return stack.length
}

/**
 * Clear the entire stack without calling onClose on any layer.
 */
export function clearBackStack(): void {
  stack.length = 0
}

/**
 * Initialize the back-stack popstate listener. Call once at app mount.
 * Handles both browser back and Capacitor hardware back.
 */
export function initBackStack(): () => void {
  if (typeof window === 'undefined' || initialized) return () => {}
  initialized = true

  const handlePopState = (_event: PopStateEvent) => {
    if (isProgrammaticBack) {
      isProgrammaticBack = false
      return
    }
    if (stack.length > 0) {
      const layer = stack.pop()
      if (layer) layer.onClose()
    }
  }

  window.addEventListener('popstate', handlePopState)

  // Custom event support for programmatic push/pop
  const handlePush = (event: Event) => {
    const detail = (event as CustomEvent<BackLayer>).detail
    if (detail) pushBackLayer(detail)
  }

  const handlePop = () => {
    popBackLayer()
  }

  window.addEventListener('sakukilat:back-layer-push', handlePush as EventListener)
  window.addEventListener('sakukilat:back-layer-pop', handlePop)

  // Capacitor hardware back button (access via global Capacitor runtime if present)
  let capacitorCleanup: (() => void) | null = null
  try {
    const win = window as unknown as {
      Capacitor?: {
        Plugins?: {
          App?: {
            addListener: (
              event: string,
              cb: () => void
            ) => Promise<{ remove: () => void }>
          }
        }
      }
    }
    const App = win.Capacitor?.Plugins?.App
    if (App?.addListener) {
      const listenerPromise = App.addListener('backButton', () => {
        if (stack.length > 0) {
          const layer = stack.pop()
          if (layer) {
            layer.onClose()
            if (typeof history !== 'undefined') {
              try {
                if (history.state?.sakukilatLayer === layer.id) {
                  isProgrammaticBack = true
                  history.back()
                }
              } catch {
                // Ignore
              }
            }
          }
        }
      })
      capacitorCleanup = () => {
        void listenerPromise.then(l => l.remove())
      }
    }
  } catch {
    // Not running in Capacitor — ignore
  }

  return () => {
    initialized = false
    window.removeEventListener('popstate', handlePopState)
    window.removeEventListener('sakukilat:back-layer-push', handlePush as EventListener)
    window.removeEventListener('sakukilat:back-layer-pop', handlePop)
    capacitorCleanup?.()
  }
}
