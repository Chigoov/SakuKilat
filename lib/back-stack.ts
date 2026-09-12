/**
 * SakuKilat — Back Navigation Stack
 *
 * Lightweight LIFO navigation stack managing sublayer back navigation.
 * Standardized across Web and Mobile WebView via HTML5 History popstate.
 *
 * When a modal, sheet, or sublayer opens:
 *   pushBackLayer({ id: 'modal-id', type: 'modal', onClose: () => setOpen(false) })
 *
 * When back is pressed (browser back, mobile back gesture, or hardware back):
 *   Browser triggers popstate -> topmost layer is popped and its onClose() is invoked.
 *
 * When closed programmatically (e.g. clicking "X" or backdrop):
 *   removeBackLayer('modal-id') safely synchronizes history without double-invoking onClose.
 */

export interface BackLayer {
  id: string
  type: 'modal' | 'sheet' | 'sublayer' | 'dialog'
  onClose: () => void
}

export type BackActionResult = 'layer-closed' | 'tab-navigated' | 'exit-prompt' | 'app-exited'

export interface BackActionContext {
  activeTab?: string
  onNavigateTab?: (tab: string) => void
  onExitApp?: () => void
  onShowExitPrompt?: () => void
  /** Optional custom timestamp provider for unit tests (defaults to Date.now()) */
  now?: () => number
}

// Private stack state (module-level singleton)
const stack: BackLayer[] = []
let initialized = false
let isProgrammaticBack = false
let lastBackPressTime = 0
export const DOUBLE_BACK_WINDOW_MS = 2000

export function resetBackPressTimer(): void {
  lastBackPressTime = 0
}

export function exitNativeApp(): void {
  if (typeof window !== 'undefined') {
    const bridge = (window as unknown as { SakuKilatAndroid?: { exitApp?: () => void } }).SakuKilatAndroid
    if (bridge?.exitApp) {
      bridge.exitApp()
    }
  }
}

/**
 * Pure back-action evaluation engine.
 * Determines the exact action to execute based on open layers, current tab, and exit timing.
 */
export function handleBackAction(ctx: BackActionContext = {}): BackActionResult {
  // 1. If any modal / sheet / sublayer is open, pop and close the topmost layer
  if (stack.length > 0) {
    popBackLayer()
    resetBackPressTimer()
    return 'layer-closed'
  }

  const activeTab = ctx.activeTab ?? 'beranda'

  // 2. If no layer is open and active tab is not 'beranda', return to 'beranda'
  if (activeTab !== 'beranda') {
    ctx.onNavigateTab?.('beranda')
    resetBackPressTimer()
    return 'tab-navigated'
  }

  // 3. If on 'beranda', require double-tap within 2000ms before exit
  const getNow = ctx.now ?? (() => Date.now())
  const currentTime = getNow()
  if (currentTime - lastBackPressTime <= DOUBLE_BACK_WINDOW_MS && lastBackPressTime > 0) {
    resetBackPressTimer()
    const doExit = ctx.onExitApp ?? exitNativeApp
    doExit()
    return 'app-exited'
  }

  lastBackPressTime = currentTime
  ctx.onShowExitPrompt?.()
  return 'exit-prompt'
}


/**
 * Push a new layer onto the back stack.
 * Adds a history entry so browser / WebView back will close it.
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
 * Remove a specific layer by ID (used when layer closes itself, not via back button).
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
  resetBackPressTimer()
}

/**
 * Initialize the back-stack popstate listener. Call once at app mount.
 * Returns cleanup function.
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

  const handlePush = (event: Event) => {
    const detail = (event as CustomEvent<BackLayer>).detail
    if (detail) pushBackLayer(detail)
  }

  const handlePop = () => {
    popBackLayer()
  }

  window.addEventListener('sakukilat:back-layer-push', handlePush as EventListener)
  window.addEventListener('sakukilat:back-layer-pop', handlePop)

  return () => {
    initialized = false
    window.removeEventListener('popstate', handlePopState)
    window.removeEventListener('sakukilat:back-layer-push', handlePush as EventListener)
    window.removeEventListener('sakukilat:back-layer-pop', handlePop)
    clearBackStack()
  }
}
