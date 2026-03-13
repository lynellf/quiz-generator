import type { NormalizedBlock, NormalizedChunk, NormalizedDocument, ParsedUpload } from '#/features/quiz/types'

const SUPPORTED_EXTENSIONS = new Set(['.md', '.markdown', '.html', '.htm', '.txt', '.text', '.pdf'])
const MAX_CHUNK_LENGTH = 900

export function assertSupportedUpload(upload: ParsedUpload) {
  if (!SUPPORTED_EXTENSIONS.has(upload.extension)) {
    throw new Error(`Unsupported file type: ${upload.extension}`)
  }
}

export function normalizeDocument(upload: ParsedUpload): NormalizedDocument {
  assertSupportedUpload(upload)

  if (upload.extension === '.md' || upload.extension === '.markdown') {
    return normalizeMarkdown(upload)
  }

  if (upload.extension === '.html' || upload.extension === '.htm') {
    return normalizeHtml(upload)
  }

  if (upload.extension === '.pdf') {
    return normalizePdf(upload)
  }

  return normalizePlainText(upload)
}

export function computeQuestionTypeCounts(totalQuestions: number, multipleChoiceRatio: number) {
  const safeTotal = clampInteger(totalQuestions, 1, 25)
  const safeRatio = clampInteger(multipleChoiceRatio, 0, 100)
  const multipleChoiceCount = Math.round((safeTotal * safeRatio) / 100)
  const trueFalseCount = safeTotal - multipleChoiceCount

  return {
    totalQuestions: safeTotal,
    multipleChoiceRatio: safeRatio,
    multipleChoiceCount,
    trueFalseCount,
  }
}

function normalizeMarkdown(upload: ParsedUpload): NormalizedDocument {
  const text = decodeUtf8(upload.bytes)
  const { rawText, blocks } = parseStructuredText(text)

  return {
    ...baseDocument(upload),
    extractionStatus: 'complete',
    normalizationNotes: null,
    rawText,
    blocks,
    chunks: buildChunks(blocks),
  }
}

function normalizeHtml(upload: ParsedUpload): NormalizedDocument {
  const html = decodeUtf8(upload.bytes)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, depth: string, content: string) => {
      return `\n${'#'.repeat(Number(depth))} ${stripTags(content)}\n`
    })
    .replace(/<(p|div|section|article|main|aside|li|tr|br)[^>]*>/gi, '\n')
    .replace(/<\/(p|div|section|article|main|aside|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  const decoded = decodeHtmlEntities(text)
  const { rawText, blocks } = parseStructuredText(decoded)

  return {
    ...baseDocument(upload),
    extractionStatus: 'complete',
    normalizationNotes: null,
    rawText,
    blocks,
    chunks: buildChunks(blocks),
  }
}

function normalizePlainText(upload: ParsedUpload): NormalizedDocument {
  const text = decodeUtf8(upload.bytes)
  const { rawText, blocks } = parseStructuredText(text)

  return {
    ...baseDocument(upload),
    extractionStatus: 'complete',
    normalizationNotes: null,
    rawText,
    blocks,
    chunks: buildChunks(blocks),
  }
}

function normalizePdf(upload: ParsedUpload): NormalizedDocument {
  const { text, pageCount } = extractPdfText(upload.bytes)
  const { rawText, blocks } = parseStructuredText(text)

  return {
    ...baseDocument(upload),
    extractionStatus: 'partial',
    normalizationNotes:
      'PDF extraction uses embedded text only. Highlighting is based on extracted text rather than original page coordinates.',
    rawText,
    blocks: blocks.map((block) => ({
      ...block,
      pageNumber: block.pageNumber ?? inferPageNumber(block.sectionLabel),
    })),
    chunks: buildChunks(
      blocks.map((block) => ({
        ...block,
        pageNumber: block.pageNumber ?? inferPageNumber(block.sectionLabel),
      })),
    ),
  }
}

function baseDocument(upload: ParsedUpload) {
  return {
    originalFileName: upload.originalFileName,
    displayName: upload.displayName,
    mimeType: upload.mimeType,
    extension: upload.extension,
  }
}

function parseStructuredText(input: string) {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  const headings: string[] = []
  const paragraphs: Array<{ text: string; sectionLabel: string | null }> = []
  let currentParagraph: string[] = []

  const flushParagraph = () => {
    const text = currentParagraph.join(' ').replace(/\s+/g, ' ').trim()
    if (!text) {
      currentParagraph = []
      return
    }

    paragraphs.push({
      text,
      sectionLabel: headings.length > 0 ? headings.join(' > ') : null,
    })
    currentParagraph = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      const depth = headingMatch[1].length
      headings.splice(depth - 1)
      headings[depth - 1] = headingMatch[2].trim()
      continue
    }

    currentParagraph.push(trimmed)
  }

  flushParagraph()

  const rawSegments: string[] = []
  const blocks: NormalizedBlock[] = []
  let cursor = 0
  let previousHeadings: string[] = []

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const nextHeadings = paragraph.sectionLabel ? paragraph.sectionLabel.split(' > ') : []
    const sharedDepth = countSharedHeadingDepth(previousHeadings, nextHeadings)

    for (let index = sharedDepth; index < nextHeadings.length; index += 1) {
      if (cursor > 0) {
        rawSegments.push('\n\n')
        cursor += 2
      }

      const headingLine = `${'#'.repeat(index + 1)} ${nextHeadings[index]}`
      rawSegments.push(headingLine)
      cursor += headingLine.length
    }

    if (cursor > 0) {
      rawSegments.push('\n\n')
      cursor += 2
    }

    const startOffset = cursor
    const endOffset = cursor + paragraph.text.length
    rawSegments.push(paragraph.text)
    blocks.push({
      text: paragraph.text,
      sectionLabel: paragraph.sectionLabel,
      paragraphIndex,
      pageNumber: null,
      startOffset,
      endOffset,
    })
    cursor = endOffset
    previousHeadings = nextHeadings
  })

  return {
    rawText: rawSegments.join(''),
    blocks,
  }
}

