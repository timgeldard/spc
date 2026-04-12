import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, TextArea } from '~/lib/carbon-forms'
import { InlineLoading, InlineNotification } from '~/lib/carbon-feedback'
import { Stack, Tile } from '~/lib/carbon-layout'
import { shallowEqual, useSPCSelector } from '../SPCContext'
import type { SPCState } from '../types'

const GENIE_SPACE_ID = (import.meta as { env: Record<string, string> }).env?.VITE_GENIE_SPACE_ID ?? ''
const STARTER_PROMPTS = [
  'OOC summary for current material',
  'Which MICs have Cpk below 1.33?',
  'Show recent batches with signals',
  'Compare process capability by plant',
] as const

interface GenieMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  error?: boolean
}

function buildContextPrefix(
  state: Pick<SPCState, 'selectedMaterial' | 'selectedPlant' | 'selectedMIC' | 'dateFrom' | 'dateTo'>,
): string {
  const parts: string[] = []

  if (state.selectedMaterial) {
    const mat = state.selectedMaterial.material_name
      ? `${state.selectedMaterial.material_name} (${state.selectedMaterial.material_id})`
      : state.selectedMaterial.material_id
    parts.push(`Material: ${mat}`)
  }

  if (state.selectedPlant) {
    const plant = state.selectedPlant.plant_name
      ? `${state.selectedPlant.plant_name} (${state.selectedPlant.plant_id})`
      : state.selectedPlant.plant_id
    parts.push(`Plant: ${plant}`)
  }

  if (state.selectedMIC) {
    const mic = state.selectedMIC.mic_name
      ? `${state.selectedMIC.mic_name} (${state.selectedMIC.mic_id})`
      : state.selectedMIC.mic_id
    parts.push(`Characteristic: ${mic}`)
    if (state.selectedMIC.chart_type) parts.push(`Chart type: ${state.selectedMIC.chart_type}`)
  }

  if (state.dateFrom || state.dateTo) {
    parts.push(`Date range: ${state.dateFrom ?? '—'} to ${state.dateTo ?? '—'}`)
  }

  if (parts.length === 0) return ''
  return `[Analysis context — ${parts.join(', ')}]\n\n`
}

function buildScopeSummary(
  state: Pick<SPCState, 'selectedMaterial' | 'selectedPlant' | 'selectedMIC' | 'dateFrom' | 'dateTo'>,
): string[] {
  const summary: string[] = []
  if (state.selectedMaterial) {
    summary.push(`Material: ${state.selectedMaterial.material_name ?? state.selectedMaterial.material_id}`)
  }
  if (state.selectedPlant) {
    summary.push(`Plant: ${state.selectedPlant.plant_name ?? state.selectedPlant.plant_id}`)
  }
  if (state.selectedMIC) {
    summary.push(`Characteristic: ${state.selectedMIC.mic_name ?? state.selectedMIC.mic_id}`)
  }
  if (state.dateFrom || state.dateTo) {
    summary.push(`Date range: ${state.dateFrom ?? '—'} to ${state.dateTo ?? '—'}`)
  }
  return summary
}

async function sendToGenie(
  text: string,
  conversationId: string | null,
  signal: AbortSignal,
): Promise<{ answer: string; conversation_id: string }> {
  const res = await fetch('/api/spc/genie/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, conversation_id: conversationId }),
    signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

function createMessage(role: GenieMessage['role'], text: string, error = false): GenieMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    error,
  }
}

