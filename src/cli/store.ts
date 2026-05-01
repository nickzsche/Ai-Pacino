import type { ChatMessage } from '../provider/types'

export interface AppState {
  currentSessionId: string
  currentModel: string
  messages: ChatMessage[]
  streamingText: string
  statusMessage: string
  tokenUsage: { input: number; output: number; window: number }
  busy: boolean
}

export interface AppStore {
  getState(): AppState
  subscribe(fn: () => void): () => void
  appendMessage(m: ChatMessage): void
  appendStreaming(text: string): void
  finalizeStreaming(): void
  setMessages(messages: ChatMessage[]): void
  setStatusMessage(msg: string): void
  setBusy(busy: boolean): void
  setTokenUsage(u: { input: number; output: number; window: number }): void
  setSession(id: string, model: string, messages: ChatMessage[]): void
}

export interface AppStoreInit {
  currentSessionId: string
  currentModel: string
  contextWindow?: number
}

export const createAppStore = (init: AppStoreInit): AppStore => {
  let state: AppState = {
    currentSessionId: init.currentSessionId,
    currentModel: init.currentModel,
    messages: [],
    streamingText: '',
    statusMessage: '',
    tokenUsage: { input: 0, output: 0, window: init.contextWindow ?? 200_000 },
    busy: false,
  }
  const subs = new Set<() => void>()
  const notify = () => {
    for (const s of subs) s()
  }
  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch }
    notify()
  }
  return {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
    appendMessage(m) {
      set({ messages: [...state.messages, m] })
    },
    appendStreaming(text) {
      set({ streamingText: state.streamingText + text })
    },
    finalizeStreaming() {
      const text = state.streamingText
      const msgs =
        text.length > 0
          ? [...state.messages, { role: 'assistant' as const, content: text }]
          : state.messages
      set({ messages: msgs, streamingText: '' })
    },
    setMessages(messages) {
      set({ messages })
    },
    setStatusMessage(msg) {
      set({ statusMessage: msg })
    },
    setBusy(busy) {
      set({ busy })
    },
    setTokenUsage(u) {
      set({ tokenUsage: u })
    },
    setSession(id, model, messages) {
      set({ currentSessionId: id, currentModel: model, messages, streamingText: '' })
    },
  }
}
