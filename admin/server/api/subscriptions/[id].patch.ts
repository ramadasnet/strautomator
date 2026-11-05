// Strautomator Admin API: update a subscription, keeping the user PRO state in sync

import {BaseSubscription, UserData, database, subscriptions, users} from "strautomator-core"
import {FieldValue} from "@google-cloud/firestore"
import {audited, requireDoc, requireUser, parseDate, parseString} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

const STATUSES = ["APPROVAL_PENDING", "APPROVED", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]
const FREQUENCIES = ["monthly", "yearly", "lifetime"]
const ACTIVE_STATUSES = ["ACTIVE", "TRIAL"]

export default defineEventHandler(async (e) => {
    const subId = getRouterParam(e, "id")
    const body = await readBody(e)

    try {
        if (!_.isPlainObject(body)) {
            throw createError({statusCode: 400, message: "Invalid request body"})
        }

        const sub: BaseSubscription = await requireDoc("subscriptions", subId)
        const data: Partial<BaseSubscription> = {id: sub.id}
        const before = {}
        const after = {}

        // Track a changed field (before / after) for the audit log.
        const change = (field: string, value: any) => {
            before[field] = sub[field] ?? null
            after[field] = value
            data[field] = value === null ? FieldValue.delete() : value
        }

        if (!_.isNil(body.status) && body.status != sub.status) {
            if (!STATUSES.includes(body.status)) {
                throw createError({statusCode: 400, message: "Invalid status"})
            }
            change("status", body.status)
        }
        if (!_.isNil(body.frequency) && body.frequency != sub.frequency) {
            if (!FREQUENCIES.includes(body.frequency)) {
                throw createError({statusCode: 400, message: "Invalid frequency"})
            }
            change("frequency", body.frequency)
        }
        if (!_.isUndefined(body.price) && body.price !== sub.price) {
            const price = body.price === null || body.price === "" ? null : parseFloat(body.price)
            if (price !== null && (isNaN(price) || price < 0)) {
                throw createError({statusCode: 400, message: "Invalid price"})
            }
            if (price !== (sub.price ?? null)) change("price", price)
        }
        if (!_.isUndefined(body.currency)) {
            const currency = parseString(body.currency, "currency", 3).toUpperCase()
            if (currency && !/^[A-Z]{3}$/.test(currency)) {
                throw createError({statusCode: 400, message: "Invalid currency"})
            }
            if (currency != (sub.currency || "")) change("currency", currency || null)
        }
        for (let field of ["dateExpiry", "dateNextPayment"]) {
            if (_.isUndefined(body[field])) continue
            const date = parseDate(body[field], field)
            if ((date?.valueOf() || null) !== (sub[field]?.valueOf() || null)) change(field, date)
        }

        // Moving the subscription to a different user.
        let newUser: UserData = null
        if (!_.isNil(body.userId) && body.userId != sub.userId) {
            newUser = await requireUser(String(body.userId))
            if (newUser.isPro && newUser.subscriptionId && newUser.subscriptionId != sub.id) {
                throw createError({statusCode: 409, message: `User ${newUser.id} already has subscription ${newUser.subscriptionId}`})
            }
            change("userId", newUser.id)
        }

        if (Object.keys(after).length == 0) {
            return {subscription: sub, changed: false}
        }

        const syncUser = body.syncUser !== false
        await audited(e, "subscription.update", sub.id, {before, after, syncUser}, async () => {
            data.dateUpdated = new Date()
            if (!data.userId) data.userId = sub.userId
            await subscriptions.update(data)
            const updated: BaseSubscription = {...sub, ..._.omitBy(data, (v) => v instanceof FieldValue)} as BaseSubscription
            const isActive = ACTIVE_STATUSES.includes(updated.status)

            if (!syncUser) return

            // Previous owner loses PRO when the subscription moves to someone else.
            if (newUser && sub.userId) {
                const previous: UserData = await database.get("users", sub.userId)
                if (previous && previous.subscriptionId == sub.id && previous.isPro) {
                    await users.switchToFree(previous)
                }
            }

            // Sync the PRO state of the subscription owner.
            const owner: UserData = newUser || (updated.userId ? await database.get("users", updated.userId) : null)
            if (!owner) return

            if (isActive && (!owner.isPro || owner.subscriptionId != updated.id)) {
                await users.switchToPro({...owner, isPro: false}, updated, updated.status == "TRIAL")
            } else if (!isActive && owner.isPro && owner.subscriptionId == updated.id) {
                await users.switchToFree(owner, updated)
            }
        })

        return {subscription: await database.get("subscriptions", sub.id), changed: true}
    } catch (ex) {
        logger.error("Route.subscriptions.id PATCH", subId, ex)
        throw ex
    }
})
