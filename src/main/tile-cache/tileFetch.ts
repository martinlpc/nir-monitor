export function buildUserAgent(version: string): string {
  const repo = 'https://github.com/martinlpc/nir-monitor'
  const contact = 'mpacheco@enacom.gob.ar'
  return `RNI-Monitor/${version} (+${repo}; contact: ${contact})`
}

let cachedUA: string | undefined

function getUserAgent(): string {
  if (!cachedUA) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron')
    cachedUA = buildUserAgent(app.getVersion())
  }
  return cachedUA
}

export async function tileFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': getUserAgent() }
  })
}
