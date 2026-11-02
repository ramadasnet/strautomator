// Strautomator API: Subscription events sent by Strava

import {strava, users} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {getBody, getClientIP, renderError, renderJson, validateUrlToken} from "../../../../utils/web"
import packageJson from "../../../../../package.json"
import axios from "axios"
import logger from "anyhow"
import setmeup from "setmeup"
const settings = setmeup.settings

/**
 * Subscription events sent by Strava.
 */
export default defineEventHandler(async (event) => {
    try {
        validateUrlToken(event, settings.strava.api.urlToken)
        const body = await getBody(event)
        if (!body) throw new Error("Missing request params")

        const obj = body

        if (!obj.aspect_type || !obj.event_time || !obj.object_id || !obj.object_type) {
            throw new Error("Request body is missing required data")
        }

        const clientIP = getClientIP(event)
        const objId = obj.object_id.toString()
        const userId = obj.owner_id.toString()
        const objType = obj.object_type
        const objAspect = obj.aspect_type
        const objUpdates = obj.updates
        const arrUpdates = objAspect == "update" && objUpdates ? Object.entries(objUpdates) : []
        const logUpdates = arrUpdates.length > 0 ? ` (${arrUpdates.map((u) => `${u[0]}: ${u[1]}`).join(", ")})` : ""
        const logDetails = `User ${userId}: ${objType} ${objAspect} - ${objId}${logUpdates}, IP ${clientIP}`

        if (users.ignoredUserIds.includes(userId)) {
            logger.debug("Routes.strava", event.req.method, event.url.pathname + event.url.search, "User is ignored, won't process", logDetails)
            return renderJson(event, {ok: false})
        }

        if (objType == "athlete" && obj.updates?.authorized == "false") {
            logger.warn("Routes.strava", event.req.method, event.url.pathname + event.url.search, `User ${userId} possibly deauthorized`)
            strava.athletes.deauthCheck(obj.owner_id.toString())
            return renderJson(event, {authorized: false})
        }

        if (objType != "activity") {
            return renderJson(event, {ok: false})
        }

        logger.info("Routes.strava", logDetails)

        const options = {
            method: "GET",
            baseURL: settings.api.url || `${settings.app.url}api/`,
            url: `/strava/webhook/${settings.strava.api.urlToken}/${userId}/${objId}?action=${objAspect}&timestamp=${obj.event_time}`,
            headers: {"User-Agent": `${settings.app.title} / ${packageJson.version}`},
            // Must outlast the per-activity processing timeout, but stay under the Cloud Run request limit.
            timeout: settings.strava.processingQueue.activityTimeout * 1000 + 15000
        }

        // Webhook events are queued before acknowledging, so they are still handled by the queue
        // if the realtime callback below fails. Creates are processed in full, while updates and
        // deletes get their webhookAction replayed as the matching activity event.
        try {
            const user = await users.getById(userId)
            if (user) await strava.activityProcessing.queueActivity(user, parseInt(objId), false, undefined, undefined, objAspect == "create" ? undefined : objAspect)
        } catch (queueEx) {
            logger.error("Routes.strava", event.req.method, event.url.pathname + event.url.search, `Failed to queue activity ${objId}`, queueEx)
        }

        axios(options).catch((err) => {
            logger.warn("Routes.strava", event.req.method, event.url.pathname + event.url.search, `Activity callback endpoint failed, ${objAspect} action stays queued`, err.toString())
        })
        return renderJson(event, {ok: true})
    } catch (ex) {
        logger.error("Routes.strava", event.req.method, event.url.pathname + event.url.search, ex)
        return renderError(event, ex)
    }
})