export default function GenieView() {
  const state = useSPCSelector(
    current => ({
      selectedMaterial: current.selectedMaterial,
      selectedPlant: current.selectedPlant,
      selectedMIC: current.selectedMIC,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
    }),
    shallowEqual,
  )
  const conversationIdRef = useRef<string | null>(null)
  const requestControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [messages, setMessages] = useState<GenieMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [composerError, setComposerError] = useState<string | null>(null)

  const scopeKey = useMemo(
    () =>
      JSON.stringify({
        materialId: state.selectedMaterial?.material_id ?? null,
        plantId: state.selectedPlant?.plant_id ?? null,
        micId: state.selectedMIC?.mic_id ?? null,
        operationId: state.selectedMIC?.operation_id ?? null,
        dateFrom: state.dateFrom ?? null,
        dateTo: state.dateTo ?? null,
      }),
    [
      state.selectedMaterial?.material_id,
      state.selectedPlant?.plant_id,
      state.selectedMIC?.mic_id,
      state.selectedMIC?.operation_id,
      state.dateFrom,
      state.dateTo,
    ],
  )
  const scopeSummary = useMemo(() => buildScopeSummary(state), [state])

  useEffect(() => {
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    conversationIdRef.current = null
    setMessages([])
    setDraft('')
    setSending(false)
    setComposerError(null)
  }, [scopeKey])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  useEffect(() => () => {
    requestControllerRef.current?.abort()
  }, [])

  const submitPrompt = useCallback(async (rawText: string) => {
    const text = rawText.trim()
    if (!text || sending) return

    setComposerError(null)
    setMessages(prev => [...prev, createMessage('user', text)])
    setDraft('')
    setSending(true)

    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller

    const isFirstMessage = conversationIdRef.current === null
    const contextPrefix = isFirstMessage ? buildContextPrefix(state) : ''
    const messageWithContext = `${contextPrefix}${text}`

    try {
      const data = await sendToGenie(messageWithContext, conversationIdRef.current, controller.signal)
      if (requestControllerRef.current !== controller) return
      conversationIdRef.current = data.conversation_id
      setMessages(prev => [...prev, createMessage('assistant', data.answer)])
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      const message = error instanceof Error ? error.message : 'Unexpected error'
      setMessages(prev => [...prev, createMessage('assistant', `Genie error: ${message}`, true)])
      setComposerError(message)
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
        setSending(false)
      }
    }
  }, [sending, state])

  const handleSubmit = useCallback(() => {
    void submitPrompt(draft)
  }, [draft, submitPrompt])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void submitPrompt(draft)
    }
  }, [draft, submitPrompt])

  return (
    <div className="spc-genie-container">
      {!GENIE_SPACE_ID && (
        <div className="spc-genie-unconfigured">
          <p>
            <strong>Genie is not configured.</strong> Set the{' '}
            <code>VITE_GENIE_SPACE_ID</code> build variable and{' '}
            <code>GENIE_SPACE_ID</code> app environment variable to your
            Databricks Genie space ID.
          </p>
        </div>
      )}

      <Tile className="spc-genie-shell">
        <Stack gap={5} style={{ height: '100%' }}>
          <div className="spc-genie-header">
            <div>
              <p className="spc-genie-eyebrow">Databricks Genie</p>
              <h3 className="spc-genie-title">Governed SPC assistant</h3>
              <p className="spc-genie-subtitle">
                Ask about capability, drift, OOC signals, or recent batches in the current SPC scope.
              </p>
            </div>
            <Button
              kind="ghost"
              size="sm"
              disabled={messages.length === 0 && !sending}
              onClick={() => {
                requestControllerRef.current?.abort()
                requestControllerRef.current = null
                conversationIdRef.current = null
                setMessages([])
                setSending(false)
                setComposerError(null)
              }}
            >
              New conversation
            </Button>
          </div>

          {scopeSummary.length > 0 ? (
            <div className="spc-genie-scope">
              {scopeSummary.map(item => (
                <span key={item} className="spc-genie-scope-pill">{item}</span>
              ))}
            </div>
          ) : null}

          {composerError ? (
            <InlineNotification
              kind="error"
              title="Genie request failed"
              subtitle={composerError}
              hideCloseButton
            />
          ) : null}

          <div className="spc-genie-chat">
            {messages.length === 0 ? (
              <div className="spc-genie-empty">
                <p className="spc-genie-empty-title">Start with a guided prompt</p>
                <p className="spc-genie-empty-subtitle">
                  The first message automatically includes the current material, plant, MIC, and date scope.
                </p>
                <div className="spc-genie-starters">
                  {STARTER_PROMPTS.map(prompt => (
                    <Button
                      key={prompt}
                      kind="tertiary"
                      size="sm"
                      onClick={() => {
                        void submitPrompt(prompt)
                      }}
                      disabled={sending}
                    >
                      {prompt}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="spc-genie-messages" aria-live="polite">
                {messages.map(message => (
                  <div
                    key={message.id}
                    className={`spc-genie-message spc-genie-message--${message.role}${message.error ? ' spc-genie-message--error' : ''}`}
                  >
                    <div className="spc-genie-message-meta">
                      {message.role === 'user' ? 'You' : 'Genie'}
                    </div>
                    <div className="spc-genie-message-body">
                      {message.text}
                    </div>
                  </div>
                ))}
                {sending ? (
                  <div className="spc-genie-message spc-genie-message--assistant">
                    <div className="spc-genie-message-meta">Genie</div>
                    <div className="spc-genie-message-body">
                      <InlineLoading description="Thinking through the current SPC scope..." status="active" />
                    </div>
                  </div>
                ) : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="spc-genie-composer">
            <TextArea
              id="spc-genie-composer"
              labelText="Ask Genie about the current SPC scope"
              placeholder="Ask about capability, signals, drift, or recent batches…"
              rows={3}
              value={draft}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
              helperText="Press Cmd/Ctrl + Enter to send."
            />
            <div className="spc-genie-actions">
              <Button kind="secondary" size="sm" onClick={() => setDraft('')} disabled={sending || draft.trim().length === 0}>
                Clear
              </Button>
              <Button kind="primary" size="sm" onClick={handleSubmit} disabled={sending || draft.trim().length === 0}>
                Send to Genie
              </Button>
            </div>
          </div>
        </Stack>
      </Tile>
    </div>
  )
}
