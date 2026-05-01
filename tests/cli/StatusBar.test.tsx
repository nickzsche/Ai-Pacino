import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import type React from 'react'
import { StatusBar } from '../../src/cli/StatusBar'

describe('StatusBar', () => {
  it('renders model, session title, and token usage', () => {
    const { lastFrame } = render(
      <StatusBar
        model="claude-sonnet-4-6"
        sessionTitle="my chat"
        usage={{ input: 1234, output: 56, window: 200000 }}
        busy={false}
        statusMessage=""
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/claude-sonnet-4-6/)
    expect(frame).toMatch(/my chat/)
    expect(frame).toMatch(/200k/)
  })

  it('shows busy indicator when busy', () => {
    const { lastFrame } = render(
      <StatusBar
        model="m"
        sessionTitle="s"
        usage={{ input: 0, output: 0, window: 1000 }}
        busy={true}
        statusMessage=""
      />,
    )
    expect(lastFrame()).toMatch(/thinking/i)
  })

  it('renders status message when set', () => {
    const { lastFrame } = render(
      <StatusBar
        model="m"
        sessionTitle="s"
        usage={{ input: 0, output: 0, window: 1000 }}
        busy={false}
        statusMessage="session loaded"
      />,
    )
    expect(lastFrame()).toMatch(/session loaded/)
  })
})
