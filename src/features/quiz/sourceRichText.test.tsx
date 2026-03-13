// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SourceDocumentContent, buildSourceContentBlocks } from '#/features/quiz/sourceRichText'
import type { CitationRecord } from '#/features/quiz/types'

afterEach(() => {
  cleanup()
})

describe('source rich text rendering', () => {
  it('builds heading, paragraph, and list blocks from source text', () => {
    const blocks = buildSourceContentBlocks('# Intro\n\nFirst paragraph.\n\n- One\n- Two\n\n## Details\n\nSecond paragraph.')

    expect(blocks).toHaveLength(5)
    expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Intro' })
    expect(blocks[1]).toMatchObject({ type: 'paragraph', text: 'First paragraph.' })
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: false })
    expect(blocks[3]).toMatchObject({ type: 'heading', text: 'Details' })
    expect(blocks[4]).toMatchObject({ type: 'paragraph', text: 'Second paragraph.' })
  })

  it('renders readable rich text without a citation', () => {
    render(
      <SourceDocumentContent
        rawText={'# Intro\n\nHello world.\n\n1. Alpha\n2. Beta'}
        documentId={1}
        citation={null}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Intro' })).toBeTruthy()
    expect(screen.getByText('Hello world.')).toBeTruthy()
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(document.querySelector('mark')).toBeNull()
  })

  it('highlights the cited excerpt in the selected document', () => {
    const rawText = '# Intro\n\nHello world.'
    const citation = createCitation({
      documentId: 7,
      chunkDocumentStartOffset: rawText.indexOf('Hello'),
      excerpt: 'world',
      excerptStartOffset: 'Hello '.length,
      excerptEndOffset: 'Hello world'.length,
    })

    render(<SourceDocumentContent rawText={rawText} documentId={7} citation={citation} />)

    const mark = document.querySelector('mark')
    expect(mark?.textContent).toBe('world')
  })

  it('does not highlight when the citation belongs to another document', () => {
    render(
      <SourceDocumentContent
        rawText="Hello world."
        documentId={1}
        citation={createCitation({ documentId: 2, chunkDocumentStartOffset: 0, excerpt: 'Hello', excerptStartOffset: 0, excerptEndOffset: 5 })}
      />,
    )

    expect(document.querySelector('mark')).toBeNull()
  })

  it('highlights excerpts at the start and end of a block', () => {
    const rawText = 'Hello world.'
    const { rerender } = render(
      <SourceDocumentContent
        rawText={rawText}
        documentId={1}
        citation={createCitation({ documentId: 1, chunkDocumentStartOffset: 0, excerpt: 'Hello', excerptStartOffset: 0, excerptEndOffset: 5 })}
      />,
    )

    expect(document.querySelector('mark')?.textContent).toBe('Hello')

    rerender(
      <SourceDocumentContent
        rawText={rawText}
        documentId={1}
        citation={createCitation({
          documentId: 1,
          chunkDocumentStartOffset: 0,
          excerpt: 'world.',
          excerptStartOffset: 'Hello '.length,
          excerptEndOffset: rawText.length,
        })}
      />,
    )

    expect(document.querySelector('mark')?.textContent).toBe('world.')
  })
})

function createCitation(overrides: Partial<CitationRecord>): CitationRecord {
  return {
    id: 1,
    documentId: 1,
    documentName: 'Doc',
    chunkId: 1,
    chunkText: 'chunk',
    chunkDocumentStartOffset: 0,
    chunkDocumentEndOffset: 0,
    sectionLabel: null,
    paragraphIndex: 0,
    pageNumber: null,
    excerpt: 'excerpt',
    excerptStartOffset: 0,
    excerptEndOffset: 0,
    ...overrides,
  }
}
