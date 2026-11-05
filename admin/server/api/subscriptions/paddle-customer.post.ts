// Strautomator Admin API: change the user linked to a Paddle customer

import {database, paddle, PaddleSubscription, subscriptions, users} from "strautomator-core"
import {FieldValue} from "@google-cloud/firestore"
import {audited} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

export default defineEventHandler(async (e) => {
    const body = await readBody(e)

    try {
        if (typeof body?.id != "string" || typeof body?.userId != "string" || !/^\d+$/.test(body.userId)) {
            throw createError({statusCode: 400, message: "Valid subscription ID and user ID are required"})
        }

        const sub: PaddleSubscription = await database.get("subscriptions", body.id)
        if (!sub) {
            throw createError({statusCode: 404, message: `Subscription ${body.id} not found`})
        }
        if (sub.source != "paddle" || !sub.customerId) {
            throw createError({statusCode: 400, message: `Subscription ${sub.id} is not linked to a Paddle customer`})
        }

        const newUser = await users.getById(body.userId)
        if (!newUser) {
            throw createError({statusCode: 404, message: `User ${body.userId} not found`})
        }
        if (newUser.paddleId && newUser.paddleId != sub.customerId) {
            throw createError({statusCode: 409, message: `User ${newUser.id} is already linked to Paddle customer ${newUser.paddleId}`})
        }
        if (newUser.isPro && newUser.subscriptionId && newUser.subscriptionId != sub.id) {
            throw createError({statusCode: 409, message: `User ${newUser.id} already has subscription ${newUser.subscriptionId}`})
        }

        await audited(e, "subscription.paddleCustomer", sub.id, {customerId: sub.customerId, fromUserId: sub.userId || null, toUserId: newUser.id}, async () => {
            // Update Paddle first, so a failure there leaves the database untouched.
            const customer = await paddle.api.client.customers.get(sub.customerId)
            await paddle.api.client.customers.update(sub.customerId, {customData: {...(customer.customData || {}), userId: newUser.id}})

            // Unlink the previous owner(s) of the Paddle customer / subscription.
            const previousUsers = [await users.getByPaddleId(sub.customerId)]
            if (sub.userId && sub.userId != "notfound") {
                previousUsers.push(await users.getById(sub.userId))
            }
            for (let prev of _.uniqBy(_.compact(previousUsers), "id")) {
                if (prev.id == newUser.id) continue

                // Subscription is not passed to switchToFree, otherwise it would get expired.
                if (prev.subscriptionId == sub.id && prev.isPro) {
                    await users.switchToFree(prev)
                }

                const data: any = {id: prev.id, displayName: prev.displayName}
                if (prev.paddleId == sub.customerId) {
                    data.paddleId = FieldValue.delete()
                }
                if (prev.subscriptionId == sub.id) {
                    data.subscriptionId = FieldValue.delete()
                }
                if (data.paddleId || data.subscriptionId) {
                    await users.update(data)
                }
            }

            // Link the new user to the customer and the selected subscription.
            const newUserData: any = {id: newUser.id, displayName: newUser.displayName, paddleId: sub.customerId}
            const status: string = sub.status
            if (["ACTIVE", "TRIAL"].includes(status)) {
                newUserData.subscriptionId = sub.id
                newUserData.isPro = true
                if (status == "TRIAL") {
                    newUserData.isTrial = true
                }
            }
            if (!newUser.email && sub.email) {
                newUserData.email = sub.email
            }
            await users.update(newUserData)
            await subscriptions.update({id: sub.id, userId: newUser.id})
        })

        logger.info("Route.subscriptions.paddleCustomer", `Paddle customer ${sub.customerId} (subscription ${sub.id}) moved from user ${sub.userId} to ${newUser.id}`)
        return {customerId: sub.customerId, userId: newUser.id, subscriptionId: sub.id}
    } catch (ex) {
        logger.error("Route.subscriptions.paddleCustomer", JSON.stringify(body, null, 0), ex)
        throw ex
    }
})
