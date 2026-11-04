// Strautomator Admin API: delete a GearWear configuration

import {GearWearConfig, gearwear} from "strautomator-core"
import {audited, requireDoc} from "../../utils/admin"
import logger from "anyhow"

export default defineEventHandler(async (e) => {
    const gearId = getRouterParam(e, "id")
    const body = await readBody(e)

    try {
        const config: GearWearConfig = await requireDoc("gearwear", gearId)
        if (body?.confirm !== config.id) {
            throw createError({statusCode: 400, message: "Deletion must be confirmed with the gear ID"})
        }

        await audited(e, "gear.delete", config.id, {userId: config.userId, name: config.name || null, components: config.components.map((c) => c.name)}, () => gearwear.delete(config))
        return {ok: true}
    } catch (ex) {
        logger.error("Route.gear.id DELETE", gearId, ex)
        throw ex
    }
})
