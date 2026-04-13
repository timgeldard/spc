import { useState, type ChangeEvent, type CSSProperties } from 'react'
import {
  Button,
  Search,
  Select,
  SelectItem,
} from '~/lib/carbon-forms'
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

const actionButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2.5rem',
  height: '2.5rem',
  border: 'none',
  background: 'transparent',
  color: 'var(--cds-text-primary)',
  cursor: 'pointer',
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
        selectedMultivariateMicIds: state.selectedMultivariateMicIds,
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
    <header
      aria-label="SPC Studio"
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: '3rem',
        padding: '0 1rem',
        borderBottom: '1px solid var(--cds-border-subtle-01)',
        background: 'var(--cds-layer)',
        position: 'relative',
      }}
    >
      {showMenuButton ? (
        <button
          type="button"
          aria-label={isSideNavExpanded ? 'Close menu' : 'Open menu'}
          aria-pressed={isSideNavExpanded}
          onClick={() => onClickSideNavExpand?.()}
          style={{ ...actionButtonStyle, marginRight: '0.25rem' }}
        >
          <span aria-hidden="true" style={{ fontSize: '1.125rem' }}>{isSideNavExpanded ? '×' : '☰'}</span>
        </button>
      ) : null}

      <a
        href="#"
        onClick={(event) => event.preventDefault()}
        style={{
          color: 'var(--cds-text-primary)',
          textDecoration: 'none',
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        SPC Studio
      </a>

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

      <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
        <button
          type="button"
          aria-label="Save current view"
          onClick={handleSaveView}
          style={actionButtonStyle}
        >
          <BookmarkAdd size={20} />
        </button>

        <button
          type="button"
          aria-label="Saved views"
          aria-pressed={savedViewsOpen}
          onClick={() => setSavedViewsOpen((open) => !open)}
          style={actionButtonStyle}
        >
          <Bookmark size={20} />
        </button>

        <button type="button" aria-label="Export data" style={actionButtonStyle}>
          <Download size={20} />
        </button>

        {onToggleDark ? (
          <button
            type="button"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={onToggleDark}
            style={actionButtonStyle}
          >
            {dark ? <Light size={20} /> : <Asleep size={20} />}
          </button>
        ) : null}

        <button
          type="button"
          aria-label={`Role: ${state.roleMode} — click to switch to ${nextRoleMode}`}
          onClick={() => dispatch({ type: 'SET_ROLE_MODE', payload: nextRoleMode })}
          style={actionButtonStyle}
        >
          <UserRole size={20} />
        </button>

        <button type="button" aria-label="User profile" style={actionButtonStyle}>
          <UserAvatar size={20} />
        </button>
      </div>

      {savedViewsOpen ? (
        <div
          aria-label="Saved views"
          style={{
            position: 'absolute',
            top: '100%',
            right: '1rem',
            zIndex: 20,
            width: '22rem',
            padding: '1rem',
            border: '1px solid var(--cds-border-subtle-01)',
            background: 'var(--cds-layer)',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.12)',
          }}
        >
          <p
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              margin: '0 0 0.75rem',
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
      ) : null}
    </header>
  )
}
