// Strautomator API: Paddle webhook

import {paddle} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {renderError, renderJson, readRawBody, toCoreRequest, WebError} from "../../utils/web"
import logger from "anyhow"

/**
 * Extract the event identifiers from a raw Paddle webhook payload, for logging purposes.
 * The full body must never be logged, as it contains personal customer data.
 * @param body The raw request body as a string.
 */
export const paddleEventInfo = (body?: string): Record<string, string> => {
    const info: Record<string, string> = {}
    try {
        const parsed = JSON.parse(body || "")
        const fields = {eventType: parsed?.event_type, eventId: parsed?.event_id, subscriptionId: parsed?.data?.id}
        for (const [key, value] of Object.entries(fields)) {
            // Restrict to identifier characters, as the body is not signature-verified yet.
            const cleaned = typeof value == "string" ? value.replace(/[^\w.:-]/g, "").substring(0, 64) : ""
            if (cleaned) info[key] = cleaned
        }
    } catch {
        // Body is not a valid JSON, nothing to extract.
    }
    return info
}

/**
 * Process Paddle webhooks.
 */
export default defineEventHandler(async (event) => {
    try {
        const rawBody = await readRawBody(event)
        event.context.requestBody = rawBody.toString()
        await paddle.processWebhook(toCoreRequest(event, rawBody) as any)
    } catch (ex) {
        // Log the event identifiers and the error, then clear the body so it never reaches the logs.
        const info = paddleEventInfo(event.context.requestBody)
        event.context.requestBody = undefined
        logger.error("Routes.paddle", event.req.method, event.url.pathname + event.url.search, info, ex)
        if (ex instanceof WebError) return renderError(event, ex)
        return renderError(event, "Failed to process webhook", 500)
    }

    return renderJson(event, {ok: true})
})