function countSharedHeadingDepth(left: string[], right: string[]) {
  const maxDepth = Math.min(left.length, right.length)

  for (let index = 0; index < maxDepth; index += 1) {
    if (left[index] !== right[index]) {
      return index
    }
  }

  return maxDepth
}

function buildChunks(blocks: NormalizedBlock[]): NormalizedChunk[] {
  const chunks: NormalizedChunk[] = []

  blocks.forEach((block) => {
    const segments = splitIntoChunkTexts(block.text)
    let segmentStartOffset = block.startOffset

    segments.forEach((segment) => {
      const segmentEndOffset = segmentStartOffset + segment.length
      chunks.push({
        chunkIndex: chunks.length,
        text: segment,
        sectionLabel: block.sectionLabel,
        paragraphIndex: block.paragraphIndex,
        pageNumber: block.pageNumber,
        documentStartOffset: segmentStartOffset,
        documentEndOffset: segmentEndOffset,
      })
      segmentStartOffset = segmentEndOffset + 1
    })
  })

  return chunks
}

function splitIntoChunkTexts(text: string) {
  if (text.length <= MAX_CHUNK_LENGTH) {
    return [text]
  }

  const sentences = text.match(/[^.!?]+[.!?]?/g) ?? [text]
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence.trim()}` : sentence.trim()
    if (candidate.length <= MAX_CHUNK_LENGTH) {
      current = candidate
      continue
    }

    if (current) {
      chunks.push(current)
    }

    if (sentence.length <= MAX_CHUNK_LENGTH) {
      current = sentence.trim()
      continue
    }

    for (let start = 0; start < sentence.length; start += MAX_CHUNK_LENGTH) {
      chunks.push(sentence.slice(start, start + MAX_CHUNK_LENGTH).trim())
    }
    current = ''
  }

  if (current) {
    chunks.push(current)
  }

  return chunks.filter(Boolean)
}

function extractPdfText(bytes: Uint8Array) {
  const source = decodeLatin1(bytes)
  const pageSegments = source.split(/\/Type\s*\/Page\b/g).slice(1)
  const extractedPages = pageSegments
    .map((segment, index) => {
      const text = extractPdfStrings(segment)
      if (!text) {
        return null
      }

      return `# Page ${index + 1}\n${text}`
    })
    .filter((value): value is string => Boolean(value))

  if (extractedPages.length > 0) {
    return {
      text: extractedPages.join('\n\n'),
      pageCount: extractedPages.length,
    }
  }

  return {
    text: extractPdfStrings(source),
    pageCount: 0,
  }
}

function extractPdfStrings(input: string) {
  const matches: string[] = []
  const tjPattern = /\(((?:\\.|[^\\()])*)\)\s*Tj/g
  const tjArrayPattern = /\[((?:.|\n)*?)\]\s*TJ/g

  for (const match of input.matchAll(tjPattern)) {
    matches.push(unescapePdfString(match[1]))
  }

  for (const match of input.matchAll(tjArrayPattern)) {
    const inner = match[1]
    for (const token of inner.matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
      matches.push(unescapePdfString(token[1]))
    }
  }

  return matches
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
}

function unescapePdfString(value: string) {
  return value
    .replace(/\\([\\()])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
}

function inferPageNumber(text: string | null) {
  const match = text?.match(/Page\s+(\d+)/i)
  return match ? Number(match[1]) : null
}

function stripTags(input: string) {
  return decodeHtmlEntities(input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder('utf-8').decode(bytes)
}

function decodeLatin1(bytes: Uint8Array) {
  return new TextDecoder('latin1').decode(bytes)
}

function decodeHtmlEntities(input: string) {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
}

function clampInteger(value: number, min: number, max: number) {
  const parsed = Number.isFinite(value) ? Math.round(value) : min
  return Math.min(max, Math.max(min, parsed))
}
