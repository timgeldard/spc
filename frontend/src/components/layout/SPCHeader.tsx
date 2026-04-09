import { useState, type ChangeEvent } from 'react'
import {
  Button,
  Search,
  Select,
  SelectItem,
} from '~/lib/carbon-forms'
import {
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderName,
  HeaderPanel,
} from '~/lib/carbon-shell'
import Asleep from '@carbon/icons-react/es/Asleep.js'
import Bookmark from '@carbon/icons-react/es/Bookmark.js'
import BookmarkAdd from '@carbon/icons-react/es/BookmarkAdd.js'
import Download from '@carbon/icons-react/es/Download.js'
import Light from '@carbon/icons-react/es/Light.js'
import UserAvatar from '@carbon/icons-react/es/UserAvatar.js'
import UserRole from '@carbon/icons-react/es/UserRole.js'
import { useSPC } from '../../spc/SPCContext'

interface SPCHeaderProps {
  dark?: boolean
  onToggleDark?: () => void
  showMenuButton?: boolean
  isSideNavExpanded?: boolean
  onClickSideNavExpand?: () => void
}

export function SPCHeader({
  dark = false,
  onToggleDark,
  showMenuButton = false,
  isSideNavExpanded = false,
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
      {showMenuButton && (
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? 'Close menu' : 'Open menu'}
          isActive={isSideNavExpanded}
          onClick={() => onClickSideNavExpand?.()}
        />
      )}

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
            <>
              <Select
                id="spc-saved-view-select"
                labelText="Apply saved view"
                defaultValue=""
                onChange={handleApplySavedView}
              >
                <SelectItem value="" text="Select a saved view…" disabled hidden />
                {state.savedViews.map((view) => (
                  <SelectItem key={view.id} value={view.id} text={view.name} />
                ))}
              </Select>

              <Button
                kind="ghost"
                size="sm"
                style={{ marginTop: '1rem' }}
                onClick={() => setSavedViewsOpen(false)}
              >
                Close
              </Button>
            </>
          )}
        </div>
      </HeaderPanel>
    </Header>
  )
}
