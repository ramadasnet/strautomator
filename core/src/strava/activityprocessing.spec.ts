// Activity queue checks (run with: npx tsx src/strava/activityprocessing.spec.ts)

import {FieldValue} from "@google-cloud/firestore"

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

const main = async () => {
    const {settings} = require("setmeup")
    settings.strava = settings.strava || {}
    settings.strava.processingQueue = {
        delayedSeconds: 600,
        batchSize: 60,
        maxAge: 345600,
        retry: 5,
        retryBackoff: [300, 900, 3600, 10800],
        activityTimeout: 0.3,
        maxRunDuration: 1,
        minActivityTimeout: 0.05,
        processingTimeout: 1800
    }

    // In-memory Firestore replacement. Transactions are serialized, like Firestore guarantees.
    let docs: {[id: string]: any} = {}
    let txnQueue = Promise.resolve()
    const isDelete = (v) => v instanceof FieldValue && FieldValue.delete().isEqual(v)
    const mergeDoc = (data) => {
        const doc = docs[data.id] || {}
        for (const [key, value] of Object.entries(data)) {
            if (isDelete(value)) delete doc[key]
            else doc[key] = structuredClone(value)
        }
        docs[data.id] = doc
    }
    const getDoc = (id: string) => (docs[id] ? {...structuredClone(docs[id]), id: id} : null)
    const matches = (doc, [field, op, value]) => (op == "==" ? doc[field] === value : doc[field] !== undefined && doc[field] <= value)

    const database = require("../database").default
    database.get = async (_collection, id) => getDoc(id)
    database.set = async (_collection, data, id) => (docs[id] = structuredClone(data))
    database.merge = async (_collection, data) => mergeDoc(data)
    database.delete = async (_collection, id) => delete docs[id]
    database.search = async (_collection, where, orderBy, limit) => {
        let results = Object.keys(docs)
            .map(getDoc)
            .filter((d) => where.every((w) => matches(d, w)))
        if (orderBy) results.sort((a, b) => a[orderBy] - b[orderBy])
        return results.slice(0, limit)
    }
    database.runTransaction = async (handler) => {
        const run = txnQueue.then(() => {
            const writes = []
            return handler({
                get: async (_collection, id) => getDoc(id),
                merge: (_collection, data) => writes.push(() => mergeDoc(data)),
                delete: (_collection, id) => writes.push(() => delete docs[id])
            }).then((result) => {
                writes.forEach((w) => w())
                return result
            })
        })
        txnQueue = run.then(
            () => null,
            () => null
        )
        return run
    }

    const tokens = {accessToken: "a", refreshToken: "r"}
    const usersById: {[id: string]: any} = {
        u1: {id: "u1", displayName: "User 1", stravaTokens: tokens, preferences: {delayedProcessing: true}, recipes: {r1: {}}},
        noTokens: {id: "noTokens", displayName: "No tokens", stravaTokens: {}, preferences: {}},
        suspended: {id: "suspended", displayName: "Suspended", stravaTokens: tokens, suspended: true, preferences: {}}
    }
    require("../users").default.getById = async (id) => usersById[id] || null
    require("../notifications").default.createNotification = async () => null

    const events = []
    const eventManager = require("../eventmanager").default
    eventManager.on("Strava.activityUpdated", (_user, id) => events.push(`update ${id}`))
    eventManager.on("Strava.activityDeleted", (_user, id) => events.push(`delete ${id}`))

    // Fake processing: records calls, and either saves the processed activity or runs a custom behaviour.
    const processor = require("./activityprocessing").default
    let processCalls: string[] = []
    let behaviours: {[id: string]: () => Promise<any>} = {}
    processor.processActivity = async (user, pActivity) => {
        const id = pActivity.id.toString()
        processCalls.push(id)
        if (behaviours[id]) return behaviours[id]()
        await sleep(20)
        const data = {id: id, userId: user.id, name: `Activity ${id}`, dateProcessed: new Date()}
        docs[id] = data
        return data
    }

    const reset = () => {
        docs = {}
        events.length = 0
        processCalls = []
        behaviours = {}
    }
    const makeDue = (id: string, minutesAgo = 11) => (docs[id].dateQueued = new Date(Date.now() - minutesAgo * 60000))

    // Update / delete webhooks arriving during the delay window.
    reset()
    await processor.queueActivity(usersById.u1, 1, false)
    const dateQueued = docs["1"].dateQueued
    await processor.queueActivity(usersById.u1, 1, false, undefined, undefined, "update")
    await processor.clearWebhookAction({id: 1, userId: "u1"}, "update")
    assert(docs["1"]?.queued === true && docs["1"].dateQueued.valueOf() == dateQueued.valueOf(), "update callback keeps the pending create and its dateQueued")
    assert(!docs["1"].webhookActions, "update callback clears only its webhook action")
    makeDue("1")
    await processor.processQueuedActivities()
    assert(processCalls.join() == "1" && docs["1"].dateProcessed && !docs["1"].dateQueued, "delayed activity is processed after an update during the delay window")

    reset()
    await processor.queueActivity(usersById.u1, 2, false)
    await processor.queueActivity(usersById.u1, 2, false, undefined, undefined, "update")
    makeDue("2")
    await processor.processQueuedActivities()
    assert(processCalls.join() == "2" && docs["2"].dateProcessed, "failed update callback: pending create is still processed")
    assert(events.join() == "update 2", "failed update callback: update event replayed by the queue")

    reset()
    await processor.queueActivity(usersById.u1, 3, false)
    await processor.queueActivity(usersById.u1, 3, false, undefined, undefined, "delete")
    makeDue("3")
    await processor.processQueuedActivities()
    assert(processCalls.length == 0 && !docs["3"] && events.join() == "delete 3", "pending delete skips processing and removes the queued activity")

    reset()
    docs["4"] = {userId: "u1", name: "Processed", dateProcessed: new Date()}
    await processor.queueActivity(usersById.u1, 4, false, undefined, undefined, "update")
    await processor.clearWebhookAction({id: 4, userId: "u1"}, "update")
    assert(docs["4"]?.name == "Processed" && !docs["4"].dateQueued && !docs["4"].queued, "update on a processed activity keeps the history and leaves the queue")

    // Timed-out activity at the head of the queue.
    reset()
    for (const id of [10, 11]) await processor.queueActivity(usersById.u1, id, false)
    makeDue("10", 12)
    makeDue("11", 11)
    behaviours["10"] = () => sleep(2000)
    await processor.processQueuedActivities()
    assert(docs["11"]?.dateProcessed, "activity after a timed-out head is still processed in the same run")
    assert(docs["10"].timeoutCount == 1 && !docs["10"].retryCount && docs["10"].processing === false, "timeouts are counted separately and the lease released")
    assert(docs["10"].dateQueued > new Date(Date.now() - 600000), "timed-out activity is moved back in the queue (backoff)")
    processCalls = []
    await processor.processQueuedActivities()
    assert(processCalls.length == 0, "timed-out activity is not retried before its backoff")

    // Exhausted retries are saved with an error instead of silently deleted.
    reset()
    await processor.queueActivity(usersById.u1, 12, false)
    makeDue("12")
    docs["12"].retryCount = 5
    behaviours["12"] = async () => {
        throw new Error("Strava down")
    }
    await processor.processQueuedActivities()
    assert(docs["12"]?.dateProcessed && docs["12"].error?.includes("Strava down") && !docs["12"].dateQueued, "exhausted retries are saved with the error")

    // Activities deleted mid-processing are not recreated by retry writes.
    reset()
    await processor.queueActivity(usersById.u1, 13, false)
    makeDue("13")
    behaviours["13"] = async () => {
        delete docs["13"]
        throw new Error("Failed")
    }
    await processor.processQueuedActivities()
    assert(!docs["13"], "deleted queued activity is not recreated as a stray record")

    // Cleanup does not delete pending batch activities.
    reset()
    await processor.queueActivity(usersById.u1, 20, true)
    const expiredDate = new Date(Date.now() - settings.strava.processingQueue.maxAge * 1000)
    const expired = await processor.getExpiredQueuedActivities(expiredDate)
    assert(expired.length == 0, "pending batch activity is not returned as expired")
    const queued = await processor.getQueuedActivities(new Date(Date.now() - 600000))
    assert(queued.length == 1, "pending batch activity is still picked up for processing")

    // Concurrent runs don't double-process.
    reset()
    for (const id of [30, 31, 32]) {
        await processor.queueActivity(usersById.u1, id, false)
        makeDue(id.toString())
    }
    await Promise.all([processor.processQueuedActivities(), processor.processQueuedActivities()])
    assert(processCalls.sort().join() == "30,31,32", "concurrent runs process each activity once")

    // Users without Strava tokens or suspended are never queued.
    reset()
    await processor.queueActivity(usersById.noTokens, 40, false)
    await processor.queueActivity(usersById.suspended, 41, true)
    await processor.queueActivity(usersById.noTokens, 42, false, undefined, undefined, "update")
    assert(Object.keys(docs).length == 0, "no-token and suspended users are never queued")
    docs["43"] = {userId: "noTokens", queued: true, dateQueued: new Date(Date.now() - 700000)}
    docs["44"] = {userId: "suspended", queued: true, dateQueued: new Date(Date.now() - 700000)}
    await processor.processQueuedActivities()
    assert(processCalls.length == 0 && !docs["43"] && !docs["44"], "existing queue items of no-token and suspended users are dropped")

    if (failed > 0) {
        console.error(`${failed} check(s) failed`)
        process.exit(1)
    }
    console.log("All checks passed")
    process.exit(0)
}

main()
