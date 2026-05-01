import { Box, Text, useInput } from 'ink'
import type React from 'react'

interface Props {
  value: string
  onChange(next: string): void
  onSubmit(value: string): void
  disabled: boolean
}

export const InputBar: React.FC<Props> = ({ value, onChange, onSubmit, disabled }) => {
  useInput(
    (input, key) => {
      if (disabled) return
      if (key.return && !key.shift) {
        const trimmed = value.trim()
        if (trimmed.length > 0) onSubmit(trimmed)
        return
      }
      if (key.return && key.shift) {
        onChange(`${value}\n`)
        return
      }
      if (key.backspace || key.delete) {
        onChange(value.slice(0, -1))
        return
      }
      if (key.ctrl || key.meta) return
      if (input) onChange(value + input)
    },
    { isActive: !disabled },
  )

  const isCommand = value.startsWith('/')

  return (
    <Box
      borderStyle="round"
      borderColor={isCommand ? 'cyan' : 'gray'}
      paddingX={1}
      flexDirection="column"
    >
      <Box>
        <Text color={isCommand ? 'cyan' : 'green'}>{'❯ '}</Text>
        {value.length === 0 ? (
          <Text dimColor>type a message — / for commands, shift+enter for newline</Text>
        ) : (
          <Text>{value}</Text>
        )}
      </Box>
      {isCommand && (
        <Box>
          <Text dimColor>command mode — try /help</Text>
        </Box>
      )}
    </Box>
  )
}
