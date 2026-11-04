<script lang="ts" setup>
import dayjs from "dayjs"
import {useDisplay} from "vuetify"

definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const {mobile} = useDisplay()
const {notify} = useToast()
const items = ref<any[]>([])
const loading = ref(false)
const saving = ref(false)
const editOpen = ref(false)
const form = ref<any>({})
const showExpired = ref(false)

const audiences = [
    {title: "All users", value: "all"},
    {title: "Free users only", value: "free"},
    {title: "PRO users only", value: "pro"}
]
const triStates = [
    {title: "Any", value: null},
    {title: "Yes", value: true},
    {title: "No", value: false}
]

// Status of an announcement based on its start and expiry dates.
const status = (a: any): {label: string; color: string} => {
    const now = dayjs()
    if (dayjs(a.dateExpiry).isBefore(now)) return {label: "Expired", color: "grey"}
    if (dayjs(a.dateStart).isAfter(now)) return {label: "Scheduled", color: "info"}
    return {label: "Active", color: "success"}
}

const visibleItems = computed(() => (showExpired.value ? items.value : items.value.filter((a) => status(a).label != "Expired")))
const expiredCount = computed(() => items.value.filter((a) => status(a).label == "Expired").length)

// Short description of who will see the announcement.
const targeting = (a: any): string[] => {
    const result = []
    if (a.isPro) result.push("PRO only")
    if (a.isFree) result.push("Free only")
    if (a.hasGarminWahoo) result.push("Garmin / Wahoo")
    if (a.hasBikes === true) result.push("Has bikes")
    if (a.hasBikes === false) result.push("No bikes")
    if (a.hasShoes === true) result.push("Has shoes")
    if (a.hasShoes === false) result.push("No shoes")
    if (a.dateRegisteredBefore) result.push(`Registered before ${formatDate(a.dateRegisteredBefore, false)}`)
    if (a.countries?.length) result.push(a.countries.join(", "))
    return result
}

const fetchAnnouncements = async () => {
    loading.value = true
    try {
        items.value = await api("/api/announcements")
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        loading.value = false
    }
}

const openEdit = (a?: any) => {
    form.value = {
        id: a?.id || null,
        title: a?.title || "",
        body: a?.body || "",
        href: a?.href || "",
        dateStart: toDateTimeInput(a?.dateStart || dayjs().startOf("hour").toDate()),
        dateExpiry: toDateTimeInput(a?.dateExpiry || dayjs().add(14, "day").startOf("hour").toDate()),
        dateRegisteredBefore: toDateInput(a?.dateRegisteredBefore),
        audience: a?.isPro ? "pro" : a?.isFree ? "free" : "all",
        newFeature: a?.newFeature || false,
        affiliate: a?.affiliate || false,
        hasGarminWahoo: a?.hasGarminWahoo || false,
        hasBikes: a?.hasBikes ?? null,
        hasShoes: a?.hasShoes ?? null,
        countries: a?.countries || []
    }
    editOpen.value = true
}

const duplicate = (a: any) => {
    openEdit({...a, id: null, dateStart: null, dateExpiry: null})
    form.value.title = `${a.title}`
}

