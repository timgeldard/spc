declare module '@carbon/ai-chat' {
  import type { ComponentType, ReactElement } from 'react'

  export interface MessageRequest {
    input?: {
      text?: string
    }
  }

  export interface CustomSendMessageOptions {
    signal?: AbortSignal
  }

  export interface ChatInstance {
    messaging: {
      addMessage(message: {
        output: {
          generic: Array<{
            response_type: 'text'
            text: string
          }>
        }
      }): Promise<void>
    }
  }

  export interface ChatCustomElementProps {
    className?: string
    assistantName?: string
    openChatByDefault?: boolean
    disableCustomElementMobileEnhancements?: boolean
    onBeforeRender?: (instance: ChatInstance) => Promise<void> | void
    messaging?: {
      customSendMessage?: (
        request: MessageRequest,
        opts: CustomSendMessageOptions,
        instance: ChatInstance,
      ) => Promise<void>
      skipWelcome?: boolean
      messageTimeoutSecs?: number
    }
    homescreen?: {
      isEnabled?: boolean
      starterButtons?: {
        isEnabled?: boolean
        buttons?: Array<{ label: string }>
      }
    }
  }

  export const ChatCustomElement: ComponentType<ChatCustomElementProps>
  export type { ChatInstance, MessageRequest, CustomSendMessageOptions }
}
