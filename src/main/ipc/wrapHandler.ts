import { toUserError } from '../../shared/errors/toUserError'

export function wrapHandler<T>(
  handler: (...args: any[]) => Promise<T>
): (...args: any[]) => Promise<T | { success: false; error: string }> {
  return async (...args: any[]): Promise<T | { success: false; error: string }> => {
    try {
      return await handler(...args)
    } catch (err) {
      const { message, technical } = toUserError(err)
      console.error(`[IPC] Handler error: ${technical}`)
      return { success: false, error: message }
    }
  }
}
