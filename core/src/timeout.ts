// Strautomator Core: Timeout helpers

import {AsyncLocalStorage} from "node:async_hooks"

const timeoutScope = new AsyncLocalStorage<AbortSignal>()

/** Cancellation signal for work running inside a deadline. */
export const getTimeoutSignal = (): AbortSignal | undefined => timeoutScope.getStore()

/**
 * Apply a deadline. Factories run in a cancellable scope; already-started promises can only be raced.
 * The rejection error has the isTimeout flag, matching axiosRequest timeouts.
 * @param operation Promise or factory to run within the deadline.
 * @param timeoutMs Maximum time in milliseconds.
 * @param message Error message used when the timeout is reached.
 */
export const withTimeout = <T>(operation: Promise<T> | (() => Promise<T>), timeoutMs: number, message: string): Promise<T> => {
    const controller = new AbortController()
    const parentSignal = getTimeoutSignal()
    const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal
    let timer: NodeJS.Timeout
    const timeout = new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
            const err = Object.assign(new Error(message), {isTimeout: true})
            controller.abort(err)
            reject(err)
        }, timeoutMs)
        if (timer.unref) timer.unref()
    })
    const promise =
        typeof operation == "function"
            ? timeoutScope.run(signal, async () => {
                  signal.throwIfAborted()
                  return operation()
              })
            : operation
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeout])
}
