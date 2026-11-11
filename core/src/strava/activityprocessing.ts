// Strautomator Core: Strava Activity Processing

import {StravaActivity, StravaActivityFilter, StravaProcessedActivity, StravaRideType, StravaRunType} from "./types"
import {FieldValue} from "@google-cloud/firestore"
import {isActivityIgnored} from "./utils"
import {getTimeoutSignal, withoutTimeout, withTimeout} from "../timeout"
import {updateBatteryTracker} from "../gearwear/battery"
import {RecipeData} from "../recipes/types"
import {getActionSummary, getConditionSummary} from "../recipes/utils"
import {UserData} from "../users/types"
import {weatherSummaryString} from "../weather/utils"
import stravaActivities from "./activities"
import stravaAthletes from "./athletes"
import stravaPerformance from "./performance"
import database from "../database"
import eventManager from "../eventmanager"
import notifications from "../notifications"
import recipes from "../recipes"
import users from "../users"
import weather from "../weather"
import _ from "lodash"
import cache from "bitecache"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

// Queue state fields, removed once a queued activity is done.
const queueFields = ["queued", "batch", "dateQueued", "processing", "dateProcessing", "retryCount", "timeoutCount", "webhookAction", "webhookActions"]

/**
 * Strava activity processing manager.
 */
export class StravaActivityProcessing {
    private constructor() {}
    private static _instance: StravaActivityProcessing
    static get Instance(): StravaActivityProcessing {
        return this._instance || (this._instance = new this())
    }

    // PROCESSING ACTIVITIES
    // --------------------------------------------------------------------------

    /**
     * Get a single processed activity.
     * @param user The activities owner.
     * @param id The activity ID.
     *
     */
    getProcessedActivity = async (user: UserData, id: number): Promise<StravaProcessedActivity> => {
        try {
            const activity = await database.get("activities", id.toString())

            if (activity && activity.userId != user.id) {
                logger.warn("Strava.getProcessedActivity", logHelper.user(user), id, `Activity belongs to another user`)
                return null
            }
            if (activity) {
                logger.info("Strava.getProcessedActivity", logHelper.user(user), logHelper.activity(activity))
                return activity
            }

            logger.warn("Strava.getProcessedActivity", logHelper.user(user), id, "Not found")
            return null
        } catch (ex) {
            logger.error("Strava.getProcessedActivity", logHelper.user(user), id, ex)
            throw ex
        }
    }

    /**
     * Get saved processed activities for the specified user.
     * @param user The activities owner.
     * @param dateFrom Activities processed since date.
     * @param dateTo Activities processed up to date.
     * @param limit Optional, limit how many results should be returned?
     */
    getProcessedActivities = async (user: UserData, dateFrom?: Date, dateTo?: Date, limit?: number): Promise<StravaProcessedActivity[]> => {
        try {
            let logFrom = ""
            let logTo = ""
            let logLimit = ""

            const where: any[] = [["userId", "==", user.id]]
            if (dateFrom) {
                where.push(["dateProcessed", ">=", dateFrom])
                logFrom = ` from ${dayjs(dateFrom).format("ll")}`
            }
            if (dateTo) {
                where.push(["dateProcessed", "<=", dateTo])
                logTo = ` to ${dayjs(dateTo).format("ll")}`
            }
            if (limit) {
                logLimit = `, limit ${limit}`
            }

            const activities = await database.search("activities", where, ["dateProcessed", "desc"], limit)
            logger.info("Strava.getProcessedActivities", logHelper.user(user), `Got ${activities.length || "no"} activities${logFrom}${logTo}${logLimit}`)

            // TODO! Remove this once all previous activities have been updated with the new backlink field.
            activities.forEach((a) => {
                if (a.linkback) {
                    a.backlink = true
                }
            })

            return activities
        } catch (ex) {
            logger.error("Strava.getProcessedActivities", logHelper.user(user), dateFrom, dateTo, ex)
            return []
        }
    }

