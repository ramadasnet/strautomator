// Lightweight checks for timeout helpers (run with: npx tsx src/timeout.spec.ts)

import {withTimeout} from "./timeout"

let failed = 0

const assert = (cond: any, message: string) => {
    if (!cond) {
        failed++
        console.error(`FAIL: ${message}`)
    } else {
        console.log(`ok: ${message}`)
    }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const run = async () => {
    const fast = await withTimeout(sleep(10).then(() => "done"), 100, "timed out")
    assert(fast == "done", "withTimeout resolves fast promises")

    let timeoutErr: any = null
    try {
        await withTimeout(sleep(1000), 20, "too slow")
    } catch (ex) {
        timeoutErr = ex
    }
    assert(timeoutErr && timeoutErr.isTimeout === true, "withTimeout rejects slow promises with isTimeout")
    assert(timeoutErr && timeoutErr.message == "too slow", "withTimeout uses the passed message")

    let originalErr: any = null
    try {
        await withTimeout(sleep(10).then(() => Promise.reject(new Error("boom"))), 100, "timed out")
    } catch (ex) {
        originalErr = ex
    }
    assert(originalErr && originalErr.message == "boom" && !originalErr.isTimeout, "withTimeout propagates original rejections")

    if (failed > 0) {
        console.error(`${failed} assertion(s) failed`)
        process.exit(1)
    }
    console.log("All checks passed")
}

run()
