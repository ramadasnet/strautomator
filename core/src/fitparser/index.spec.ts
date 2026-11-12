// FIT parser checks (run with: npx tsx src/fitparser/index.spec.ts)

const {settings} = require("setmeup")
settings.app = settings.app || {}
settings.app.title = "Strautomator"
settings.axios = settings.axios || {timeout: 5000, retryInterval: 1, backoffThreshold: 100, backoffInterval: 1}
settings.fitparser = settings.fitparser || {maxFiles: 50, upload: {}}

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
    const database = require("../database").default
    const fitparser = require("./index").default
    const {encodeFitFile, FitEncoder} = require("./builder")

    const user: any = {id: "u1", displayName: "Test User"}
    const dateStart = new Date("2026-01-02T10:00:00Z")
    const stravaActivity: any = {id: "a1", name: "Tempo Run", sportType: "Run", totalTime: 1800, movingTime: 1800, dateStart: dateStart}

    // Files encoded by the builder keep the workout name after parsing.
    const fitData = encodeFitFile(stravaActivity, {time: [0, 60, 120]}, {})
    let parsed: any = await fitparser.parse(user, {id: "fit1", userId: user.id, name: null}, fitData)
    assert(parsed.workoutName == "Tempo Run", "workout name parsed from the workout message")

    // A missing workout description falls back to the step notes, then step names.
    let encoder = new FitEncoder()
    encoder.writeFileIdMessage(stravaActivity, 1100000000)
    encoder.writeWorkoutMessage("Intervals", 1)
    encoder.writeWorkoutStepMessage(0, "Warmup")
    encoder.writeWorkoutStepMessage(1, null, "4x5min hard")
    encoder.writeWorkoutStepMessage(2, "Cooldown")
    parsed = await fitparser.parse(user, {id: "fit2", userId: user.id, name: null}, encoder.finish())
    assert(parsed.workoutName == "Intervals", "workout name parsed alongside the steps")
    assert(parsed.workoutNotes == "Warmup\n4x5min hard\nCooldown", "workout notes built from step notes and names")

    // A proper workout description wins over the step notes.
    encoder = new FitEncoder()
    encoder.writeFileIdMessage(stravaActivity, 1100000000)
    encoder.writeWorkoutMessage("Intervals", 1, "Steady intervals")
    encoder.writeWorkoutStepMessage(0, "Warmup")
    parsed = await fitparser.parse(user, {id: "fit3", userId: user.id, name: null}, encoder.finish())
    assert(parsed.workoutNotes == "Steady intervals", "workout description used instead of step notes")

    // Workout fields are never stored as empty strings.
    encoder = new FitEncoder()
    encoder.writeFileIdMessage(stravaActivity, 1100000000)
    encoder.writeWorkoutMessage(null, 1)
    parsed = await fitparser.parse(user, {id: "fit4", userId: user.id, name: null}, encoder.finish())
    assert(!parsed.workoutName, "missing workout name is not stored")
    assert(!parsed.workoutNotes, "missing workout notes are not stored")

    // Uploaded FIT files are preferred over the API ones when both match, as they
    // keep the workout metadata that the Garmin API strips from the files.
    const apiDoc: any = {id: "activity-12345", userId: user.id, dateStart: dateStart, totalTime: 1800}
    const uploadDoc: any = {id: "activity-upload-u1-1767338400", userId: user.id, dateStart: dateStart, totalTime: 1800}
    const namedDoc: any = {id: "activity-99999", userId: user.id, dateStart: dateStart, totalTime: 1800, workoutName: "Morning intervals"}
    const stravaRef: any = {id: "s1", dateStart: dateStart, totalTime: 1800}

    database.search = async (collection: string) => (collection == "garmin" ? [apiDoc, uploadDoc] : [])
    let matched = await fitparser.getMatchingActivity(user, stravaRef)
    assert(matched?.id == uploadDoc.id, "uploaded FIT file is preferred over the API one")

    database.search = async (collection: string) => (collection == "garmin" ? [apiDoc, namedDoc] : [])
    matched = await fitparser.getMatchingActivity(user, stravaRef)
    assert(matched?.id == namedDoc.id, "candidate with a workout name is preferred over one without")

    database.search = async (collection: string) => (collection == "garmin" ? [apiDoc] : [])
    matched = await fitparser.getMatchingActivity(user, stravaRef)
    assert(matched?.id == apiDoc.id, "single matching candidate still returned")

    if (failed > 0) {
        console.error(`${failed} assertion(s) failed`)
        process.exit(1)
    }

    console.log("All FIT parser checks passed")
}

main().catch((ex) => {
    console.error(ex)
    process.exit(1)
})
