import { useCallback, useRef, useState } from 'react'
import {
  ChatCustomElement,
  type ChatInstance,
  type MessageRequest,
  type CustomSendMessageOptions,
} from '@carbon/ai-chat'
import { useSPC } from '../SPCContext'
import type { SPCState } from '../types'

const GENIE_SPACE_ID = (import.meta as { env: Record<string, string> }).env?.VITE_GENIE_SPACE_ID ?? ''

function buildContextPrefix(state: SPCState): string {
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
  const { state } = useSPC()
  const conversationIdRef = useRef<string | null>(null)
  const [chatClass] = useState('spc-genie-chat')

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
      <ChatCustomElement
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
    </div>
  )
}
