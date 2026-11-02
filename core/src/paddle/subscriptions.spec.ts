// Lightweight checks for the Paddle subscription webhook handlers (run with: npx tsx src/paddle/subscriptions.spec.ts)

import paddleSubscriptions from "./subscriptions"
import api from "./api"
import eventManager from "../eventmanager"
import subscriptions from "../subscriptions"
import users from "../users"

let failed = 0

const assert = (cond: any, message: string) => {
    if (!cond) {
        failed++
        console.error(`FAIL: ${message}`)
    } else {
        console.log(`ok: ${message}`)
    }
}

// Recorded calls made by the handlers under test.
const calls = {
    usersUpdate: [] as any[],
    subsUpdate: [] as any[],
    subsCreate: [] as any[],
    customersUpdate: [] as any[],
    emitted: [] as string[]
}

/**
 * Stub the users, subscriptions, Paddle API and event manager singletons,
 * so the webhook handlers can run without a database or live Paddle account.
 * @param state Mutable state holding the current user and subscription records.
 */
const stub = (state: {userByPaddle?: any; userById?: any; userByPrevious?: any; sub?: any}) => {
    calls.usersUpdate = []
    calls.subsUpdate = []
    calls.subsCreate = []
    calls.customersUpdate = []
    calls.emitted = []

    users.getByPaddleId = async (id: string) => (state.userByPaddle?.paddleId == id ? state.userByPaddle : null)
    users.getById = async (id: string) => {
        if (state.userById?.id == id) return state.userById
        if (state.userByPrevious?.id == id) return null
        return null
    }
    users.getByPreviousId = async (id: string) => (state.userByPrevious?.previousId == id ? state.userByPrevious : null)
    users.update = async (user: any) => {
        calls.usersUpdate.push(user)
        for (const target of [state.userByPaddle, state.userById, state.userByPrevious]) {
            if (target?.id == user.id) Object.assign(target, user)
        }
    }
    subscriptions.getById = async (id: string) => (state.sub?.id == id ? state.sub : null)
    subscriptions.update = async (sub: any) => {
        calls.subsUpdate.push(sub)
        if (state.sub?.id == sub.id) Object.assign(state.sub, sub)
    }
    subscriptions.create = async (sub: any) => {
        calls.subsCreate.push(sub)
        state.sub = sub
    }
    api.client = {customers: {update: async (id: string, data: any) => calls.customersUpdate.push({id, data})}} as any
    eventManager.emit = ((name: string) => {
        calls.emitted.push(name)
        return true
    }) as any
}

/**
 * Build a fake subscription.canceled notification.
 * @param userId Optional user ID sent via the subscription's custom data.
 */
const canceledEvent = (userId?: string) =>
    ({
        eventType: "subscription.canceled",
        eventId: "evt_01",
        data: {
            id: "sub_01",
            customerId: "ctm_01",
            status: "canceled",
            createdAt: "2026-10-01T10:00:00Z",
            updatedAt: "2026-11-01T10:00:00Z",
            customData: userId ? {userId: userId} : undefined
        }
    }) as any

const activeSub = () => ({source: "paddle", id: "sub_01", userId: "user_01", customerId: "ctm_01", status: "ACTIVE", dateCreated: new Date("2026-10-01"), dateUpdated: new Date("2026-10-01")})

const run = async () => {
    // Customer ID lookup fails, user found via custom data: the cancellation is
    // applied and the Paddle customer ID is repaired on the user.
    {
        const state = {userByPaddle: null, userById: {id: "user_01", displayName: "User One"}, sub: activeSub()}
        stub(state)

        const sub = await paddleSubscriptions.onSubscriptionUpdated(canceledEvent("user_01"))
        assert(sub.status == "CANCELLED", "cancellation applied when user is found via custom data")
        assert(state.userById.paddleId == "ctm_01", "Paddle customer ID repaired on the user")
        assert(
            calls.customersUpdate.some((c) => c.id == "ctm_01" && c.data?.customData?.userId == "user_01"),
            "Paddle customer updated with the user ID"
        )
        assert(calls.emitted.includes("Paddle.subscriptionUpdated"), "subscription update event emitted")
    }

    // Same event retried after the repair: user resolves by customer ID,
    // and the already-cancelled subscription is a no-op.
    {
        const state = {userByPaddle: {id: "user_01", displayName: "User One", paddleId: "ctm_01"}, sub: {...activeSub(), status: "CANCELLED"}}
        stub(state)

        const sub = await paddleSubscriptions.onSubscriptionUpdated(canceledEvent("user_01"))
        assert(sub.status == "CANCELLED", "retried cancellation stays cancelled")
        assert(calls.subsUpdate.length == 0, "retried cancellation does not update the subscription again")
        assert(!calls.emitted.includes("Paddle.subscriptionUpdated"), "retried cancellation does not emit the update event again")
    }

    // User cannot be found at all, but the subscription exists: the event is
    // still processed so the cancellation is not lost (idempotent for retries).
    {
        const state = {userByPaddle: null, userById: null, userByPrevious: null, sub: activeSub()}
        stub(state)

        const sub = await paddleSubscriptions.onSubscriptionUpdated(canceledEvent("user_01"))
        assert(sub.status == "CANCELLED", "cancellation applied even when the user is gone")
    }

    // Neither the user nor the subscription can be resolved: the handler throws
    // so the webhook is answered with an error and can be retried.
    {
        const state = {userByPaddle: null, userById: null, userByPrevious: null, sub: null}
        stub(state)

        let thrown: Error
        try {
            await paddleSubscriptions.onSubscriptionUpdated(canceledEvent("user_01"))
        } catch (ex) {
            thrown = ex
        }
        assert(thrown && thrown.message.includes("not found"), "event with no user and no subscription throws")
    }

    // Without a resolved user, a subscription linked to a different customer is
    // never touched: the event is rejected instead of mutating the wrong record.
    {
        const state = {userByPaddle: null, userById: null, userByPrevious: null, sub: {...activeSub(), customerId: "ctm_02"}}
        stub(state)

        let thrown: Error
        try {
            await paddleSubscriptions.onSubscriptionUpdated(canceledEvent("user_01"))
        } catch (ex) {
            thrown = ex
        }
        assert(thrown && thrown.message.includes("different customer"), "mismatched customer on missing user throws")
        assert(state.sub.status == "ACTIVE", "mismatched subscription is left untouched")
    }

    // User found via previous ID (deleted and re-created account): the Paddle
    // customer link is repaired and the subscription is moved to the new user.
    {
        const state = {userByPaddle: null, userById: null, userByPrevious: {id: "user_02", displayName: "User Two", previousId: "user_01"}, sub: activeSub()}
        stub(state)

        const sub = await paddleSubscriptions.onSubscriptionUpdated(canceledEvent("user_01"))
        assert(sub.status == "CANCELLED", "cancellation applied when user is found via previous ID")
        assert(state.userByPrevious.paddleId == "ctm_01", "Paddle customer ID repaired on the user found via previous ID")
        assert(
            calls.subsUpdate.some((s) => s.id == "sub_01" && s.userId == "user_02"),
            "subscription reassigned to the new user"
        )
    }

    if (failed > 0) {
        console.error(`${failed} check(s) failed`)
        process.exit(1)
    } else {
        console.log("all checks passed")
    }
}

run().catch((ex) => {
    console.error(ex)
    process.exit(1)
})
