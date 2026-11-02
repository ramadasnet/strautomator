// Strautomator Core: Timeout helpers

/**
 * Race a promise against a timeout. The rejection error has the isTimeout flag set,
 * matching the semantics of axiosRequest timeouts.
 * @param promise The promise to be wrapped.
 * @param timeoutMs Maximum time in milliseconds.
 * @param message Error message used when the timeout is reached.
 */
export const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
    let timer: NodeJS.Timeout
    const timeout = new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
            const err: any = new Error(message)
            err.isTimeout = true
            reject(err)
        }, timeoutMs)
        if (timer.unref) timer.unref()
    })
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeout])
}
