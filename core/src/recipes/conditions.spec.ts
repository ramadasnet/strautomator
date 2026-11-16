// Recipe segment condition checks (run with: npx tsx src/recipes/conditions.spec.ts)

import {checkSegments} from "./conditions"
import {RecipeCondition, RecipeOperator} from "./types"
import {StravaActivity} from "../strava/types"

let failed = 0

const assert = (cond: any, message: string) => {
    if (!cond) {
        failed++
        console.error(`FAIL: ${message}`)
    } else {
        console.log(`ok: ${message}`)
    }
}

const activities: {[key: string]: StravaActivity} = {
    PR: {id: 1, segments: {"100": {name: "Climb", count: 1, pr: true}, "200": {name: "Flat", count: 1}}} as any,
    KOM: {id: 2, segments: {"100": {name: "Climb", count: 1, kom: true}, "200": {name: "Flat", count: 1}}} as any,
    "no PR / KOM": {id: 3, segments: {"100": {name: "Climb", count: 1}, "200": {name: "Flat", count: 1, pr: false, kom: false}}} as any,
    "no segments": {id: 4} as any
}

const check = (property: string, operator: RecipeOperator, value: any, activityKey: string, expected: boolean) => {
    const condition: RecipeCondition = {property, operator, value}
    const result = checkSegments(activities[activityKey], condition)
    const label = `${property} ${operator} ${JSON.stringify(value)} on activity with ${activityKey} => ${expected}`
    assert(result === expected, result === expected ? label : `${label} (got ${result})`)
}

// Boolean PR / KOM conditions, including the legacy property names.
const booleanProps = [
    {props: ["segments.pr", "prSegments"], hitKey: "PR"},
    {props: ["segments.kom", "komSegments"], hitKey: "KOM"}
]

for (const {props, hitKey} of booleanProps) {
    for (const prop of props) {
        const missKeys = ["no PR / KOM", "no segments", hitKey == "PR" ? "KOM" : "PR"]

        for (const yes of [true, "true", 1]) {
            check(prop, RecipeOperator.Equal, yes, hitKey, true)
            check(prop, RecipeOperator.NotEqual, yes, hitKey, false)
            for (const key of missKeys) {
                check(prop, RecipeOperator.Equal, yes, key, false)
                check(prop, RecipeOperator.NotEqual, yes, key, true)
            }
        }

        for (const no of [false, "false", 0]) {
            check(prop, RecipeOperator.Equal, no, hitKey, false)
            check(prop, RecipeOperator.NotEqual, no, hitKey, true)
            for (const key of missKeys) {
                check(prop, RecipeOperator.Equal, no, key, true)
                check(prop, RecipeOperator.NotEqual, no, key, false)
            }
        }
    }
}

// Specific segment ID condition keeps its existing behaviour.
check("segments", RecipeOperator.Equal, "100", "PR", true)
check("segments", RecipeOperator.NotEqual, "100", "PR", false)
check("segments", RecipeOperator.Equal, "999", "PR", false)
check("segments", RecipeOperator.NotEqual, "999", "PR", true)
check("segments", RecipeOperator.Equal, 100, "PR", true)
check("segments", RecipeOperator.Equal, "100", "no segments", false)
check("segments", RecipeOperator.NotEqual, "100", "no segments", true)

if (failed > 0) {
    console.error(`\n${failed} check(s) failed`)
    process.exit(1)
}

console.log("\nAll segment condition checks passed")