    /**
     * Batch process activities for the specified user. This will effectively add the
     * activities for the specified range to the processing queue.
     * @param user The activities owner (user).
     * @param dDateFrom Activities since (from that date).
     * @param dDateTo Activities up to (till that date), if not passed will use today.
     * @param filter Additional activity filters.
     */
    batchProcessActivities = async (user: UserData, dDateFrom: dayjs.Dayjs, dDateTo?: dayjs.Dayjs, filter?: StravaActivityFilter): Promise<number> => {
        if (!dDateTo) dDateTo = dayjs()
        if (!filter) filter = {}

        let activityCount = 0
        const dateLog = `${dDateFrom.format("lll")} to ${dDateTo.format("lll")}`
        const now = dayjs().utc()

        try {
            if (this.queueBlockedReason(user) || !user.recipes || Object.keys(user.recipes).length == 0) {
                logger.info("Strava.batchProcessActivities", logHelper.user(user), "User suspended, has no Strava tokens or no recipes, won't process")
                return null
            }

            // Check if passed date range is valid.
            const maxDays = !user.isTrial && user.isPro ? settings.plans.pro.batchDays : settings.plans.free.batchDays
            const minDate = now.subtract(maxDays + 1, "days").startOf("day")
            if (minDate.isAfter(dDateFrom)) {
                throw new Error(`Invalid date range, minimum allowed date: ${minDate.format("LL")}`)
            }

            // Fetch user activities for the specified time range.
            const activities = await stravaActivities.getActivities(user, {after: dDateFrom, before: dDateTo})

            if (activities.length == 0) {
                logger.warn("Strava.batchProcessActivities", logHelper.user(user), dateLog, "No activities for that date range")
                return 0
            }

            // Add each of the user's activities to the processing queue, but only if they are valid
            // according to the (optional) passed filters.
            for (let activity of activities) {
                try {
                    let valid = true
                    if (filter.private === true && !activity.private) valid = false
                    if (filter.private === false && activity.private) valid = false
                    if (filter.commute === true && !activity.commute) valid = false
                    if (filter.commute === false && activity.commute) valid = false
                    if (filter.race === true && activity.workoutType != StravaRideType.Race && activity.workoutType != StravaRunType.Race) valid = false
                    if (filter.race === false && (activity.workoutType == StravaRideType.Race || activity.workoutType == StravaRunType.Race)) valid = false
                    if (filter.sportType && activity.sportType != filter.sportType) valid = false

                    // Passed the activity filters? Proceed and queue.
                    if (valid) {
                        await this.queueActivity(user, activity.id, true)
                        activityCount++
                    }
                } catch (innerEx) {
                    logger.error("Strava.batchProcessActivities", logHelper.user(user), logHelper.activity(activity), innerEx)
                }
            }

            // Update user with the current date.
            await users.update({id: user.id, displayName: user.displayName, dateLastBatchProcessing: now.toDate()})

            logger.info("Strava.batchProcessActivities", logHelper.user(user), dateLog, `Queued ${activities.length} activities`)

            return activityCount
        } catch (ex) {
            logger.error("Strava.batchProcessActivities", logHelper.user(user), dateLog, ex)
            throw ex
        }
    }

    /**
     * Process activity event pushed by Strava.
     * @param user The activity's owner (user).
     * @param pActivity Processed activity metadata.
     */
    processActivity = async (user: UserData, pActivity: Partial<StravaProcessedActivity>): Promise<StravaProcessedActivity> => {
        const signal = getTimeoutSignal()
        signal?.throwIfAborted()
        const debugLogger = user.debug ? logger.warn : logger.debug
        const activityId = pActivity.id
        let saveError
        let activity: StravaActivity

        try {
            let recipe: RecipeData
            let recipeIds = []

            // User suspended? Stop here.
            if (user.suspended) {
                logger.warn("Strava.processActivity", logHelper.user(user), `User suspended, won't process activity ${activityId}`)
                return null
            }

            // If user has no recipes and hasn't logged in for a while? Stop here.
            if ((!user.recipes || Object.keys(user.recipes).length == 0) && dayjs().diff(user.dateLogin, "days") > settings.users.idleDays.default) {
                logger.info("Strava.processActivity", logHelper.user(user), `No recipes, user is idle, won't process activity ${activityId}`)
                return null
            }

            // Get activity details from Strava. Repeated passes of the same segment are only
            // returned when a recipe counts segments, since that makes the Strava response much bigger.
            try {
                const countSegments = Object.values(user.recipes || {}).some((r: RecipeData) => !r.disabled && r.counterProp?.startsWith("segments"))
                activity = await stravaActivities.getActivity(user, activityId, countSegments)
                signal?.throwIfAborted()
                if (isActivityIgnored(user, activity, "automation")) {
                    return null
                }

                if (pActivity.batch) {
                    activity.batch = true
                }
            } catch (ex) {
                signal?.throwIfAborted()
                const status = ex.response?.status || ex.status || null
                const message = ex.message || ex.toString()

                if (status == 404) {
                    logger.warn("Strava.processActivity", logHelper.user(user), `Activity ${activityId} not found`)
                    return null
                }

                // Add the activity to the queue to retry processing it later.
                if (!pActivity.queued) {
                    await this.queueActivity(user, activityId, false, `${status}: ${message}`)
                }

                ex.message = `Failed to get activity from Strava: ${message}`
                throw ex
            }

            // Update battery tracking straight away if user is PRO and activity was made with a Garmin or Wahoo device.
            try {
                const device = activity.device?.toLowerCase() || ""
                const isGarminWahoo = (user.garmin?.id || user.wahoo?.id) && (device.includes("garmin") || device.includes("wahoo"))
                if (user.isPro && isGarminWahoo) {
                    await updateBatteryTracker(user, [activity])
                }
            } catch (batteryEx) {
                logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "Failed to update sensor batteries", batteryEx)
            }

            // Check for FTP updates in case user has opted-in and the activity happened in the last few days.
            try {
                const shouldUpdateFtp = user.isPro && user.profile.ftp && user.preferences.ftpAutoUpdate
                const powerIncreased = activity.hasPower && activity.wattsWeighted >= user.profile.ftp
                const isRecent = dayjs().utc().subtract(2, "days").isBefore(activity.dateStart)
                if (shouldUpdateFtp && powerIncreased && isRecent) {
                    await stravaPerformance.processPerformance(user, [activity], true)
                }
            } catch (ftpEx) {
                logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "Failed to auto-update FTP", ftpEx)
            }

