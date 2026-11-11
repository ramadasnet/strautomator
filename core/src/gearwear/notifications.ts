// Strautomator Core: GearWear Notify

import {GearWearComponent, GearWearConfig} from "./types"
import {GearWearTips} from "../mailer/templates"
import {StravaGear} from "../strava/types"
import {UserData} from "../users/types"
import mailer from "../mailer"
import notifications from "../notifications"
import _ from "lodash"
import logger from "anyhow"
import * as logHelper from "../loghelper"
import dayjs from "../dayjs"
const settings = require("setmeup").settings

// NOTIFICATIONS
// --------------------------------------------------------------------------

/**
 * Check if a pre alert or alert was recently sent for the specified component.
 * @param component The component to be checked.
 * @returns True if the user was notified recently, false otherwise.
 */
export const wasNotifiedRecently = (component: GearWearComponent): boolean => {
    const minReminderDate = dayjs.utc().subtract(settings.gearwear.reminderDays, "days")
    const datePreAlertSent = component.datePreAlertSent ? dayjs.utc(component.datePreAlertSent) : null
    const dateAlertSent = component.dateAlertSent ? dayjs.utc(component.dateAlertSent) : null
    return datePreAlertSent?.isAfter(minReminderDate) || dateAlertSent?.isAfter(minReminderDate)
}

/**
 * Sends an email to the user when components have reached their distance / time alert threshold,
 * with components batched in a single email per alert type.
 * @param user The user owner of the components.
 * @param gearId The ID of the gear (bike or shoes) that owns the components.
 * @param alerts The components and alert types to be notified.
 */
export const notifyUsage = async (user: UserData, gearId: string, alerts: {component: GearWearComponent; alertType: "PreAlert" | "Alert" | "Reminder"}[]): Promise<void> => {
    const units = user.profile.units == "imperial" ? "mi" : "km"
    const logGear = `Gear ${gearId}`

    try {
        // Get bike or shoe details.
        const bike = _.find(user.profile.bikes, {id: gearId})
        const shoe = _.find(user.profile.shoes, {id: gearId})
        const gear: StravaGear = bike || shoe

        // Group the alerts per type, so each type is notified via a single email.
        const alertGroups = _.groupBy(alerts, (a) => a.alertType)

        for (const alertType of ["PreAlert", "Alert", "Reminder"] as const) {
            const group = alertGroups[alertType]
            if (!group || group.length == 0) continue

            const logComponents = `Components: ${group.map((a) => a.component.name).join(", ")}`

            try {
                // Calculate usage (0 to 100% or more, if surpassed the alert threshold) and alert details for each component.
                const components = group.map(({component}) => {
                    const usage = Math.round((component.alertDistance ? component.currentDistance / component.alertDistance : component.currentTime / component.alertTime) * 100)
                    const alertDetails = []
                    if (component.alertDistance > 0) alertDetails.push(`${component.alertDistance} ${units}`)
                    if (component.alertTime > 0) alertDetails.push(`${Math.round(component.alertTime / 3600)} hours`)

                    return {
                        component: component,
                        hours: Math.round((component.currentTime / 3600) * 10) / 10,
                        usage: usage,
                        alertDetails: alertDetails.join(", ")
                    }
                })

                // User has email set? Send via email, otherwise create a notification.
                if (user.email) {
                    // Build the email blocks with the details of each component.
                    const blocks = components.map((c) => {
                        const compName = encodeURIComponent(c.component.name)
                        const resetLink = `${settings.app.url}gear/edit?id=${gear.id}&reset=${encodeURIComponent(compName)}`
                        const affiliateLink = `${settings.affiliates.server.url}s/${compName.toLowerCase()}?rn=1&from=${encodeURIComponent(settings.app.title)}`

                        let block = `<strong>${c.component.name}</strong><br>Currently with ${c.component.currentDistance} ${units}, ${c.hours} hours (${c.usage}% of target usage)`
                        if (alertType == "PreAlert") {
                            const tip = GearWearTips[c.component.name.toLowerCase().replace(/ /g, "")] || ""
                            if (tip) block += `<br>${tip}`
                            block += `<br>If you wish to buy replacement parts early, check the <a href="${affiliateLink}">best deals in our affiliate stores</a>.`
                        } else {
                            block += `<br>Alert on: ${c.alertDetails}`
                            block += `<br>To reset the tracking after replacing the component, please <a href="${resetLink}">click here</a>.`
                            block += `<br>To buy replacement parts, check the <a href="${affiliateLink}">best deals in our affiliate stores</a>.`
                        }
                        return block
                    })

                    const data = {
                        units: units,
                        userId: user.id,
                        gearId: gear.id,
                        gearName: gear.name,
                        count: components.length == 1 ? "1 component" : `${components.length} components`,
                        components: blocks.join("<br><br>")
                    }

                    // Dispatch email to user.
                    await mailer.send({
                        template: `GearWear${alertType}`,
                        data: data,
                        to: user.email
                    })

                    logger.info("GearWear.notifyUsage.email", logHelper.user(user), logGear, logComponents, `${alertType} sent`)
                } else if (alertType == "Alert") {
                    for (const c of components) {
                        const nOptions = {
                            title: `Gear alert: ${gear.name} - ${c.component.name}`,
                            body: `This component has now passed its target usage: ${c.alertDetails}`,
                            href: `/gear/edit?id=${gear.id}`,
                            gearId: gear.id,
                            component: c.component.name
                        }
                        await notifications.createNotification(user, nOptions)
                    }

                    logger.info("GearWear.notifyUsage.notification", logHelper.user(user), logGear, logComponents, "Notification created")
                }
            } catch (ex) {
                logger.error("GearWear.notifyUsage", logHelper.user(user), logGear, logComponents, ex)
            }
        }
    } catch (ex) {
        logger.error("GearWear.notifyUsage", logHelper.user(user), logGear, ex)
    }
}

