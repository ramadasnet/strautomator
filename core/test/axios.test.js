// Strautomator Core: Axios tests

const {describe, it, before, after} = require("node:test")
const assert = require("node:assert")
const http = require("node:http")
const setmeup = require("setmeup")

// Load the default settings before importing the axios module.
setmeup.load(`${__dirname}/../settings.json`)
const settings = setmeup.settings
settings.axios.retryInterval = 10

const {axiosRequest} = require("../lib/axios.js")

describe("Axios", () => {
    let server
    let requests = 0
    let handler

    before(async () => {
        server = http.createServer((req, res) => {
            requests++
            handler(req, res)
        })
        await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    })

    after(async () => new Promise((resolve) => server.close(resolve)))

    const baseUrl = () => `http://127.0.0.1:${server.address().port}`

    it("does not retry when the overall timeout leaves less than one second", async () => {
        requests = 0
        handler = (_req, res) => {
            setTimeout(() => {
                res.writeHead(200, {"Content-Type": "application/json"})
                res.end(JSON.stringify({ok: true}))
            }, 1200)
        }

        const startTime = Date.now()
        await assert.rejects(axiosRequest({url: baseUrl(), timeout: 1100}), (ex) => ex.isTimeout === true)
        const elapsed = Date.now() - startTime

        assert.equal(requests, 1)
        assert.equal(elapsed < 2000, true)
    })

    it("retries a server error when the overall timeout allows it", async () => {
        requests = 0
        handler = (_req, res) => {
            if (requests == 1) {
                res.writeHead(503)
                res.end()
            } else {
                res.writeHead(200, {"Content-Type": "application/json"})
                res.end(JSON.stringify({ok: true}))
            }
        }

        const result = await axiosRequest({url: baseUrl(), timeout: 5000})

        assert.deepEqual(result, {ok: true})
        assert.equal(requests, 2)
    })
})
