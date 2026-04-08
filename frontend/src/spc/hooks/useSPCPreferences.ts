import { useEffect } from 'react'
import { useSPC } from '../SPCContext'
import { PREF_EXCLUDE_OUTLIERS, PREF_LIMITS_MODE, PREF_RULE_SET } from '../SPCContext'

/**
 * Persists analysis preferences (rule set, outlier exclusion, limits mode) to
 * localStorage so they survive page reloads. These are per-analyst preferences,
 * not shareable state — they are NOT reflected in the URL.
 *
 * Initial values are restored synchronously via buildInitialState() in SPCContext.
 * This hook only handles the write direction: state → localStorage.
 */
export function useSPCPreferences(): void {
  const { state } = useSPC()

  useEffect(() => {
    try { localStorage.setItem(PREF_RULE_SET, state.ruleSet) } catch { /* ignore */ }
  }, [state.ruleSet])

  useEffect(() => {
    try { localStorage.setItem(PREF_EXCLUDE_OUTLIERS, String(state.excludeOutliers)) } catch { /* ignore */ }
  }, [state.excludeOutliers])

  useEffect(() => {
    try { localStorage.setItem(PREF_LIMITS_MODE, state.limitsMode) } catch { /* ignore */ }
  }, [state.limitsMode])
}
