// Strautomator Admin API: startup plugin

import logger from "anyhow"

/**
 * Init the Strautomator Core.
 */
export default defineNitroPlugin(async () => {
    try {
        if (process.env.SMU_APP_STARTED != "1") {
            // Awaited, so requests are only accepted after the core listeners (like the user deletion cleanup) are registered.
            const core = await import("strautomator-core")
            await core.startup()
            process.env.SMU_APP_STARTED = "1"
        }
    } catch (ex) {
        logger.error("Startup", ex)
    }
})
