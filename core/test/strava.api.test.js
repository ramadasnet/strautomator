// Strautomator Core: Strava API tests

const {describe, it, before, after} = require("node:test")
const assert = require("node:assert")
const http = require("node:http")
const setmeup = require("setmeup")

// Load the default settings before importing the API module.
setmeup.load(`${__dirname}/../settings.json`)
const settings = setmeup.settings
settings.axios.retryInterval = 10

const stravaApi = require("../lib/strava/api.js").default
const {axiosRequest} = require("../lib/axios.js")

describe("Strava API", () => {
    const requests = []
    let server
    let handler

    before(async () => {
        server = http.createServer((req, res) => {
            let body = ""
            req.on("data", (chunk) => (body += chunk))
            req.on("end", () => {
                requests.push({method: req.method, url: req.url, headers: req.headers, body})
                handler(req, res)
            })
        })
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
        const baseUrl = `http://127.0.0.1:${server.address().port}`
        settings.strava.api.revokeUrl = `${baseUrl}/oauth/deauthorize`
        settings.strava.api.tokenUrl = `${baseUrl}/oauth/token`
    })

    after(() => server.close())

    const respond = (status, data) => {
        handler = (req, res) => {
            res.writeHead(status, {"Content-Type": "application/json"})
            res.end(JSON.stringify(data))
        }
    }

    const deauthorized = () => requests.filter((r) => r.url == "/oauth/deauthorize")

    it("posts the access token to the deauthorize endpoint", async () => {
        requests.length = 0
        respond(200, {access_token: "token-abc"})

        await stravaApi.revokeToken("user1", "token-abc")

        assert.equal(deauthorized().length, 1)
        const req = requests[0]
        assert.equal(req.method, "POST")
        assert.equal(req.headers["content-type"], "application/x-www-form-urlencoded")
        assert.equal(req.headers["authorization"], "Bearer token-abc")

        const params = new URLSearchParams(req.body)
        assert.equal(params.get("access_token"), "token-abc")
        assert.equal(params.get("client_id"), null)
        assert.equal(params.get("client_secret"), null)
    })

    it("resolves when the token was already revoked", async () => {
        requests.length = 0
        respond(401, {message: "Authorization Error", errors: [{resource: "AccessToken", field: "access_token", code: "invalid"}]})

        await stravaApi.revokeToken("user1", "token-revoked")
    })

    it("resolves when the token is expired and no refresh token is available", async () => {
        requests.length = 0
        respond(403, {message: "Forbidden"})

        await stravaApi.revokeToken("user1", "token-expired")
    })

    it("does not hit Strava when no access token is available", async () => {
        requests.length = 0
        respond(200, {})

        await stravaApi.revokeToken("user1", null)
        assert.equal(requests.length, 0)
    })

    it("refreshes the token and retries when the first call fails", async () => {
        requests.length = 0
        handler = (req, res) => {
            if (req.url == "/oauth/deauthorize") {
                if (deauthorized().length == 1) {
                    res.writeHead(401, {"Content-Type": "application/json"})
                    res.end(JSON.stringify({message: "Authorization Error"}))
                } else {
                    res.writeHead(200, {"Content-Type": "application/json"})
                    res.end(JSON.stringify({access_token: "token-refreshed"}))
                }
            } else {
                res.writeHead(200, {"Content-Type": "application/json"})
                res.end(JSON.stringify({access_token: "token-refreshed", refresh_token: "refresh-token-new", expires_at: 9999999999}))
            }
        }

        await stravaApi.revokeToken("user1", "token-stale", "refresh-token-old")

        const tokenCalls = requests.filter((r) => r.url == "/oauth/token")
        assert.equal(tokenCalls.length, 1)
        assert.equal(new URLSearchParams(tokenCalls[0].body).get("refresh_token"), "refresh-token-old")

        const revokes = deauthorized()
        assert.equal(revokes.length, 2)
        assert.equal(new URLSearchParams(revokes[1].body).get("access_token"), "token-refreshed")
    })

    it("resolves when the refresh also fails with an authorization error", async () => {
        requests.length = 0
        respond(401, {message: "Authorization Error"})

        await stravaApi.revokeToken("user1", "token-revoked", "refresh-token-revoked")
    })

    it("scrubs tokens and secrets from request errors", async () => {
        requests.length = 0
        respond(401, {message: "Authorization Error"})

        try {
            await axiosRequest({
                method: "POST",
                url: `http://127.0.0.1:${server.address().port}/oauth/deauthorize`,
                headers: {Authorization: "Bearer token-abc", "Content-Type": "application/x-www-form-urlencoded"},
                data: "access_token=token-abc",
                timeout: 3000
            })
            assert.fail("Request should have failed")
        } catch (ex) {
            assert.equal(ex.statusCode, 401)
            assert.equal(ex.config.headers.Authorization, undefined)
            assert.equal(ex.config.data, undefined)
            assert.equal(JSON.stringify(ex).includes("token-abc"), false)
        }
    })
})