/**
 * Sends an email when a component hasn't been updated for many weeks.
 * @param user The user owner of the component.
 * @param config The GearWear configuration.
 * @param components The components that haven't been updated for a while.
 */
export const notifyIdle = async (user: UserData, config: GearWearConfig, components: GearWearComponent[]): Promise<void> => {
    const debugLogger = user.debug ? logger.warn : logger.debug
    const units = user.profile.units == "imperial" ? "mi" : "km"

    // Stop here if user is suspended.
    if (user.suspended) {
        logger.warn("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), "User is suspended, won't notify")
        return
    }

    // Validate components.
    if (!components || components.length == 0) {
        debugLogger("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), "No idle components found, no notification needed")
        return
    }

    const logComponents = "Components: + " + components.map((c) => c.name).join(", ")

    try {
        const bike = _.find(user.profile.bikes, {id: config.id})
        const shoe = _.find(user.profile.shoes, {id: config.id})
        const gear: StravaGear = bike || shoe
        if (!gear) {
            config.disabled = true
            logger.warn("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), "Gear not found")
            return
        }

        // User has email set? Send via email, otherwise create a notification.
        if (user.email) {
            const template = "GearWearIdle"
            const data = {
                units: units,
                userId: user.id,
                gearId: gear.id,
                gearName: gear.name,
                components: components.map((c) => `- ${c.name} (last updated on ${dayjs(c.dateLastUpdate).format("ll")})`).join("<br>"),
                editLink: `${settings.app.url}gear/edit?id=${gear.id}`
            }

            // Dispatch email to user.
            await mailer.send({
                template: template,
                data: data,
                to: user.email
            })

            logger.info("GearWear.notifyIdle.email", logHelper.user(user), logHelper.gearwearConfig(user, config), logComponents, "Email sent")
        } else {
            const nOptions = {
                title: `Gear ${gear.name} has idle components`,
                body: `Your gear has ${components.length} components that haven't been updated for a while, please double check them.`,
                href: `/gear/edit?id=${gear.id}`,
                gearId: gear.id
            }
            await notifications.createNotification(user, nOptions)

            logger.info("GearWear.notifyIdle.notification", logHelper.user(user), logHelper.gearwearConfig(user, config), "Notification created")
        }
    } catch (ex) {
        logger.error("GearWear.notifyIdle", logHelper.user(user), logHelper.gearwearConfig(user, config), logComponents, ex)
    }
}
