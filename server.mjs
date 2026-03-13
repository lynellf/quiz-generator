import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import serverEntry from './dist/server/server.js'

const host = process.env.HOST || '0.0.0.0'
const port = Number(process.env.PORT || '3000')
const clientDistDir = join(process.cwd(), 'dist', 'client')

const mimeTypeByExtension = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
])

function getMimeType(pathname) {
  return mimeTypeByExtension.get(extname(pathname).toLowerCase()) || 'application/octet-stream'
}

function isWithinClientDist(pathname) {
  const normalizedPath = normalize(join(clientDistDir, pathname))
  return normalizedPath === clientDistDir || normalizedPath.startsWith(`${clientDistDir}${sep}`)
}

function resolveStaticPath(pathname) {
  const decodedPath = decodeURIComponent(pathname)
  const candidatePath = join(clientDistDir, decodedPath)

  if (!isWithinClientDist(decodedPath)) {
    return null
  }

  if (!existsSync(candidatePath)) {
    return null
  }

  const stats = statSync(candidatePath)
  if (!stats.isFile()) {
    return null
  }

  return candidatePath
}

async function maybeServeStaticFile(req, res) {
  const requestPath = new URL(req.url || '/', `http://${req.headers.host || `localhost:${port}`}`).pathname
  const staticPath = requestPath === '/' ? '/index.html' : requestPath
  const filePath = resolveStaticPath(staticPath)

  if (!filePath) {
    return false
  }

  const headers = {
    'content-type': getMimeType(staticPath),
    'cache-control': staticPath.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=300',
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, headers)
    res.end()
    return true
  }

  if (req.method !== 'GET') {
    return false
  }

  res.writeHead(200, headers)
  createReadStream(filePath).pipe(res)
  return true
}

function getRequestUrl(req) {
  const protocol = 'http'
  const reqHost = req.headers.host || `localhost:${port}`
  return `${protocol}://${reqHost}${req.url || '/'}`
}

function toFetchRequest(req) {
  const url = getRequestUrl(req)

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item)
      }
    } else if (value !== undefined) {
      headers.set(key, value)
    }
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
  })
}

function writeFetchResponse(res, response) {
  const setCookieValues = []
  const headersObject = {}

  for (const [key, value] of response.headers.entries()) {
    if (key.toLowerCase() === 'set-cookie') {
      setCookieValues.push(value)
      continue
    }

    headersObject[key] = value
  }

  if (setCookieValues.length > 0) {
    headersObject['set-cookie'] = setCookieValues
  }

  res.writeHead(response.status, headersObject)

  if (!response.body) {
    res.end()
    return
  }

  Readable.fromWeb(response.body).pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    const servedStatic = await maybeServeStaticFile(req, res)
    if (servedStatic) {
      return
    }

    const request = toFetchRequest(req)
    const response = await serverEntry.fetch(request)

    if (response.status === 404 && req.method === 'GET') {
      const indexHtmlPath = resolveStaticPath('/index.html')
      if (indexHtmlPath) {
        const html = await readFile(indexHtmlPath, 'utf8')
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(html)
        return
      }
    }

    writeFetchResponse(res, response)
  } catch (error) {
    console.error('Unhandled server error:', error)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'Internal server error' }))
  }
})

server.listen(port, host, () => {
  console.log(`Server listening on http://${host}:${port}`)
})
