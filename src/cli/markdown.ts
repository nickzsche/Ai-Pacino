import { marked } from 'marked'
// @ts-expect-error marked-terminal has no type declarations
import { markedTerminal } from 'marked-terminal'

const renderer = marked.use(
  markedTerminal({
    width: 100,
    reflowText: true,
    tab: 2,
    showSectionPrefix: false,
  }) as never,
)

export const renderMarkdown = (md: string): string => {
  try {
    return (renderer.parse(md) as string).trimEnd()
  } catch {
    return md
  }
}
