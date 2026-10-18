import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')
const port = Number(process.env.PORT || 3000)
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname)
    const filePath = path.resolve(root, `.${pathname}`)
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(400).end('Bad request')
      return
    }

    let target = filePath
    try {
      await access(target)
      if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html')
    } catch {
      target = path.join(root, 'index.html')
    }

    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream' })
    createReadStream(target).pipe(response)
  } catch {
    response.writeHead(400).end('Bad request')
  }
}).listen(port, '0.0.0.0')
