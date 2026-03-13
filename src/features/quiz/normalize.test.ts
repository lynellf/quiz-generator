import { describe, expect, it } from 'vitest'
import { computeQuestionTypeCounts, normalizeDocument } from '#/features/quiz/normalize'
import type { ParsedUpload } from '#/features/quiz/types'

describe('quiz normalization', () => {
  it('preserves markdown sections and paragraphs', () => {
    const document = normalizeDocument(
      createUpload({
        name: 'notes.md',
        content: '# Intro\nFirst paragraph.\n\n## Details\nSecond paragraph.',
      }),
    )

    expect(document.blocks).toHaveLength(2)
    expect(document.blocks[0].sectionLabel).toBe('Intro')
    expect(document.blocks[1].sectionLabel).toBe('Intro > Details')
    expect(document.chunks[0].text).toContain('First paragraph')
    expect(document.rawText).toContain('# Intro')
    expect(document.rawText).toContain('## Details')
  })

  it('extracts readable content from html', () => {
    const document = normalizeDocument(
      createUpload({
        name: 'page.html',
        mimeType: 'text/html',
        content: '<html><body><h1>Alpha</h1><p>Hello <strong>world</strong>.</p></body></html>',
      }),
    )

    expect(document.blocks[0].sectionLabel).toBe('Alpha')
    expect(document.rawText).toContain('# Alpha')
    expect(document.rawText).toContain('Hello world.')
  })

  it('supports plaintext segmentation', () => {
    const document = normalizeDocument(
      createUpload({
        name: 'plain.txt',
        content: 'One paragraph.\n\nTwo paragraph.',
      }),
    )

    expect(document.blocks).toHaveLength(2)
    expect(document.blocks[1].paragraphIndex).toBe(1)
  })

  it('returns a partial extraction note for pdf uploads', () => {
    const pdfDocument = normalizeDocument({
      originalFileName: 'sample.pdf',
      displayName: 'sample',
      mimeType: 'application/pdf',
      extension: '.pdf',
      bytes: new Uint8Array(Buffer.from('/Type /Page (Hello world) Tj')),
    })

    expect(pdfDocument.extractionStatus).toBe('partial')
    expect(pdfDocument.normalizationNotes).toContain('PDF extraction')
    expect(pdfDocument.rawText).toContain('Hello world')
  })

  it('computes the requested question mix deterministically', () => {
    expect(computeQuestionTypeCounts(8, 75)).toEqual({
      totalQuestions: 8,
      multipleChoiceRatio: 75,
      multipleChoiceCount: 6,
      trueFalseCount: 2,
    })
  })
})

function createUpload({
  name,
  content,
  mimeType = 'text/plain',
}: {
  name: string
  content: string
  mimeType?: string
}): ParsedUpload {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : ''

  return {
    originalFileName: name,
    displayName: name.replace(/\.[^.]+$/, ''),
    mimeType,
    extension,
    bytes: new TextEncoder().encode(content),
  }
}
