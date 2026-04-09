import type { ChangeEvent } from 'react'
import { useState } from 'react'
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  HeaderPanel,
  Search,
} from '@carbon/react'
// Verify icon names against your installed @carbon/icons-react version:
// https://carbondesignsystem.com/elements/icons/library/
import {
  Asleep,       // dark mode (moon)
  Bookmark,     // open saved views panel
  BookmarkAdd,  // save current view
  Download,
  Light,        // light mode (sun)
  UserAvatar,   // user profile
  UserRole,     // role mode toggle
} from '@carbon/icons-react'
import { useSPC } from '../../spc/SPCContext'

interface SPCHeaderProps {
  dark?: boolean
  onToggleDark?: () => void
  isSideNavExpanded: boolean
  onClickSideNavExpand: () => void
}

export function SPCHeader({
  dark = false,
  onToggleDark,
  isSideNavExpanded,
  onClickSideNavExpand,
}: SPCHeaderProps) {
  const { state, dispatch } = useSPC()
  const [savedViewsOpen, setSavedViewsOpen] = useState(false)
  const nextRoleMode = state.roleMode === 'engineer' ? 'operator' : 'engineer'

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_GLOBAL_SEARCH', payload: e.target.value })
  }

  const handleSaveView = () => {
    const timestamp = new Date()
    const baseLabel =
      state.selectedMaterial?.material_name ??
      state.selectedMaterial?.material_id ??
      'SPC view'
    const timeLabel = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    dispatch({
      type: 'ADD_SAVED_VIEW',
      payload: {
        id: `view-${timestamp.getTime()}`,
        name: `${baseLabel} ${timeLabel}`,
        savedAt: timestamp.toISOString(),
        activeTab: state.activeTab,
        globalSearch: state.globalSearch,
        selectedMaterial: state.selectedMaterial,
        selectedPlant: state.selectedPlant,
        selectedMIC: state.selectedMIC,
        dateFrom: state.dateFrom,
        dateTo: state.dateTo,
        stratifyBy: state.stratifyBy,
      },
    })
  }

  const handleApplySavedView = (e: ChangeEvent<HTMLSelectElement>) => {
    const view = state.savedViews.find((v) => v.id === e.target.value)
    if (view) dispatch({ type: 'APPLY_SAVED_VIEW', payload: view })
    setSavedViewsOpen(false)
  }

  return (
    <Header aria-label="SPC Studio">
      <HeaderMenuButton
        aria-label={isSideNavExpanded ? 'Close menu' : 'Open menu'}
        isActive={isSideNavExpanded}
        onClick={() => onClickSideNavExpand()}
      />

      {/* prefix="" removes the default "IBM" company prefix */}
      <HeaderName href="#" prefix="">
        SPC Studio
      </HeaderName>

      {/* Centre search — fills flex space between HeaderName and HeaderGlobalBar.
          No Tailwind; uses inline flex layout and Carbon's own Search component. */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '0 1rem',
          maxWidth: '40rem',
        }}
      >
        <Search
          size="sm"
          labelText="Global search"
          placeholder="Search batch, lot, or material…"
          value={state.globalSearch}
          onChange={handleSearchChange}
        />
      </div>

      <HeaderGlobalBar>
        <HeaderGlobalAction
          aria-label="Save current view"
          onClick={handleSaveView}
          tooltipAlignment="center"
        >
          <BookmarkAdd size={20} />
        </HeaderGlobalAction>

        <HeaderGlobalAction
          aria-label="Saved views"
          isActive={savedViewsOpen}
          onClick={() => setSavedViewsOpen((o) => !o)}
          tooltipAlignment="center"
        >
          <Bookmark size={20} />
        </HeaderGlobalAction>

        <HeaderGlobalAction aria-label="Export data" tooltipAlignment="center">
          <Download size={20} />
        </HeaderGlobalAction>

        {onToggleDark && (
          <HeaderGlobalAction
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={onToggleDark}
            tooltipAlignment="center"
          >
            {dark ? <Light size={20} /> : <Asleep size={20} />}
          </HeaderGlobalAction>
        )}

        <HeaderGlobalAction
          aria-label={`Role: ${state.roleMode} — click to switch to ${nextRoleMode}`}
          onClick={() => dispatch({ type: 'SET_ROLE_MODE', payload: nextRoleMode })}
          tooltipAlignment="center"
        >
          <UserRole size={20} />
        </HeaderGlobalAction>

        <HeaderGlobalAction aria-label="User profile" tooltipAlignment="end">
          <UserAvatar size={20} />
        </HeaderGlobalAction>
      </HeaderGlobalBar>

      {/* Saved views panel — slides down below the Header when triggered */}
      <HeaderPanel aria-label="Saved views" expanded={savedViewsOpen}>
        <div style={{ padding: '1.5rem 1rem' }}>
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
              color: 'var(--cds-text-primary)',
            }}
          >
            Saved Views
          </p>

          {state.savedViews.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              No saved views yet. Click the bookmark icon to save the current scope.
            </p>
          ) : (
            /* Phase 2: replace with Carbon <Select> component */
            <select
              aria-label="Apply saved view"
              defaultValue=""
              onChange={handleApplySavedView}
              style={{
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid var(--cds-border-subtle)',
                background: 'var(--cds-layer)',
                color: 'var(--cds-text-primary)',
                outline: 'none',
              }}
            >
              <option value="" disabled>
                Select a saved view…
              </option>
              {state.savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </HeaderPanel>
    </Header>
  )
}