            // Check for new records.
            signal?.throwIfAborted()
            await stravaAthletes.checkActivityRecords(user, [activity])
            signal?.throwIfAborted()

            // Check and get recipes, sorted by the user-specified order.
            if (!user.recipes) {
                debugLogger("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "User has no recipes to process")
                return null
            }
            let sortedRecipes: RecipeData[] = _.sortBy(Object.values(user.recipes), ["defaultFor", "order", "title"])

            // If PRO subscription was cancelled but user still have many recipes, consider just the first ones.
            if (!user.isPro && sortedRecipes.length > settings.plans.free.maxRecipes) {
                sortedRecipes = sortedRecipes.slice(0, settings.plans.free.maxRecipes)
            }

            // Evaluate each of user's recipes, and set update to true if something was processed.
            for (recipe of sortedRecipes) {
                signal?.throwIfAborted()
                try {
                    const matched = await recipes.evaluate(user, recipe.id, activity)
                    signal?.throwIfAborted()
                    if (matched) {
                        recipeIds.push(recipe.id)

                        if (recipe.killSwitch) {
                            debugLogger("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, `Recipe ${recipe.id} kill switch`)
                            break
                        }
                    }
                } catch (innerEx) {
                    signal?.throwIfAborted()
                    logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, logHelper.recipe(recipe), innerEx)
                }
            }

            // Activity updated? Save to Strava and increment activity counter.
            if (recipeIds.length > 0) {
                const actions = []
                recipeIds.forEach((rid) => user.recipes[rid].actions.forEach((a) => actions.push(a.type)))

                logger.info("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, pActivity.queued ? "From queue" : "Realtime", `Recipes: ${recipeIds.join(", ")}`, `Actions: ${_.uniq(actions).join(", ")}`)

                // Remove duplicates from list of updated fields.
                activity.updatedFields = _.uniq(activity.updatedFields || [])

                // Write suspended (possibly missing permissions)? Stop here.
                if (user.writeSuspended) {
                    logger.warn("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "User.writeSuspended, won't update the activity")
                    return null
                }

                // Save to Strava! Once written, the remaining persistence below can't be aborted by the deadline,
                // otherwise the activity would stay queued and the Strava update would be repeated on retry.
                let stravaWritten = false
                try {
                    signal?.throwIfAborted()
                    await stravaActivities.setActivity(user, activity)
                    stravaWritten = true
                    cache.set("processed-activities", activity.id, activity.dateStart)
                } catch (ex) {
                    if (!stravaWritten) signal?.throwIfAborted()
                    logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, ex)
                    saveError = ex.friendlyMessage || ex.message || ex

                    // Create notification for user in case the activity exists but could not be processed.
                    if (activity.dateEnd) {
                        try {
                            let aDate = dayjs(activity.dateEnd)
                            if (activity.utcStartOffset) {
                                aDate = aDate.add(activity.utcStartOffset, "minutes")
                            }

                            const title = `Failed to process activity ${activity.id}`
                            const body = `There was an error processing your ${activity.sportType} "${activity.name}", on ${aDate.format("lll")}. Strava returned an error message.`
                            const expiry = dayjs().add(14, "days").toDate()

                            await notifications.createNotification(user, {title: title, body: body, activityId: activity.id, dateExpiry: expiry})
                        } catch (innerEx) {
                            logger.warn("Strava.processActivity", `Failed creating notification for activity ${activityId}, from user ${user.id}`)
                        }
                    }
                }

                // Save the processed activity first, then update the count on user data. The count is not
                // touched on deadline retries, as the processed record replaces the queued one.
                const persist = async () => {
                    const saved = await this.saveProcessedActivity(user, activity, recipeIds, saveError)
                    await users.setActivityCount(user)
                    user.activityCount++
                    return saved
                }
                try {
                    if (stravaWritten) return await withoutTimeout(persist)
                    signal?.throwIfAborted()
                    return await persist()
                } catch (ex) {
                    if (!stravaWritten) signal?.throwIfAborted()
                    logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, "Not saved to database", ex)
                    return null
                }
            }

            // No matching recipes but user has opted for AI features? We still need to save it so we can generate prompts using its data.
            if (user.preferences.aiEnabled) {
                logger.info("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, pActivity.queued ? "From queue" : "Realtime", "No matching recipes, but will save data for AI insights")
                return await this.saveProcessedActivity(user, activity)
            }

            logger.info("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, `No matching recipes, won't process`)
        } catch (ex) {
            logger.error("Strava.processActivity", logHelper.user(user), `Activity ${activityId}`, ex)
            throw ex
        }

        return null
    }

    /**
     * Run processing in a cancellable deadline scope. Timed-out activities should be
     * kept queued (or re-queued) so they are retried on the next run.
     * @param user The activity's owner (user).
     * @param pActivity Processed activity metadata.
     * @param timeoutMs Optional max duration in milliseconds, defaults to the activityTimeout setting.
     */
    processActivityWithTimeout = async (user: UserData, pActivity: Partial<StravaProcessedActivity>, timeoutMs?: number): Promise<StravaProcessedActivity> => {
        const maxMs = timeoutMs || settings.strava.processingQueue.activityTimeout * 1000
        return withTimeout(() => this.processActivity(user, pActivity), maxMs, `Timed out processing activity ${pActivity.id} after ${maxMs}ms`)
    }

    /**
     * Save a processed activity with user and recipe details to the database.
     * @param user The activity's owner.
     * @param activity The Strava activity details.
     * @param recipeIds Array of triggered recipe IDs.
     * @param error If errored, this will contain the error details.
     */
    saveProcessedActivity = async (user: UserData, activity: StravaActivity, recipeIds?: string[], error?: string): Promise<StravaProcessedActivity> => {
        const signal = getTimeoutSignal()
        signal?.throwIfAborted()
        try {
            const data: StravaProcessedActivity = {
                id: activity.id,
                name: activity.name,
                dateProcessed: dayjs.utc().toDate(),
                userId: user.id
            }

            // Get updated fields.
            if (activity.updatedFields?.length > 0) {
                let updatedFields = {}
                for (let field of activity.updatedFields) {
                    if (field == "gear") {
                        updatedFields[field] = activity.gear.id == "none" ? "None" : `${activity.gear.name} (${activity.gear.id})`
                    } else {
                        updatedFields[field] = activity[field]
                    }
                }
                data.updatedFields = updatedFields
            }

            // Get recipe summary.
            if (recipeIds?.length > 0) {
                let recipeDetails = {}
                recipeIds?.forEach((id) => {
                    recipeDetails[id] = {
                        title: user.recipes[id].title,
                        conditions: _.map(user.recipes[id].conditions, getConditionSummary),
                        actions: _.map(user.recipes[id].actions, getActionSummary)
                    }
                })
                data.recipes = recipeDetails
            }

            // Extra activity details in case user has not opted for the privacy mode.
            // Even more details if user has opted in for the AI features.
            if (!user.preferences.privacyMode) {
                const mainFields = ["sportType", "name", "dateStart", "utcStartOffset", "totalTime", "movingTime", "distance", "distanceUnit", "device", "newRecords"]
                _.assign(data, _.pick(activity, mainFields))

                if (user.preferences.aiEnabled) {
                    const extraFields = ["elevationGain", "elevationUnit", "speedAvg", "speedMax", "wattsAvg", "wattsWeighted", "wattsMax", "wattsKg", "hrAvg", "hrMax", "cadenceAvg", "tss", "weatherSummary"]
                    _.assign(data, _.pick(activity, extraFields))

                    // Weather summaries are not available for batch processed activities.
                    if (!activity.weatherSummary && !activity.batch) {
                        const weatherSummary = await weather.getActivityWeather(user, activity, false)
                        signal?.throwIfAborted()
                        const anySummary = weatherSummary?.mid || weatherSummary?.start || weatherSummary?.end
                        if (anySummary) {
                            activity.weatherSummary = weatherSummaryString(anySummary)
                        }
                    }
                }
            }

            // Backlink added to activity?
            if (activity.backlink) {
                logger.info("Strava.backlink", logHelper.user(user), logHelper.activity(activity))
                data.backlink = true
            }

            // Make sure error is a string (if an error was passed).
            if (error) {
                data.error = error.toString()
            }

            // Save and return result. Empty processed values are removed before saving.
            // No abort check after this point, so the saved record always gets its event dispatched.
            await database.set("activities", _.omitBy(data, _.isNil), activity.id.toString())
            logger.debug("Strava.saveProcessedActivity", data)

            // Dispatch processed event and return saved data.
            eventManager.emit("Strava.activityProcessed", user, activity)

            return data
        } catch (ex) {
            logger.error("Strava.saveProcessedActivity", logHelper.user(user), logHelper.activity(activity), ex)
            throw ex
        }
    }

    /**
     * Delete all saved / processed activities for the specified user and / or max age.
     * At least one argument is required. Returns the number of deleted activities.
     * @param user Optional user account.
     * @param ageDays Optional max age (in days).
     */
    deleteProcessedActivities = async (user?: UserData | null, ageDays?: number): Promise<number> => {
        if (!user && !ageDays) {
            throw new Error("At least a user or a max age in days is necessary")
        }

        if (!ageDays) ageDays = 0

        const userLog = user ? logHelper.user(user) : "All users"
        const sinceLog = ageDays > 0 ? `Older than ${ageDays} days` : "Since the beginning"
        const where: any[] = []

        try {
            if (user) {
                where.push(["userId", "==", user.id])
            }
            if (ageDays > 0) {
                const maxDate = dayjs().subtract(ageDays, "days").toDate()
                where.push(["dateProcessed", "<", maxDate])
            }

            // At least a user or age must be passed.
            if (where.length == 0) {
                throw new Error("A user or an ageDays must be passed")
            }

            const count = await database.delete("activities", where)
            logger.info("Strava.deleteProcessedActivities", userLog, sinceLog, `Deleted ${count || "no"} activities`)

            return count
        } catch (ex) {
            logger.error("Strava.deleteProcessedActivities", userLog, sinceLog, ex)
            return 0
        }
    }

    // ACTIVITY QUEUE
    // --------------------------------------------------------------------------

    /**
     * Returns the reason why activities from the specified user can't be queued, or null if they can.
     * Suspended users and users without Strava tokens never have activities queued.
     * @param user The activities owner (user).
     */
    queueBlockedReason = (user: UserData): string => {
        if (user.suspended) return "User suspended"
        if (!user.stravaTokens || (!user.stravaTokens.accessToken && !user.stravaTokens.refreshToken)) return "User has no Strava tokens"
        return null
    }

    /**
     * Add activity to the collection of activities to be processed later.
     * @param user The activity's owner (user).
     * @param activityId The activity's unique ID.
     * @param batch Queued as part of a batch processing for old activities?
     * @param error Queued because of a processing error?
     * @param processing Flag the activity as processing (lease), so the queue only retries it once the processing timeout expires.
     * @param webhookAction Pending webhook action (update or delete) to be replayed by the queue, kept separate from a pending processing.
     */
    queueActivity = async (user: UserData, activityId: number, batch?: boolean, error?: any, processing?: boolean, webhookAction?: string): Promise<void> => {
        const blockedReason = this.queueBlockedReason(user)
        if (blockedReason) {
            logger.warn("Strava.queueActivity", logHelper.user(user), `${blockedReason}, won't queue activity ${activityId}`)
            return
        }

        // Add the activity to the queue to be processed on the next batch.
        // If the activity was already queued then keep the original dateQueued.
        // Webhook actions are added to webhookActions without touching the pending processing state.
        try {
            const id = activityId.toString()
            const existing = await database.runTransaction(async (transaction) => {
                const saved: StravaProcessedActivity = await transaction.get("activities", id)
                const data: any = {id: id, userId: user.id, dateQueued: saved?.dateQueued || new Date()}

                if (webhookAction) {
                    data.webhookActions = _.union(saved?.webhookActions || [], [webhookAction])
                } else {
                    data.queued = true
                    if (batch) data.batch = true
                    if (error) data.error = error
                    if (processing) {
                        data.processing = true
                        data.dateProcessing = new Date()
                    }
                }

                transaction.merge("activities", data)
                return saved ? true : false
            })

            const logAction = webhookAction ? ` (${webhookAction})` : ""
            if (existing) {
                logger.warn("Strava.queueActivity", logHelper.user(user), `Activity ${activityId}${logAction} already queued or processed`)
            } else {
                logger.info("Strava.queueActivity", logHelper.user(user), `Activity ${activityId}${logAction} queued`)
            }
        } catch (ex) {
            logger.error("Strava.queueActivity", logHelper.user(user), `Activity ${activityId}`, ex)
            throw ex
        }
    }

    /**
     * Get queued activities, with an optional minimum interval.
     * @param beforeDate Only get activities that were queued before that specified date.
     * @param batchSize Optional batch size, otherwise use the default from settings.
     */
    getQueuedActivities = async (beforeDate: Date, batchSize?: number): Promise<StravaProcessedActivity[]> => {
        const logDate = `Before ${dayjs(beforeDate).format("lll")}`
        if (!batchSize) batchSize = settings.strava.processingQueue.batchSize

        // Get queued activities from the database.
        try {
            const activities = await this.getExpiredQueuedActivities(beforeDate, batchSize)

            if (activities.length > 0) {
                logger.info("Strava.getQueuedActivities", logDate, `Batch size: ${batchSize}`, `Got ${activities.length} queued activities`)
                return activities
            }

            // If no recent activities were returned, check if we have older activities as part of batch processing?
            // Retried batch activities are excluded, as they only become due once their retry backoff is over.
            const batchWhere = [["batch", "==", true]]
            const batchActivities = (await database.search("activities", batchWhere, null, batchSize)).filter((a) => !a.retryCount && !a.timeoutCount)

            const batchLog = batchActivities.length > 0 ? `${batchActivities.length} batch activities` : "no queued or batch activities"
            logger.info("Strava.getQueuedActivities", logDate, `Batch size: ${batchSize}`, `Got ${batchLog}`)

            return batchActivities
        } catch (ex) {
            logger.error("Strava.getQueuedActivities", logDate, `Batch size: ${batchSize}`, ex)
            return []
        }
    }

    /**
     * Get activities that were queued before the specified date, oldest first.
     * @param beforeDate Only get activities that were queued before that specified date.
     * @param batchSize Optional batch size, otherwise use the default from settings.
     */
    getExpiredQueuedActivities = async (beforeDate: Date, batchSize?: number): Promise<StravaProcessedActivity[]> => {
        if (!batchSize) batchSize = settings.strava.processingQueue.batchSize
        return database.search("activities", [["dateQueued", "<=", beforeDate]], "dateQueued", batchSize)
    }

    /**
     * Get and process queued (delayed processing) activities.
     * @param batchSize Optional batch size, otherwise use the default from settings (10 activities).
     */
    processQueuedActivities = async (batchSize?: number): Promise<void> => {
        const usersCache: {[id: string]: UserData} = {}
        if (!batchSize) batchSize = settings.strava.processingQueue.batchSize
        const logBatchSize = `Batch size: ${batchSize}`

        try {
            const now = dayjs()
            const queueSettings = settings.strava.processingQueue
            const activityTimeoutMs = queueSettings.activityTimeout * 1000
            const runDeadline = now.add(queueSettings.maxRunDuration, "seconds")
            const processingCutDate = now.subtract(queueSettings.processingTimeout, "seconds").toDate()
            const beforeDate = now.subtract(queueSettings.delayedSeconds, "seconds").toDate()
            const queuedActivities = await this.getQueuedActivities(beforeDate, batchSize)

            // Filter activities that are not currently being processed, or whose processing lease has
            // expired (falling back to dateQueued for older entries).
            const activities = queuedActivities.filter((a) => !a.processing || (a.dateProcessing || a.dateQueued) < processingCutDate)
            let processedCount = 0

            // No activities to be processed? Stop here.
            if (activities.length == 0) {
                logger.debug("Strava.processQueuedActivities", logBatchSize, "No queued activities to be processed")
                return
            }

            // Check if we have activities from that batch which are already being processed by another job.
            const skipped = queuedActivities.length - activities.length
            const skipLog = skipped > 0 ? `, skipping ${skipped} already processing` : ""
            logger.info("Strava.processQueuedActivities", logBatchSize, `Will process ${activities.length} activities${skipLog}`)

            // Process each of the queued activities separately, stopping once the maximum run duration is reached.
            for (let activityIndex = 0; activityIndex < activities.length; activityIndex++) {
                let pActivity = activities[activityIndex]
                let claimed = false
                let timeoutMs = activityTimeoutMs

                try {
                    if (!(pActivity.userId in usersCache)) {
                        usersCache[pActivity.userId] = await users.getById(pActivity.userId)
                    }
                    const user = usersCache[pActivity.userId]
                    if (!user) {
                        logger.warn("Strava.processQueuedActivities", `User ${pActivity.userId} not found, deleting queued activity ${pActivity.id}`)
                        await this.deleteQueuedActivity(pActivity)
                        continue
                    }

                    // Suspended or no Strava tokens? Drop it straight away instead of letting it time out.
                    const blockedReason = this.queueBlockedReason(user)
                    if (blockedReason) {
                        logger.warn("Strava.processQueuedActivities", logHelper.user(user), `${blockedReason}, deleting queued activity ${pActivity.id}`)
                        await this.deleteQueuedActivity(pActivity)
                        continue
                    }

                    // Out of budget? Leftover activities are picked up by the next run.
                    // Each activity gets the activity timeout, or whatever is left of the run budget.
                    timeoutMs = Math.min(activityTimeoutMs, runDeadline.diff(dayjs()))
                    if (timeoutMs < queueSettings.minActivityTimeout * 1000) {
                        logger.warn("Strava.processQueuedActivities", logBatchSize, `Max run duration exceeded, ${activities.length - activityIndex} activities left for the next run`)
                        break
                    }

                    // Atomically claim the processing lease, so concurrent runs don't process the same activity.
                    pActivity = await this.claimQueuedActivity(pActivity, processingCutDate)
                    if (!pActivity) continue
                    claimed = true

                    // Pending processing (create webhook or batch) and / or webhook actions (update / delete)?
                    // Legacy entries with a single webhookAction on a processed activity have no pending processing.
                    const webhookActions = _.union(pActivity.webhookActions || [], pActivity.webhookAction ? [pActivity.webhookAction] : [])
                    const pendingProcessing = pActivity.queued && !(pActivity.webhookAction && pActivity.dateProcessed)
                    let processed: StravaProcessedActivity

                    if (pendingProcessing && !webhookActions.includes("delete")) {
                        processed = await this.processActivityWithTimeout(user, pActivity, timeoutMs)
                    }
                    for (let action of webhookActions) {
                        eventManager.emit(`Strava.activity${action == "delete" ? "Deleted" : "Updated"}`, user, pActivity.id)
                    }

                    // Processed activities replace the queued entry. Invalid activities, or ones with no matching recipes, are deleted.
                    if (processed) {
                        processedCount++
                    } else if (pendingProcessing) {
                        await this.deleteQueuedActivity({id: pActivity.id, userId: pActivity.userId, webhookAction: webhookActions.includes("delete") ? "delete" : undefined})
                    } else {
                        for (let action of webhookActions) {
                            await this.clearWebhookAction(pActivity, action)
                        }
                        await this.updateQueuedActivity(pActivity.id, {processing: false})
                    }
                } catch (activityEx) {
                    if (claimed) {
                        await this.retryQueuedActivity(usersCache[pActivity.userId], pActivity, activityEx, timeoutMs < activityTimeoutMs)
                    } else {
                        logger.error("Strava.processQueuedActivities", `Failed to process queued activity ${pActivity.id} from user ${pActivity.userId}`, activityEx)
                    }
                }
            }

            if (processedCount > 0) {
                logger.info("Strava.processQueuedActivities", logBatchSize, `Processed ${processedCount} out of ${activities.length} queued activities`)
            } else {
                logger.debug("Strava.processQueuedActivities", logBatchSize, `No processed activities out of ${activities.length} queued activities`)
            }
        } catch (ex) {
            logger.error("Strava.processQueuedActivities", logBatchSize, ex)
        }
    }

    /**
     * Claim the processing lease of a queued activity inside a transaction. Returns the
     * up-to-date queued activity, or null if it was processed, rescheduled or claimed meanwhile.
     * @param activity The queued activity.
     * @param processingCutDate Processing leases started before this date are considered expired.
     */
    private claimQueuedActivity = async (activity: StravaProcessedActivity, processingCutDate: Date): Promise<StravaProcessedActivity> => {
        try {
            return await database.runTransaction(async (transaction) => {
                const saved: StravaProcessedActivity = await transaction.get("activities", activity.id.toString())
                if (!saved?.dateQueued || saved.userId != activity.userId) return null
                if (saved.dateQueued.valueOf() != activity.dateQueued?.valueOf()) return null
                if (saved.processing && (saved.dateProcessing || saved.dateQueued) >= processingCutDate) return null

                const lease = {processing: true, dateProcessing: new Date()}
                transaction.merge("activities", {id: saved.id.toString(), ...lease})
                return {...saved, ...lease}
            })
        } catch (ex) {
            logger.error("Strava.claimQueuedActivity", `User ${activity.userId}`, `Activity ${activity.id}`, ex)
            return null
        }
    }

    /**
     * Merge data into a queued activity inside a transaction, only if it's still queued,
     * so activities processed or deleted meanwhile are not recreated. Returns true if updated.
     * @param id The activity ID.
     * @param data Data to be merged.
     */
    private updateQueuedActivity = async (id: number | string, data: any): Promise<boolean> => {
        return database.runTransaction(async (transaction) => {
            const saved: StravaProcessedActivity = await transaction.get("activities", id.toString())
            if (!saved?.dateQueued) return false
            transaction.merge("activities", {...data, id: id.toString()})
            return true
        })
    }

    /**
     * Schedule a failed queued activity for retry with an exponential backoff. Errors and timeouts are counted separately,
     * and once retries are exhausted the activity is saved with the error so it shows up on the automation history.
     * @param user The activity's owner (user).
     * @param pActivity The queued activity.
     * @param ex The processing error.
     * @param partialBudget Activity had less than the full activity timeout, so a timeout is not counted.
     */
    private retryQueuedActivity = async (user: UserData, pActivity: StravaProcessedActivity, ex: any, partialBudget?: boolean): Promise<void> => {
        const queueSettings = settings.strava.processingQueue
        const activityLog = `Activity ${pActivity.id} from user ${pActivity.userId}`
        const message = ex.message || ex.toString()

        try {
            if (ex.isTimeout && partialBudget) {
                logger.warn("Strava.processQueuedActivities", `${activityLog} timed out with a partial run budget, will retry on the next run`)
                await this.updateQueuedActivity(pActivity.id, {processing: false})
                return
            }

            const countField = ex.isTimeout ? "timeoutCount" : "retryCount"
            const count = (pActivity[countField] || 0) + 1
            if (count > queueSettings.retry) {
                logger.warn("Strava.processQueuedActivities", `${activityLog} failed too many times (${countField}: ${count}): ${message}`)
                await this.failQueuedActivity(user, pActivity, `Failed after ${count} attempts: ${message}`)
                return
            }

            // Retried activities are moved back in the queue (dateQueued), so they only become due after the backoff.
            const attempts = (pActivity.retryCount || 0) + (pActivity.timeoutCount || 0)
            const backoff = queueSettings.retryBackoff[Math.min(attempts, queueSettings.retryBackoff.length - 1)]
            const dateQueued = new Date(Date.now() + (backoff - queueSettings.delayedSeconds) * 1000)
            logger.warn("Strava.processQueuedActivities", `${activityLog} ${ex.isTimeout ? "timed out" : "failed"}, will retry in ${backoff}s: ${message}`)
            await this.updateQueuedActivity(pActivity.id, {processing: false, [countField]: count, error: message, dateQueued: dateQueued})
        } catch (innerEx) {
            logger.error("Strava.processQueuedActivities", `${activityLog} failed to schedule retry`, innerEx)
        }
    }

    /**
     * Save a queued activity that failed too many times as a processed activity with an error,
     * and notify the user (except for batch processing).
     * @param user The activity's owner (user).
     * @param pActivity The queued activity.
     * @param error Error message.
     */
    private failQueuedActivity = async (user: UserData, pActivity: StravaProcessedActivity, error: string): Promise<void> => {
        const id = pActivity.id.toString()
        const failed = await database.runTransaction(async (transaction) => {
            const saved: StravaProcessedActivity = await transaction.get("activities", id)
            if (!saved?.dateQueued) return false
            const queueData = Object.fromEntries(queueFields.map((field) => [field, FieldValue.delete()]))
            transaction.merge("activities", {...queueData, id: id, userId: saved.userId, dateProcessed: dayjs.utc().toDate(), error: error})
            return true
        })

        if (failed && !pActivity.batch && user) {
            try {
                const title = `Failed to process activity ${pActivity.id}`
                const body = `There was an error processing your activity ${pActivity.id}, and it could not be automated after multiple attempts.`
                const expiry = dayjs().add(14, "days").toDate()
                await notifications.createNotification(user, {title: title, body: body, activityId: parseInt(id), dateExpiry: expiry})
            } catch (notifyEx) {
                logger.warn("Strava.failQueuedActivity", `Failed creating notification for activity ${id}, from user ${pActivity.userId}`)
            }
        }
    }

    /**
     * Remove a single pending webhook action from a queued activity. The activity is only deleted
     * if nothing else is pending (processing or other webhook actions) and it was never processed.
     * @param activity The queued activity.
     * @param webhookAction The webhook action (update or delete) to be removed.
     */
    clearWebhookAction = async (activity: Pick<StravaProcessedActivity, "id" | "userId">, webhookAction: string): Promise<void> => {
        const activityLog = `Activity ${activity.id} (${webhookAction})`
        try {
            const result = await database.runTransaction(async (transaction) => {
                const id = activity.id.toString()
                const saved: StravaProcessedActivity = await transaction.get("activities", id)
                if (!saved) return null
                if (saved.userId != activity.userId) throw new Error("Activity belongs to another user")

                const webhookActions = (saved.webhookActions || []).filter((a) => a != webhookAction)
                const data: any = {id, webhookActions: webhookActions.length > 0 ? webhookActions : FieldValue.delete()}
                if (saved.webhookAction == webhookAction) data.webhookAction = FieldValue.delete()

                // Still pending processing or other actions? Keep the rest of the queue state untouched.
                if (saved.queued || webhookActions.length > 0 || (saved.webhookAction && saved.webhookAction != webhookAction)) {
                    transaction.merge("activities", data)
                    return "webhook action cleared"
                }
                if (saved.dateProcessed) {
                    queueFields.forEach((field) => (data[field] = FieldValue.delete()))
                    transaction.merge("activities", data)
                    return "queue metadata cleared"
                }

                transaction.delete("activities", id)
                return "deleted"
            })

            if (result) {
                logger.info("Strava.clearWebhookAction", `User ${activity.userId}`, `${activityLog} ${result}`)
            }
        } catch (ex) {
            logger.error("Strava.clearWebhookAction", `User ${activity.userId}`, activityLog, ex)
            throw ex
        }
    }

    /**
     * Remove queue metadata without deleting processed history, unless Strava deleted the activity.
     * @param activity The queued activity to be removed.
     */
    deleteQueuedActivity = async (activity: Pick<StravaProcessedActivity, "id" | "userId" | "webhookAction">): Promise<void> => {
        const activityLog = `Activity ${activity.id}`
        try {
            const result = await database.runTransaction(async (transaction) => {
                const id = activity.id.toString()
                const saved: StravaProcessedActivity = await transaction.get("activities", id)
                if (!saved) return null
                if (saved.userId != activity.userId) throw new Error("Activity belongs to another user")

                if (saved.dateProcessed && activity.webhookAction != "delete" && saved.webhookAction != "delete") {
                    transaction.merge("activities", {id, ...Object.fromEntries(queueFields.map((field) => [field, FieldValue.delete()]))})
                    return "queue metadata cleared"
                }

                transaction.delete("activities", id)
                return "deleted"
            })

            if (result) {
                logger.info("Strava.deleteQueuedActivity", `User ${activity.userId}`, `${activityLog} ${result}`)
            } else {
                logger.warn("Strava.deleteQueuedActivity", `User ${activity.userId}`, `${activityLog} not previously saved`)
            }
        } catch (ex) {
            logger.error("Strava.deleteQueuedActivity", `User ${activity.userId}`, activityLog, ex)
            throw ex
        }
    }
}

// Exports...
export default StravaActivityProcessing.Instance
