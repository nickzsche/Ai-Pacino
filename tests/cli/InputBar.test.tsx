import { describe, expect, it } from 'bun:test'
import { render } from 'ink-testing-library'
import React from 'react'
import { InputBar } from '../../src/cli/InputBar'

describe('InputBar', () => {
  it('shows placeholder when empty', () => {
    const { lastFrame } = render(
      <InputBar value="" onChange={() => {}} onSubmit={() => {}} disabled={false} />,
    )
    expect(lastFrame()).toMatch(/type a message/i)
  })

  it('renders the current value', () => {
    const { lastFrame } = render(
      <InputBar value="hello world" onChange={() => {}} onSubmit={() => {}} disabled={false} />,
    )
    expect(lastFrame()).toMatch(/hello world/)
  })

  it('shows command hint when value starts with slash', () => {
    const { lastFrame } = render(
      <InputBar value="/he" onChange={() => {}} onSubmit={() => {}} disabled={false} />,
    )
    expect(lastFrame()).toMatch(/command/i)
  })

  it('submits on Enter and clears via callback', async () => {
    let submitted = ''
    const { stdin } = render(
      <InputBar
        value="hi"
        onChange={() => {}}
        onSubmit={(v) => {
          submitted = v
        }}
        disabled={false}
      />,
    )
    await new Promise((r) => setTimeout(r, 50))
    stdin.write('\r')
    await new Promise((r) => setTimeout(r, 10))
    expect(submitted).toBe('hi')
  })
})
