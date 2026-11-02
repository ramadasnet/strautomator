// Strautomator API: Logged user can trigger a forced processing of a particular activity

import {strava} from "strautomator-core"
import {defineEventHandler} from "nuxt/server"
import {requestValidator} from "../../../../utils/auth"
import {renderError, renderJson, getRequiredParam} from "../../../../utils/web"

/**
 * Logged user can trigger a forced processing of a particular activity.
 */
export default defineEventHandler(async (event) => {
    try {
        const user = await requestValidator(event)
        const activityId = getRequiredParam(event, "activityId")

        try {
            const processedActivity = await strava.activityProcessing.processActivityWithTimeout(user, {id: parseInt(activityId as string)})
            return renderJson(event, processedActivity || {processed: false})
        } catch (ex) {
            // Timed out? Queue the activity so it's retried by the next queue run instead of being dropped.
            if (ex.isTimeout) {
                await strava.activityProcessing.queueActivity(user, parseInt(activityId as string), false, ex.message)
                return renderJson(event, {processed: false, queued: true})
            }
            throw ex
        }
    } catch (ex) {
        const errorMessage = ex.toString()
        return renderError(event, ex, errorMessage.includes("not found") ? 404 : ex.status || ex.statusCode)
    }
})
