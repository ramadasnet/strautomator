// Strautomator Admin API: update a GearWear configuration (components and enabled state)

import {GearWearComponent, GearWearConfig, database, gearwear} from "strautomator-core"
import {audited, requireDoc, requireUser, parseString} from "../../utils/admin"
import logger from "anyhow"
import _ from "lodash"

/**
 * Parse a non-negative number from the request body.
 * @param value The value.
 * @param field Field name for the error message.
 */
const parseNumber = (value: any, field: string): number => {
    if (_.isNil(value) || value === "") return 0
    const num = parseFloat(value)
    if (isNaN(num) || num < 0) {
        throw createError({statusCode: 400, message: `Invalid ${field}`})
    }
    return num
}

export default defineEventHandler(async (e) => {
    const gearId = getRouterParam(e, "id")
    const body = await readBody(e)

    try {
        const config: GearWearConfig = await requireDoc("gearwear", gearId)
        const user = await requireUser(config.userId)

        if (config.updating) {
            throw createError({statusCode: 409, message: "Gear is being updated right now, try again later"})
        }

        // Updated components, existing alert dates and reset history are preserved (matched by the original name).
        if (Array.isArray(body?.components)) {
            const gearExists = _.find(user.profile.bikes, {id: config.id}) || _.find(user.profile.shoes, {id: config.id})
            if (!gearExists) {
                throw createError({statusCode: 409, message: `Gear ${config.id} is not on the user's Strava profile anymore, it can only be enabled, disabled or deleted`})
            }
            if (body.components.length > 50) {
                throw createError({statusCode: 400, message: "Too many components"})
            }

            const components: GearWearComponent[] = body.components.map((c: any, index: number) => {
                const name = parseString(c?.name, `name of component ${index + 1}`, 100, true)
                const original = config.components.find((o) => o.name == (c.originalName || name))
                const component: GearWearComponent = {
                    ...(original || {activityCount: 0, history: []}),
                    name: name,
                    currentDistance: Math.round(parseNumber(c.currentDistance, `distance of ${name}`) * 10) / 10,
                    currentTime: Math.round(parseNumber(c.currentTime, `time of ${name}`)),
                    alertDistance: Math.round(parseNumber(c.alertDistance, `alert distance of ${name}`)),
                    alertTime: Math.round(parseNumber(c.alertTime, `alert time of ${name}`)),
                    preAlertPercent: Math.round(parseNumber(c.preAlertPercent, `pre-alert of ${name}`)),
                    activityCount: Math.round(parseNumber(c.activityCount ?? original?.activityCount, `activity count of ${name}`)),
                    dateLastUpdate: new Date()
                } as GearWearComponent

                if (c.disabled === true) component.disabled = true
                else delete component.disabled

                return component
            })

            if (_.uniqBy(components, "name").length != components.length) {
                throw createError({statusCode: 400, message: "Component names must be unique"})
            }

            const details = {components: components.map((c) => _.pick(c, ["name", "currentDistance", "currentTime", "alertDistance", "alertTime", "preAlertPercent", "disabled"]))}
            await audited(e, "gear.update", config.id, details, async () => {
                const updated = await gearwear.upsert(user, {...config, components: components})
                config.components = updated.components
            })
        }

        // Toggle the enabled state.
        if (typeof body?.disabled == "boolean" && body.disabled != (config.disabled || false)) {
            if (body.disabled) {
                await audited(e, "gear.disable", config.id, {userId: config.userId}, () => database.merge("gearwear", {id: config.id, disabled: true}))
            } else {
                await audited(e, "gear.enable", config.id, {userId: config.userId}, () => gearwear.reEnable(user, config))
            }
        }

        return await gearwear.getById(config.id)
    } catch (ex) {
        logger.error("Route.gear.id PATCH", gearId, ex)
        throw ex
    }
})
