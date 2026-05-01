import { Box, Text } from 'ink'
import type React from 'react'
import type { ChatMessage } from '../provider/types'
import { renderMarkdown } from './markdown'

interface Props {
  messages: ChatMessage[]
  streamingText: string
}

const roleLabel = (role: ChatMessage['role']): { label: string; color: string } => {
  if (role === 'user') return { label: 'you', color: 'cyan' }
  if (role === 'assistant') return { label: 'claude', color: 'magenta' }
  return { label: 'system', color: 'gray' }
}

export const ChatPanel: React.FC<Props> = ({ messages, streamingText }) => {
  if (messages.length === 0 && streamingText.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>Start a conversation — type a message and press Enter.</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {messages.map((m, i) => {
        const { label, color } = roleLabel(m.role)
        const key = `${m.role}-${i}`
        return (
          <Box key={key} flexDirection="column" marginBottom={1}>
            <Text color={color} bold>
              {label}
            </Text>
            <Text>{renderMarkdown(m.content)}</Text>
          </Box>
        )
      })}
      {streamingText.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="magenta" bold>
            claude
          </Text>
          <Text>{renderMarkdown(streamingText)}</Text>
        </Box>
      )}
    </Box>
  )
}