const save = async () => {
    const f = form.value
    saving.value = true
    try {
        const body = {
            id: f.id || undefined,
            title: f.title,
            body: f.body,
            href: f.href,
            dateStart: fromDateInput(f.dateStart),
            dateExpiry: fromDateInput(f.dateExpiry),
            dateRegisteredBefore: fromDateInput(f.dateRegisteredBefore),
            isPro: f.audience == "pro",
            isFree: f.audience == "free",
            newFeature: f.newFeature,
            affiliate: f.affiliate,
            hasGarminWahoo: f.hasGarminWahoo,
            hasBikes: f.hasBikes,
            hasShoes: f.hasShoes,
            countries: f.countries
        }
        await api("/api/announcements", {method: "POST", body})
        notify(f.id ? "Announcement updated" : "Announcement created")
        editOpen.value = false
        fetchAnnouncements()
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}

const remove = async (a: any) => {
    if (!confirm(`Delete the announcement "${a.title}"?`)) return
    try {
        await api(`/api/announcements/${a.id}`, {method: "DELETE", body: {confirm: a.id}})
        notify("Announcement deleted")
        items.value = items.value.filter((i) => i.id != a.id)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    }
}

// Expire an active announcement right now.
const expireNow = async (a: any) => {
    if (!confirm(`Expire the announcement "${a.title}" now?`)) return
    try {
        const dateStart = dayjs(a.dateStart).isAfter(dayjs()) ? dayjs().subtract(1, "minute").toISOString() : a.dateStart
        await api("/api/announcements", {method: "POST", body: {...a, dateStart, dateExpiry: new Date().toISOString()}})
        notify("Announcement expired")
        fetchAnnouncements()
    } catch (ex) {
        notify(errorMessage(ex), "error")
    }
}

onMounted(fetchAnnouncements)
</script>

<template>
    <div>
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
            <div class="text-body-medium text-medium-emphasis">Announcements show up as banners on the web dashboard. Active announcements are cached by the web app for up to 30 minutes.</div>
            <v-spacer></v-spacer>
            <v-switch v-model="showExpired" :label="`Show expired (${expiredCount})`" density="compact" hide-details class="flex-grow-0"></v-switch>
            <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Refresh" @click="fetchAnnouncements"></v-btn>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" @click="openEdit()">New announcement</v-btn>
        </div>

        <v-skeleton-loader v-if="loading && !items.length" type="card, card"></v-skeleton-loader>
        <v-card v-else-if="!visibleItems.length" class="pa-8 text-center text-medium-emphasis">No announcements to show.</v-card>

        <v-row v-else>
            <v-col v-for="a in visibleItems" :key="a.id" cols="12" lg="6">
                <v-card class="h-100 d-flex flex-column">
                    <v-card-item>
                        <template #prepend>
                            <v-icon :icon="a.newFeature ? 'mdi-new-box' : a.affiliate ? 'mdi-handshake-outline' : 'mdi-bullhorn-outline'" color="primary"></v-icon>
                        </template>
                        <v-card-title class="text-wrap">{{ a.title }}</v-card-title>
                        <v-card-subtitle>{{ formatDate(a.dateStart) }} → {{ formatDate(a.dateExpiry) }}</v-card-subtitle>
                        <template #append>
                            <v-chip :color="status(a).color" size="small" label>{{ status(a).label }}</v-chip>
                        </template>
                    </v-card-item>
                    <v-card-text class="flex-grow-1">
                        <p class="announcement-body">{{ a.body }}</p>
                        <div v-if="a.href" class="text-body-small mt-2"><v-icon icon="mdi-link-variant" size="x-small"></v-icon> {{ a.href }}</div>
                        <div class="d-flex flex-wrap ga-1 mt-3">
                            <v-chip v-for="t in targeting(a)" :key="t" size="x-small" variant="outlined" label>{{ t }}</v-chip>
                            <v-chip v-if="!targeting(a).length" size="x-small" variant="outlined" label>Everyone</v-chip>
                        </div>
                    </v-card-text>
                    <v-divider></v-divider>
                    <v-card-actions>
                        <span class="text-body-small text-medium-emphasis px-2">Read by {{ formatNumber(a.readCount || 0) }}</span>
                        <v-spacer></v-spacer>
                        <v-btn v-if="status(a).label != 'Expired'" size="small" @click="expireNow(a)">Expire now</v-btn>
                        <v-btn size="small" @click="duplicate(a)">Duplicate</v-btn>
                        <v-btn size="small" color="primary" @click="openEdit(a)">Edit</v-btn>
                        <v-btn icon="mdi-delete-outline" size="small" color="error" aria-label="Delete announcement" @click="remove(a)"></v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
        </v-row>

        <v-dialog v-model="editOpen" :fullscreen="mobile" max-width="800" scrollable>
            <v-card>
                <v-card-title class="d-flex align-center pt-4">
                    {{ form.id ? "Edit announcement" : "New announcement" }}
                    <v-spacer></v-spacer>
                    <v-btn icon="mdi-close" variant="text" aria-label="Close" @click="editOpen = false"></v-btn>
                </v-card-title>
                <v-divider></v-divider>
                <v-card-text>
                    <v-form id="announcement-form" @submit.prevent="save">
                        <v-row density="compact">
                            <v-col cols="12"><v-text-field v-model="form.title" label="Title" maxlength="100" counter></v-text-field></v-col>
                            <v-col cols="12"><v-textarea v-model="form.body" label="Body (plain text)" rows="3" auto-grow maxlength="1000" counter></v-textarea></v-col>
                            <v-col cols="12"><v-text-field v-model="form.href" label="Link (optional)" placeholder="/gear or https://..."></v-text-field></v-col>
                            <v-col cols="12" sm="6"><v-text-field v-model="form.dateStart" label="Start" type="datetime-local"></v-text-field></v-col>
                            <v-col cols="12" sm="6"><v-text-field v-model="form.dateExpiry" label="Expiry" type="datetime-local"></v-text-field></v-col>
                        </v-row>

                        <div class="form-section">Targeting</div>
                        <v-row density="compact">
                            <v-col cols="12" sm="6"><v-select v-model="form.audience" :items="audiences" label="Audience"></v-select></v-col>
                            <v-col cols="12" sm="6"><v-text-field v-model="form.dateRegisteredBefore" label="Registered before (optional)" type="date"></v-text-field></v-col>
                            <v-col cols="6" sm="3"><v-select v-model="form.hasBikes" :items="triStates" label="Has bikes"></v-select></v-col>
                            <v-col cols="6" sm="3"><v-select v-model="form.hasShoes" :items="triStates" label="Has shoes"></v-select></v-col>
                            <v-col cols="12" sm="6">
                                <v-combobox v-model="form.countries" label="Countries (optional)" multiple chips closable-chips hint="2-letter country codes, e.g. DE, NL" persistent-hint></v-combobox>
                            </v-col>
                            <v-col cols="12" sm="4"><v-switch v-model="form.hasGarminWahoo" label="Garmin / Wahoo users only"></v-switch></v-col>
                            <v-col cols="6" sm="4"><v-switch v-model="form.newFeature" label="New feature"></v-switch></v-col>
                            <v-col cols="6" sm="4"><v-switch v-model="form.affiliate" label="Affiliate link"></v-switch></v-col>
                        </v-row>
                    </v-form>
                </v-card-text>
                <v-divider></v-divider>
                <v-card-actions>
                    <v-spacer></v-spacer>
                    <v-btn @click="editOpen = false">Cancel</v-btn>
                    <v-btn type="submit" form="announcement-form" color="primary" variant="flat" :loading="saving" :disabled="!form.title?.trim() || !form.body?.trim()">Save</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<style lang="scss" scoped>
.announcement-body {
    white-space: pre-line;
}

.form-section {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
    margin: 16px 0 8px;
}
</style>
