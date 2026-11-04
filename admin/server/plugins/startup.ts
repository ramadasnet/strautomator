// Strautomator Admin API: startup plugin

import logger from "anyhow"

/**
 * Init the Strautomator Core.
 */
export default defineNitroPlugin(async () => {
    try {
        if (process.env.SMU_APP_STARTED != "1") {
            import("strautomator-core")
                .then(async (core) => {
                    await core.startup()
                    process.env.SMU_APP_STARTED = "1"
                })
                .catch((ex) => logger.error("Plugin.startup", ex))
        }
    } catch (ex) {
        logger.error("Startup", ex)
    }
})
