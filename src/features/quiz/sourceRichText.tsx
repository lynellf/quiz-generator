import type { ReactNode } from 'react'
import type { CitationRecord } from '#/features/quiz/types'

type SourceHeadingBlock = {
  type: 'heading'
  level: number
  text: string
  startOffset: number
  endOffset: number
}

type SourceParagraphBlock = {
  type: 'paragraph'
  text: string
  startOffset: number
  endOffset: number
}

type SourceListItem = {
  text: string
  startOffset: number
  endOffset: number
}

type SourceListBlock = {
  type: 'list'
  ordered: boolean
  items: SourceListItem[]
}

export type SourceContentBlock = SourceHeadingBlock | SourceParagraphBlock | SourceListBlock

export function buildSourceContentBlocks(rawText: string): SourceContentBlock[] {
  const lines = rawText.split('\n')
  const blocks: SourceContentBlock[] = []
  let cursor = 0
  let listBuffer: SourceListBlock | null = null

  const flushListBuffer = () => {
    if (!listBuffer) {
      return
    }

    blocks.push(listBuffer)
    listBuffer = null
  }

  lines.forEach((line, index) => {
    const lineStart = cursor
    const lineEnd = lineStart + line.length
    const hasTrailingNewline = index < lines.length - 1
    cursor = lineEnd + (hasTrailingNewline ? 1 : 0)

    if (!line.trim()) {
      flushListBuffer()
      return
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushListBuffer()
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
        startOffset: lineStart + headingMatch[1].length + 1,
        endOffset: lineEnd,
      })
      return
    }

    const listMatch = line.match(/^(([-*])|(\d+)\.)\s+(.*)$/)
    if (listMatch) {
      const ordered = Boolean(listMatch[3])
      const item: SourceListItem = {
        text: listMatch[4].trim(),
        startOffset: lineStart + listMatch[1].length + 1,
        endOffset: lineEnd,
      }

      if (!listBuffer || listBuffer.ordered !== ordered) {
        flushListBuffer()
        listBuffer = {
          type: 'list',
          ordered,
          items: [item],
        }
        return
      }

      listBuffer.items.push(item)
      return
    }

    flushListBuffer()
    blocks.push({
      type: 'paragraph',
      text: line.trim(),
      startOffset: lineStart,
      endOffset: lineEnd,
    })
  })

  flushListBuffer()

  return blocks
}

export function SourceDocumentContent({
  rawText,
  documentId,
  citation,
}: {
  rawText: string
  documentId: number
  citation: CitationRecord | null
}) {
  const blocks = buildSourceContentBlocks(rawText)
  const highlightRange =
    citation && citation.documentId === documentId
      ? {
          start: citation.chunkDocumentStartOffset + citation.excerptStartOffset,
          end: citation.chunkDocumentStartOffset + citation.excerptEndOffset,
        }
      : null

  if (blocks.length === 0) {
    return <p className="m-0 text-sm leading-7 text-foreground">{rawText}</p>
  }

  return (
    <div className="space-y-4 text-foreground">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = getHeadingTag(block.level)
          return (
            <Tag
              key={`heading-${block.startOffset}-${index}`}
              className={getHeadingClassName(block.level)}
            >
              {renderHighlightedSegment(block.text, block.startOffset, block.endOffset, highlightRange)}
            </Tag>
          )
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${block.startOffset}-${index}`} className="m-0 text-sm leading-7 text-foreground">
              {renderHighlightedSegment(block.text, block.startOffset, block.endOffset, highlightRange)}
            </p>
          )
        }

        const ListTag = block.ordered ? 'ol' : 'ul'
        return (
          <ListTag
            key={`list-${block.items[0]?.startOffset ?? index}-${index}`}
            className={block.ordered ? 'm-0 ml-5 list-decimal space-y-2' : 'm-0 ml-5 list-disc space-y-2'}
          >
            {block.items.map((item) => (
              <li key={`item-${item.startOffset}`} className="pl-1 text-sm leading-7 text-foreground">
                {renderHighlightedSegment(item.text, item.startOffset, item.endOffset, highlightRange)}
              </li>
            ))}
          </ListTag>
        )
      })}
    </div>
  )
}

function renderHighlightedSegment(
  text: string,
  startOffset: number,
  endOffset: number,
  highlightRange: { start: number; end: number } | null,
): ReactNode {
  if (!highlightRange) {
    return text
  }

  const safeStart = Math.max(startOffset, highlightRange.start)
  const safeEnd = Math.min(endOffset, highlightRange.end)

  if (safeStart >= safeEnd) {
    return text
  }

  const localStart = safeStart - startOffset
  const localEnd = safeEnd - startOffset

  return (
    <>
      {text.slice(0, localStart)}
      <mark className="rounded bg-amber-400/35 px-1 text-inherit">{text.slice(localStart, localEnd)}</mark>
      {text.slice(localEnd)}
    </>
  )
}

function getHeadingTag(level: number) {
  switch (level) {
    case 1:
      return 'h1'
    case 2:
      return 'h2'
    case 3:
      return 'h3'
    case 4:
      return 'h4'
    case 5:
      return 'h5'
    default:
      return 'h6'
  }
}

function getHeadingClassName(level: number) {
  if (level === 1) {
    return 'm-0 text-xl font-semibold tracking-tight text-foreground'
  }

  if (level === 2) {
    return 'm-0 text-lg font-semibold tracking-tight text-foreground'
  }

  return 'm-0 text-base font-semibold tracking-tight text-foreground'
}
