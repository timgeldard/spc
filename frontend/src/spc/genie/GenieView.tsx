import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import type { ChatInstance, MessageRequest, CustomSendMessageOptions } from '@carbon/ai-chat'
import { shallowEqual, useSPCSelector } from '../SPCContext'
import type { SPCState } from '../types'

const GENIE_SPACE_ID = (import.meta as { env: Record<string, string> }).env?.VITE_GENIE_SPACE_ID ?? ''

interface CarbonChatProps {
  key?: string
  className?: string
  assistantName: string
  openChatByDefault?: boolean
  messaging: {
    customSendMessage: (
      request: MessageRequest,
      opts: CustomSendMessageOptions,
      instance: ChatInstance,
    ) => Promise<void>
    skipWelcome?: boolean
    messageTimeoutSecs?: number
  }
  onBeforeRender?: (instance: ChatInstance) => Promise<void> | void
  disableCustomElementMobileEnhancements?: boolean
  homescreen?: {
    isEnabled: boolean
    starterButtons?: {
      isEnabled: boolean
      buttons: Array<{ label: string }>
    }
  }
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
  const [chatClass] = useState('spc-genie-chat')
  const [ChatCustomElement, setChatCustomElement] = useState<ComponentType<CarbonChatProps> | null>(null)
  const [chatLoadError, setChatLoadError] = useState<string | null>(null)
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

  useEffect(() => {
    conversationIdRef.current = null
  }, [scopeKey])

  useEffect(() => {
    let cancelled = false

    import('@carbon/ai-chat')
      .then(module => {
        if (cancelled) return
        setChatCustomElement(() => module.ChatCustomElement as ComponentType<CarbonChatProps>)
        setChatLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unable to load Genie chat runtime'
        setChatLoadError(message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const customSendMessage = useCallback(
    async (
      request: MessageRequest,
      opts: CustomSendMessageOptions,
      instance: ChatInstance,
    ): Promise<void> => {
      const text = (request as { input?: { text?: string } }).input?.text ?? ''
      if (!text.trim()) return

      // Prepend SPC context on the first message of each conversation so Genie
      // knows which material, plant, MIC and date window the user is looking at.
      const isFirstMessage = conversationIdRef.current === null
      const contextPrefix = isFirstMessage ? buildContextPrefix(state) : ''
      const messageWithContext = `${contextPrefix}${text}`

      try {
        const data = await sendToGenie(messageWithContext, conversationIdRef.current, opts.signal as AbortSignal)
        conversationIdRef.current = data.conversation_id

        await instance.messaging.addMessage({
          output: {
            generic: [{ response_type: 'text', text: data.answer }],
          },
        })
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        const msg = err instanceof Error ? err.message : 'Unexpected error'
        await instance.messaging.addMessage({
          output: {
            generic: [{ response_type: 'text', text: `Genie error: ${msg}` }],
          },
        })
      }
    },
    [state],
  )

  const handleBeforeRender = useCallback(async (_instance: ChatInstance) => {
    // Reset conversation when the view re-mounts (new material/MIC selection)
    conversationIdRef.current = null
  }, [])

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
      {chatLoadError && (
        <div className="spc-genie-unconfigured">
          <p>
            <strong>Genie chat failed to load.</strong> {chatLoadError}
          </p>
        </div>
      )}
      {ChatCustomElement ? (
        <ChatCustomElement
          key={scopeKey}
          className={chatClass}
          assistantName="Databricks Genie"
          openChatByDefault
          messaging={{
            customSendMessage,
            skipWelcome: true,
            messageTimeoutSecs: 90,
          }}
          onBeforeRender={handleBeforeRender}
          disableCustomElementMobileEnhancements
          homescreen={{
            isEnabled: true,
            starterButtons: {
              isEnabled: true,
              buttons: [
                { label: 'OOC summary for current material' },
                { label: 'Which MICs have Cpk below 1.33?' },
                { label: 'Show recent batches with signals' },
                { label: 'Compare process capability by plant' },
              ],
            },
          }}
        />
      ) : (
        <div className="spc-page-shell__loading">
          Loading Genie workspace…
        </div>
      )}
    </div>
  )
}
