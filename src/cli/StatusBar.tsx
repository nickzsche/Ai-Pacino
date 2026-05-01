import { Box, Text } from 'ink'
import type React from 'react'

interface Props {
  model: string
  sessionTitle: string
  usage: { input: number; output: number; window: number }
  busy: boolean
  statusMessage: string
}

const fmtTokens = (n: number): string => {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

export const StatusBar: React.FC<Props> = ({ model, sessionTitle, usage, busy, statusMessage }) => {
  const usedTokens = usage.input + usage.output
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>
        <Text color="magenta">{model}</Text>
        <Text dimColor> · </Text>
        <Text>{sessionTitle}</Text>
        <Text dimColor> · </Text>
        <Text color="yellow">
          {fmtTokens(usedTokens)} / {fmtTokens(usage.window)}
        </Text>
        {busy && (
          <>
            <Text dimColor> · </Text>
            <Text color="green">thinking…</Text>
          </>
        )}
        {statusMessage && (
          <>
            <Text dimColor> · </Text>
            <Text color="cyan">{statusMessage}</Text>
          </>
        )}
      </Text>
    </Box>
  )
}
