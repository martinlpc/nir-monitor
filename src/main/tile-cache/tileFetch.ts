import { app } from 'electron'

let cachedUA: string | undefined

function getUserAgent(): string {
  if (!cachedUA) {
    const version = app.getVersion()
    const repo = 'https://github.com/martinlpc/nir-monitor'
    const contact = 'mpacheco@enacom.gob.ar'
    cachedUA = `RNI-Monitor/${version} (+${repo}; contact: ${contact})`
  }
  return cachedUA
}

export async function tileFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'User-Agent': getUserAgent() }
  })
}
