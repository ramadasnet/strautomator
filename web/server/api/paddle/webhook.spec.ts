// Lightweight checks for the Paddle webhook route (run with: npx tsx server/api/paddle/webhook.spec.ts)

import {H3Event} from "h3"
import {paddle} from "strautomator-core"
import logger from "anyhow"
import setmeup from "setmeup"
import handler, {paddleEventInfo} from "./webhook.post"

// Settings files are not loaded outside the app, so seed the bits used by the helpers.
const settings = setmeup.settings
settings.app = settings.app || {}

let failed = 0

const assert = (cond: any, message: string) => {
    if (!cond) {
        failed++
        console.error(`FAIL: ${message}`)
    } else {
        console.log(`ok: ${message}`)
    }
}

// Capture all error and warning logs.
const logged: string[] = []
const capture = (level: "error" | "warn") => {
    const original = logger[level]
    logger[level] = ((...args: any[]) => {
        for (const arg of args) {
            try {
                logged.push(typeof arg == "string" ? arg : arg instanceof Error ? arg.message : JSON.stringify(arg))
            } catch {
                logged.push(String(arg))
            }
        }
        return original(...args)
    }) as any
}
capture("error")
capture("warn")

const payload = JSON.stringify({
    event_id: "evt_01",
    event_type: "subscription.canceled",
    occurred_at: "2026-11-01T10:00:00Z",
    notification_id: "ntf_01",
    data: {
        id: "sub_01",
        customer_id: "ctm_01",
        status: "canceled",
        custom_data: {userId: "user_01"},
        customer: {email: "customer@example.com", name: "Jane Doe"}
    }
})

const newEvent = (body: string = payload) => new H3Event(new Request("http://localhost/api/paddle/webhook/", {method: "POST", body: body, headers: {"content-type": "application/json"}}))

const run = async () => {
    // The event info helper extracts only identifiers, never customer data.
    {
        const info = paddleEventInfo(payload)
        assert(info.eventType == "subscription.canceled", "event info has the event type")
        assert(info.eventId == "evt_01", "event info has the event ID")
        assert(info.subscriptionId == "sub_01", "event info has the subscription ID")
        assert(!JSON.stringify(info).includes("customer@example.com"), "event info has no customer data")
        assert(Object.keys(paddleEventInfo("not a json")).length == 0, "event info is empty for invalid payloads")
    }

    // Successful processing returns ok.
    {
        paddle.processWebhook = (async () => {}) as any
        const event = newEvent()
        const res = await handler(event)
        assert(res.status == 200 && JSON.parse(await res.text()).ok === true, "webhook answered ok when processing succeeds")
    }

    // Failed processing logs identifiers and the error, but never the body.
    {
        logged.length = 0
        paddle.processWebhook = (async () => {
            throw new Error("User with Paddle ID ctm_01 not found")
        }) as any

        const event = newEvent()
        const res = await handler(event)
        const logs = logged.join("\n")

        assert(res.status == 500, "webhook answered 500 when processing fails")
        assert(event.context.requestBody === undefined, "request body cleared from the context on errors")
        assert(logs.includes("subscription.canceled") && logs.includes("evt_01") && logs.includes("sub_01"), "error logs include the event identifiers")
        assert(logs.includes("User with Paddle ID ctm_01 not found"), "error logs include the error message")
        assert(!logs.includes("customer@example.com") && !logs.includes("Jane Doe"), "error logs never include customer data")
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
