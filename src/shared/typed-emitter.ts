import { EventEmitter } from 'events'

type EventArgs<T> = T extends void ? [] : [T]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListener = (...args: any[]) => void

export class TypedEmitter<TEvents extends Record<string, unknown | void>> {
  private emitter = new EventEmitter()

  on<K extends keyof TEvents>(event: K, listener: (...args: EventArgs<TEvents[K]>) => void): this {
    this.emitter.on(event as string, listener as AnyListener)
    return this
  }

  once<K extends keyof TEvents>(
    event: K,
    listener: (...args: EventArgs<TEvents[K]>) => void
  ): this {
    this.emitter.once(event as string, listener as AnyListener)
    return this
  }

  emit<K extends keyof TEvents>(event: K, ...args: EventArgs<TEvents[K]>): boolean {
    return this.emitter.emit(event as string, ...(args as unknown[]))
  }

  removeAllListeners<K extends keyof TEvents>(event?: K): this {
    this.emitter.removeAllListeners(event as string | undefined)
    return this
  }

  off<K extends keyof TEvents>(event: K, listener: (...args: EventArgs<TEvents[K]>) => void): this {
    this.emitter.off(event as string, listener as AnyListener)
    return this
  }

  listenerCount<K extends keyof TEvents>(event: K): number {
    return this.emitter.listenerCount(event as string)
  }
}
