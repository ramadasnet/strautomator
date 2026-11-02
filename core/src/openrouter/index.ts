// Strautomator Core: OpenRouter

import {AiGenerateOptions, AiProvider, AiProviderName} from "../ai/types"
import {UserData} from "../users/types"
import {AxiosConfig, axiosRequest} from "../axios"
import _ from "lodash"
import Bottleneck from "bottleneck"
import logger from "anyhow"
import * as logHelper from "../loghelper"
const settings = require("setmeup").settings

/**
 * OpenRouter AI wrapper.
 */
export class OpenRouter implements AiProvider {
    private constructor() {}
    private static _instance: OpenRouter
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    /**
     * API limiter module.
     */
    limiter: Bottleneck

    /**
     * How many consecutive failures the API had, used by the circuit breaker.
     */
    failureCount: number = 0

    /**
     * Timestamp (in ms) until when requests are short-circuited due to repeated API failures.
     */
    circuitUntil: number = 0

    /**
     * Current circuit breaker cooldown (in ms), doubled after each new outage up to the max.
     */
    circuitCooldown: number = 0

    // INIT
    // --------------------------------------------------------------------------

    /**
     * Init the OpenRouter wrapper.
     */
    init = async (): Promise<void> => {
        try {
            if (!settings.openrouter.api.key) {
                throw new Error("Missing the openrouter.api.key setting")
            }

            // Create the bottleneck rate limiter.
            this.limiter = new Bottleneck({
                maxConcurrent: settings.openrouter.api.maxConcurrent,
                reservoir: settings.openrouter.api.maxPerMinute,
                reservoirRefreshAmount: settings.openrouter.api.maxPerMinute,
                reservoirRefreshInterval: 1000 * 60
            })

            // Rate limiter events.
            this.limiter.on("error", (err) => logger.error("OpenRouter.limiter", err))
            this.limiter.on("depleted", () => logger.warn("OpenRouter.limiter", "Rate limited"))
        } catch (ex) {
            logger.error("OpenRouter.init", ex)
        }
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Get the OpenRouter model matching the user's preferred AI provider.
     * @param provider The preferred AI provider name.
     * @param useReason True to get the model that uses reason.
     */
    getModel = (provider: AiProviderName, useReason: boolean): string => {
        const models = settings.openrouter.models[provider]
        if (!models) {
            return null
        }
        return (useReason ? models.reason : models.default) || null
    }

    /**
     * Dispatch a prompt to OpenRouter.
     * @param user The user.
     * @param options AI generation options.
     * @param messages The messages to be sent to the assistant.
     */
    prompt = async (user: UserData, options: AiGenerateOptions, messages: string[]): Promise<string> => {
        try {
            // Short-circuit while the API keeps failing, so batch processing won't keep hammering a broken endpoint.
            if (this.circuitUntil > Date.now()) {
                logger.warn("OpenRouter.prompt", logHelper.user(user), options.subject, `Circuit open for another ${Math.round((this.circuitUntil - Date.now()) / 1000)}s, request skipped`)
                return null
            }

            const useReason = user.isPro && options.useReason
            const model = this.getModel(options.provider, useReason) || settings.openrouter.api.defaultModel
            const reqOptions: AxiosConfig = {
                url: `${settings.openrouter.api.baseUrl}chat/completions`,
                method: "POST",
                timeout: settings.ai.timeout,
                headers: {
                    Authorization: `Bearer ${settings.openrouter.api.key}`,
                    "X-Title": "Strautomator"
                },
                data: {
                    model: model,
                    max_tokens: options.maxTokens,
                    stream: false,
                    // Reasoning is never fully disabled as some models now require it,
                    // and its output tokens are excluded from the response text.
                    reasoning: {effort: useReason ? "low" : "minimal", exclude: true},
                    messages: [
                        {role: "system", content: [{type: "text", text: options.instruction, cache_control: {type: "ephemeral"}}]},
                        {role: "user", content: messages.join(" ")}
                    ]
                }
            }

            // Helper to dispatch the request via the rate limiter.
            const dispatch = async (): Promise<any> => this.limiter.schedule(() => axiosRequest(reqOptions))

            // Here we go! If the provider rejected the request with a 400 (for instance a model
            // that can't disable reasoning), retry once using the default model.
            let result: any
            try {
                result = await dispatch()
            } catch (apiEx) {
                const status = apiEx.statusCode || apiEx.response?.status
                if (status == 400 && model != settings.openrouter.api.defaultModel) {
                    logger.warn("OpenRouter.prompt", logHelper.user(user), options.subject, `Model ${model} rejected the request, will try ${settings.openrouter.api.defaultModel}`)
                    reqOptions.data.model = settings.openrouter.api.defaultModel
                    result = await dispatch()
                } else {
                    throw apiEx
                }
            }

            // Successful prompt response? Extract the generated content.
            if (result?.choices?.length > 0) {
                const content = _.compact(result.choices.map((c) => this.getContent(c)))
                if (content.length > 0) {
                    this.resetFailures()
                    return content.join(" ")
                }
            }

            // Failed to generate the activity name.
            this.registerFailure()
            logger.warn("OpenRouter.prompt", logHelper.user(user), options.subject, "Failed to generate")
            return null
        } catch (ex) {
            this.registerFailure()
            logger.error("OpenRouter.prompt", logHelper.user(user), options.subject, ex)
            return null
        }
    }

    // HELPERS
    // --------------------------------------------------------------------------

    /**
     * Extract the generated text out of a completion choice, skipping any
     * reasoning parts that the provider might have included in the message.
     * @param choice A completion choice from the API response.
     */
    private getContent = (choice: any): string => {
        const content = choice.message?.content || choice.text
        if (_.isString(content)) {
            return content
        }
        if (_.isArray(content)) {
            return content
                .filter((p) => !p.type || p.type == "text")
                .map((p) => p.text)
                .join(" ")
        }
        return null
    }

    /**
     * Track an API failure, opening the circuit breaker once too many requests have
     * failed consecutively. The cooldown doubles after each new outage, up to the max.
     */
    private registerFailure = (): void => {
        this.failureCount++
        if (this.failureCount >= settings.openrouter.api.failureThreshold) {
            // Escalate the cooldown only once per outage, on the failure that opens the circuit.
            if (this.circuitUntil <= Date.now()) {
                this.circuitCooldown = this.circuitCooldown ? Math.min(this.circuitCooldown * 2, settings.openrouter.api.failureCooldownMax * 1000) : settings.openrouter.api.failureCooldown * 1000
            }
            this.circuitUntil = Date.now() + this.circuitCooldown
            logger.warn("OpenRouter.registerFailure", `${this.failureCount} consecutive failures`, `Requests paused for ${Math.round(this.circuitCooldown / 1000)}s`)
        }
    }

    /**
     * Reset the API failure counters once a request succeeds.
     */
    private resetFailures = (): void => {
        this.failureCount = 0
        this.circuitCooldown = 0
        this.circuitUntil = 0
    }
}

// Exports...
export default OpenRouter.Instance
