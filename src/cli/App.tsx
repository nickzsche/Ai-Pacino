import { Box, useApp } from 'ink'
import type React from 'react'
import { useEffect, useState } from 'react'
import { parseCommand } from '../commands/parser'
import type { CommandRegistry } from '../commands/registry'
import type { Logger } from '../logging/logger'
import type { Provider } from '../provider/types'
import { truncateForContext } from '../session/context'
import type { SessionStore } from '../session/store'
import { ChatPanel } from './ChatPanel'
import { InputBar } from './InputBar'
import { StatusBar } from './StatusBar'
import type { AppStore } from './store'

interface Props {
  store: AppStore
  registry: CommandRegistry
  provider: Provider
  sessionStore: SessionStore
  contextWindow: number
  maxTokens: number
  logger: Logger
  onQuit(): void
}

export const App: React.FC<Props> = ({
  store,
  registry,
  provider,
  sessionStore,
  contextWindow,
  maxTokens,
  logger,
  onQuit,
}) => {
  const [, force] = useState(0)
  const [draft, setDraft] = useState('')
  const { exit } = useApp()

  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store])

  const state = store.getState()
  const session = sessionStore.getSession(state.currentSessionId)

  const handleSubmit = async (value: string) => {
    setDraft('')
    const parsed = parseCommand(value)
    if (parsed) {
      const cmd = registry.get(parsed.name)
      if (!cmd) {
        store.setStatusMessage(`unknown command: /${parsed.name}`)
        return
      }
      if (!session) {
        store.setStatusMessage('error: current session is missing — try /new')
        return
      }
      try {
        await cmd.run(
          {
            store: sessionStore,
            provider,
            logger,
            state: {
              currentSession: session,
              setCurrentSession(s) {
                store.setSession(
                  s.id,
                  s.model,
                  sessionStore.getMessages(s.id).map((m) => ({ role: m.role, content: m.content })),
                )
              },
              setStatusMessage: (m) => store.setStatusMessage(m),
              quit: () => {
                onQuit()
                exit()
              },
            },
          },
          parsed.args,
        )
      } catch (err) {
        logger.error('command failed', { err: (err as Error).message })
        store.setStatusMessage(`error: ${(err as Error).message}`)
      }
      return
    }

    const sid = state.currentSessionId
    store.setBusy(true)
    store.setStatusMessage('')

    try {
      sessionStore.appendMessage(sid, { role: 'user', content: value })
      store.appendMessage({ role: 'user', content: value })

      const allMessages = store.getState().messages
      const { messages: trimmed } = truncateForContext(allMessages, {
        contextWindow,
        reserveOutput: maxTokens,
      })

      for await (const chunk of provider.streamMessage({
        model: state.currentModel,
        messages: trimmed,
        maxTokens,
      })) {
        if (chunk.type === 'text') {
          store.appendStreaming(chunk.text)
        } else if (chunk.type === 'usage') {
          store.setTokenUsage({
            input: chunk.input,
            output: chunk.output,
            window: contextWindow,
          })
        } else if (chunk.type === 'error') {
          store.setStatusMessage(`error: ${chunk.error.message}`)
          store.finalizeStreaming()
          break
        } else if (chunk.type === 'done') {
          const finalText = store.getState().streamingText
          store.finalizeStreaming()
          if (finalText.length > 0) {
            try {
              const stored = sessionStore.appendMessage(sid, {
                role: 'assistant',
                content: finalText,
              })
              const usage = store.getState().tokenUsage
              sessionStore.updateUsage(stored.id, { input: usage.input, output: usage.output })
            } catch (err) {
              logger.error('failed to persist assistant message', { err: (err as Error).message })
              store.setStatusMessage(
                `warning: assistant reply not saved (${(err as Error).message})`,
              )
            }
          }
        }
      }
    } catch (err) {
      logger.error('handleSubmit failed', { err: (err as Error).message })
      store.setStatusMessage(`error: ${(err as Error).message}`)
      store.finalizeStreaming()
    } finally {
      store.setBusy(false)
    }
  }

  return (
    <Box flexDirection="column">
      <ChatPanel messages={state.messages} streamingText={state.streamingText} />
      <StatusBar
        model={state.currentModel}
        sessionTitle={session?.title ?? 'unknown'}
        usage={state.tokenUsage}
        busy={state.busy}
        statusMessage={state.statusMessage}
      />
      <InputBar value={draft} onChange={setDraft} onSubmit={handleSubmit} disabled={state.busy} />
    </Box>
  )
}
