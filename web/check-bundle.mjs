import assert from "node:assert/strict"
import {readFileSync, readdirSync} from "node:fs"
import {gzipSync} from "node:zlib"

const manifestDir = new URL("./.output/server/_ssr/", import.meta.url)
const manifests = readdirSync(manifestDir).filter((name) => name.startsWith("precomputed-") && name.endsWith(".mjs"))
assert.equal(manifests.length, 1, "Expected one generated Nuxt dependency manifest")
const {default: manifest} = await import(new URL(manifests[0], manifestDir))
assert.ok(manifest.entrypoints?.length, "Missing Nuxt app entrypoints")

const files = new Set()
for (const entry of manifest.entrypoints) {
    const dependencies = manifest.dependencies?.[entry]?.preload
    assert.ok(dependencies, `Missing preload dependencies for ${entry}`)
    for (const resource of Object.values(dependencies)) {
        if (resource.resourceType == "script") files.add(resource.file)
    }
}
assert.ok(files.size, "The app entry JavaScript graph must not be empty")

const editors = Object.entries(manifest.modules).filter(([id, resource]) => id.includes("/json-editor-vue/") && resource.resourceType == "script")
assert.ok(editors.length, "Missing JSON editor module")
for (const [, editor] of editors) assert.ok(!files.has(editor.file), "The JSON editor must stay outside the app entry JavaScript graph")

const budget = 200000
const bytes = [...files].reduce((total, file) => total + gzipSync(readFileSync(new URL(`./.output/public/_nuxt/${file}`, import.meta.url))).length, 0)
assert.ok(bytes <= budget, `App entry JavaScript is ${bytes} bytes gzip, exceeding the ${budget}-byte budget`)
console.log(`App entry JavaScript: ${bytes} bytes gzip / ${budget}-byte budget (${files.size} chunks)`)
