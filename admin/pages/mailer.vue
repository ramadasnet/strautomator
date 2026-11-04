<script lang="ts" setup>
import {ref} from "vue"
import {BaseKit, Bold, Color, BulletList, History, Image, Italic, Link, Strike, Underline, VuetifyTiptap} from "vuetify-pro-tiptap"
import "vuetify-pro-tiptap/style.css"

definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const loading = ref(false)
const whichUsers = ref("")
const whichCountry = ref("")
const subject = ref("")
const body = ref("")
const ignoredUsers = ref("")
const testRun = ref(false)
const sentCount = ref(0)
const sentError = ref("")
const sentBanner = ref(false)
const formValid = computed(() => whichUsers.value && whichCountry.value && subject.value?.length > 3 && body.value?.length > 30)

const editorExtensions = [
    BaseKit.configure({
        placeholder: {
            placeholder: "Email body..."
        }
    }),
    Bold,
    Italic,
    Underline,
    Strike,
    Color,
    BulletList,
    Link,
    Image,
    History
]

const sendEmail = async () => {
    if (!testRun.value && !confirm(`Send this email to all matching users (${whichUsers.value}, ${whichCountry.value})?`)) return
    try {
        loading.value = true
        sentCount.value = null
        sentError.value = null

        const options: any = {subject: subject.value, body: body.value, testRun: testRun.value, users: {}}
        if (whichCountry?.value !== "all") {
            options.users.country = whichCountry.value
        }
        if (ignoredUsers.value) {
            options.users.ignored = ignoredUsers.value.split(",").map((id) => id.trim())
        }
        options.users[whichUsers.value.toString()] = true
        const userIds = await api<string[]>(`/api/mailer/send`, {method: "POST", body: options})

        sentCount.value = userIds.length
        sentError.value = null

        if (!testRun.value) {
            subject.value = ""
            body.value = ""
        }
    } catch (ex) {
        sentError.value = `Failed to send: ${errorMessage(ex)}`
    } finally {
        loading.value = false
        sentBanner.value = true
    }
}

const userCategories = [
    {title: "Free accounts", value: "free"},
    {title: "PRO accounts", value: "pro"},
    {title: "Ex-PRO accounts", value: "exPro"},
    {title: "With calendars", value: "withCalendar"},
    {title: "With gear", value: "withGear"}
]

const countries = [
    {title: "All", value: "all"},
    {title: "Brazil and Portugal", value: "BR,Brazil,Brasil,PT,Portugal"},
    {title: "Germany", value: "DE,Germany,Deutschland"},
    {title: "Netherlands", value: "NL,Netherlands,Nederland"},
    {title: "Spain", value: "ES,Spain,España"},
    {title: "United Kingdom", value: "UK,United Kingdom"},
    {title: "United States", value: "US,United States"}
]
</script>

<template>
    <div>
        <v-snackbar v-model="sentBanner" timeout="10000" :color="sentError ? 'red-darken-3' : 'green-darken-4'">
            {{ sentError ? sentError : `Email sent to ${sentCount} users` }}
        </v-snackbar>
        <v-card>
            <v-skeleton-loader type="card" v-if="loading"></v-skeleton-loader>
            <v-card-text v-else>
                <v-form>
                    <v-row>
                        <v-col cols="12" md="6">
                            <v-select v-model="whichUsers" label="Which users" :items="userCategories" required></v-select>
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-select v-model="whichCountry" label="Which countries" :items="countries" required></v-select>
                        </v-col>
                    </v-row>

                    <v-text-field v-model="subject" label="Subject" required></v-text-field>
                    <VuetifyTiptap v-model="body" :min-height="200" :max-height="40" :extensions="editorExtensions" />
                    <v-text-field class="mt-4" label="Ignored users" v-model="ignoredUsers" placeholder="List of IDs (comma-separated)"></v-text-field>
                    <v-checkbox v-model="testRun" class="ml-n1" label="Test run (send to Strautomator instead)"></v-checkbox>
                    <v-btn class="mt-2" color="primary" :disabled="!formValid" @click="sendEmail">Send email</v-btn>
                </v-form>
            </v-card-text>
        </v-card>
    </div>
</template>
