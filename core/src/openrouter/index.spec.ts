// OpenRouter checks (run with: npx tsx src/openrouter/index.spec.ts)

const http = require("http")

let failed = 0

const assert = (cond: any, message: string) => {
    if (!cond) {
        failed++
        console.error(`FAIL: ${message}`)
    } else {
        console.log(`ok: ${message}`)
    }
}

const main = async () => {
    // Fake OpenRouter endpoint: records every request body and answers with the
    // canned status / payload set by each check below.
    let apiCalls: any[] = []
    let apiResponder: (data: any) => {status: number; payload: any} = () => ({status: 200, payload: null})
    const server = http.createServer((req, res) => {
        let body = ""
        req.on("data", (chunk) => (body += chunk))
        req.on("end", () => {
            const data = JSON.parse(body)
            apiCalls.push(data)
            const answer = apiResponder(data)
            res.writeHead(answer.status, {"Content-Type": "application/json"})
            res.end(JSON.stringify(answer.payload))
        })
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

    const {settings} = require("setmeup")
    settings.app = settings.app || {}
    settings.app.title = "Strautomator"
    settings.axios = {timeout: 5000, retryInterval: 1, backoffThreshold: 100, backoffInterval: 1}
    settings.ai = {timeout: 5000}
    settings.openrouter = {
        api: {
            key: "test-key",
            baseUrl: `http://127.0.0.1:${server.address().port}/`,
            defaultModel: "openrouter/auto",
            maxConcurrent: 2,
            maxPerMinute: 100,
            failureThreshold: 3,
            failureCooldown: 60,
            failureCooldownMax: 300
        },
        models: {
            openai: {default: "openai/test-default", reason: "openai/test-reason"}
        }
    }

    const openrouter = require("./index").default

    const okResponse = (text: any) => ({status: 200, payload: {choices: [{message: {content: text}}]}})
    const badRequest = () => ({status: 400, payload: {error: {message: "Reasoning is mandatory for this endpoint and cannot be disabled", code: 400}}})

    const user: any = {id: "u1", isPro: false, displayName: "Test User"}
    const proUser: any = {id: "u2", isPro: true, displayName: "Pro User"}
    const options: any = {provider: "openai", subject: "Test prompt", maxTokens: 100, instruction: "Test instruction"}

    await openrouter.init()
    assert(openrouter.limiter, "limiter was created")

    // Basic prompt flow, using the provider's default (non-reason) model.
    apiResponder = () => ({status: 200, payload: {choices: [{message: {reasoning: "some hidden thinking", content: "Sunny ride"}}]}})
    apiCalls = []
    let out = await openrouter.prompt(user, options, ["Generate a name"])
    assert(out == "Sunny ride", "returns the generated text")
    assert(apiCalls[0].model == "openai/test-default", "uses the provider default model")
    assert(apiCalls[0].reasoning.effort == "minimal", "non-reason requests ask for minimal reasoning")
    assert(apiCalls[0].reasoning.exclude == true, "reasoning output is excluded from the response")
    assert(apiCalls[0].reasoning.effort != "none", "reasoning is never fully disabled")

    // PRO users on reason models get a low reasoning effort.
    out = await openrouter.prompt(proUser, {...options, useReason: true}, ["Generate insights"])
    assert(apiCalls[1].model == "openai/test-reason", "uses the provider reason model")
    assert(apiCalls[1].reasoning.effort == "low", "reason requests keep a low effort")

    // Responses with reasoning parts are still parsed correctly.
    apiResponder = () => ({
        status: 200,
        payload: {
            choices: [
                {
                    message: {
                        reasoning: "thinking hard",
                        content: [
                            {type: "reasoning", text: "hidden chain of thought"},
                            {type: "text", text: "Real answer"}
                        ]
                    }
                }
            ]
        }
    })
    apiCalls = []
    out = await openrouter.prompt(user, options, ["Generate a name"])
    assert(out == "Real answer", "reasoning parts are stripped from the response")

    // A 400 on the selected model retries once with the default model (plus the
    // usual single axios retry, so 3 requests hit the endpoint in total).
    apiCalls = []
    apiResponder = (data) => (data.model == "openai/test-default" ? badRequest() : okResponse("Fallback answer"))
    out = await openrouter.prompt(user, options, ["Generate a name"])
    assert(apiCalls.length == 3, "a rejected model is retried once")
    assert(apiCalls[2].model == "openrouter/auto", "retry uses the default model")
    assert(out == "Fallback answer", "fallback model response is returned")

    // 400s on the default model itself are not retried, and repeated failures open the circuit.
    const freeOptions: any = {subject: "Test prompt", maxTokens: 100, instruction: "Test instruction"}
    apiCalls = []
    apiResponder = () => badRequest()
    for (let i = 0; i < 3; i++) await openrouter.prompt(user, freeOptions, ["Generate a name"])
    assert(apiCalls.length == 6, "no extra model retry when already on the default model")
    assert((openrouter as any).failureCount == 3, "consecutive failures are counted")
    assert((openrouter as any).circuitUntil > Date.now(), "circuit breaker opened")
    assert((openrouter as any).circuitCooldown == 60000, "initial cooldown applied")

    // While the circuit is open, requests are skipped without hitting the API.
    out = await openrouter.prompt(user, freeOptions, ["Generate a name"])
    assert(out == null && apiCalls.length == 6, "open circuit short-circuits the request")

    // Once the pause is over, a new failure escalates the cooldown.
    ;(openrouter as any).circuitUntil = 0
    await openrouter.prompt(user, freeOptions, ["Generate a name"])
    assert((openrouter as any).circuitCooldown == 120000, "cooldown doubles after a new outage")

    // Failures arriving while the circuit is already open do not escalate it again.
    ;(openrouter as any).registerFailure()
    assert((openrouter as any).circuitCooldown == 120000, "cooldown escalates only once per outage")

    // A successful response resets the circuit breaker.
    ;(openrouter as any).circuitUntil = 0
    apiResponder = () => okResponse("Back online")
    out = await openrouter.prompt(user, freeOptions, ["Generate a name"])
    assert(out == "Back online", "requests flow again after the pause")
    assert((openrouter as any).failureCount == 0 && (openrouter as any).circuitCooldown == 0, "success resets the circuit breaker")

    server.close()

    if (failed > 0) {
        console.error(`${failed} assertion(s) failed`)
        process.exit(1)
    }

    console.log("All OpenRouter checks passed")
}

main().catch((ex) => {
    console.error(ex)
    process.exit(1)
})
