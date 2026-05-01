import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import type React from 'react'
import { ChatPanel } from '../../src/cli/ChatPanel'

describe('ChatPanel', () => {
  it('renders empty placeholder when no messages', () => {
    const { lastFrame } = render(<ChatPanel messages={[]} streamingText="" />)
    expect(lastFrame()).toMatch(/start a conversation/i)
  })

  it('renders user and assistant messages with role labels', () => {
    const { lastFrame } = render(
      <ChatPanel
        messages={[
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ]}
        streamingText=""
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/you/i)
    expect(frame).toMatch(/hello/i)
    expect(frame).toMatch(/claude/i)
    expect(frame).toMatch(/hi there/i)
  })

  it('renders streaming text below messages', () => {
    const { lastFrame } = render(
      <ChatPanel messages={[{ role: 'user', content: 'q' }]} streamingText="streaming response" />,
    )
    expect(lastFrame()).toMatch(/streaming response/)
  })
})
