<script lang="ts" setup>
definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const {notify} = useToast()
const data = ref<any>(null)
const loading = ref(true)

const fetchDashboard = async () => {
    loading.value = true
    try {
        data.value = await api("/api/dashboard")
    } catch (ex) {
        notify(`Failed to load the dashboard: ${errorMessage(ex)}`, "error")
    } finally {
        loading.value = false
    }
}

const subscriptionStatuses = computed(() => Object.entries(data.value?.subscriptions?.byStatus || {}).filter(([, count]) => count))
const subscriptionSources = computed(() => Object.entries(data.value?.subscriptions?.bySource || {}).filter(([, count]) => count))
const proRatio = computed(() => (data.value?.users?.total ? `${((data.value.users.pro / data.value.users.total) * 100).toFixed(1)}% of all users` : ""))

onMounted(fetchDashboard)
</script>

<template>
    <div>
        <div class="d-flex flex-wrap align-center ga-2 mb-4">
            <div class="text-body-medium text-medium-emphasis">
                <template v-if="data">Updated {{ formatDate(data.dateUpdated) }}</template>
                <template v-else>Loading live statistics...</template>
            </div>
            <v-spacer></v-spacer>
            <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="loading" @click="fetchDashboard">Refresh</v-btn>
        </div>

        <v-skeleton-loader v-if="loading && !data" type="card, card"></v-skeleton-loader>

        <template v-else-if="data">
            <v-alert v-if="data.strava?.incident" type="warning" variant="tonal" class="mb-4" title="Strava incident">
                {{ data.strava.incident }}
                <span v-if="data.strava.dateIncidentCheck" class="text-body-small ml-2">(checked {{ fromNow(data.strava.dateIncidentCheck) }})</span>
            </v-alert>

            <h2 class="section-title">Users</h2>
            <v-row density="compact">
                <v-col cols="6" md="4" lg="2"><StatCard title="Total users" :value="data.users.total" icon="mdi-account-group-outline" to="/users" /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="PRO users" :value="data.users.pro" icon="mdi-star-outline" :hint="proRatio" to="/users?filter=pro" /></v-col>
                <v-col cols="6" md="4" lg="2"
                    ><StatCard
                        title="New (7 days)"
                        :value="data.users.new7d"
                        icon="mdi-account-plus-outline"
                        color="success"
                        :hint="`${formatNumber(data.users.new24h)} today, ${formatNumber(data.users.new30d)} in 30 days`"
                        to="/users?sort=dateRegistered"
                /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="Logins (30 days)" :value="data.users.login30d" icon="mdi-login" color="info" :hint="`${formatNumber(data.users.login7d)} in the last 7 days`" to="/users?sort=dateLogin" /></v-col>
                <v-col cols="6" md="4" lg="2"
                    ><StatCard title="With activity (30d)" :value="data.users.active30d" icon="mdi-run-fast" color="info" :hint="`${formatNumber(data.users.active24h)} in the last 24h`" to="/users?sort=dateLastActivity"
                /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="Suspended" :value="data.users.suspended" icon="mdi-account-cancel-outline" color="error" :hint="`${formatNumber(data.users.trial)} on trial`" to="/users?filter=suspended" /></v-col>
            </v-row>

            <v-row class="mt-2">
                <v-col cols="12" md="6">
                    <v-card variant="flat" border class="h-100">
                        <v-card-title class="d-flex align-center">
                            Subscriptions
                            <v-spacer></v-spacer>
                            <v-btn variant="text" size="small" to="/subscriptions" append-icon="mdi-chevron-right">Open</v-btn>
                        </v-card-title>
                        <v-card-text>
                            <div class="text-body-small text-medium-emphasis mb-2">By status</div>
                            <div class="d-flex flex-wrap ga-2 mb-4">
                                <v-chip v-for="[status, count] in subscriptionStatuses" :key="status" :color="statusColor(status)" :to="`/subscriptions?status=${status}`" variant="tonal" label>
                                    {{ status }} <strong class="ml-2">{{ formatNumber(count) }}</strong>
                                </v-chip>
                            </div>
                            <div class="text-body-small text-medium-emphasis mb-2">By source</div>
                            <div class="d-flex flex-wrap ga-2">
                                <v-chip v-for="[source, count] in subscriptionSources" :key="source" :to="`/subscriptions?source=${source}`" variant="outlined" label>
                                    {{ source }} <strong class="ml-2">{{ formatNumber(count) }}</strong>
                                </v-chip>
                            </div>
                            <div v-if="data.paddle" class="text-body-small text-medium-emphasis mt-4">Paddle prices: yearly {{ data.paddle.yearlyPrice || "-" }}, lifetime {{ data.paddle.lifetimePrice || "-" }}</div>
                        </v-card-text>
                    </v-card>
                </v-col>
                <v-col cols="12" md="6">
                    <v-card variant="flat" border class="h-100">
                        <v-card-title>Integrations</v-card-title>
                        <v-card-text>
                            <v-row density="compact">
                                <v-col cols="6"><StatCard title="Garmin" :value="data.integrations.garmin" icon="mdi-watch" color="secondary" to="/users?filter=garmin" /></v-col>
                                <v-col cols="6"><StatCard title="Wahoo" :value="data.integrations.wahoo" icon="mdi-bike-fast" color="secondary" to="/users?filter=wahoo" /></v-col>
                                <v-col cols="6"><StatCard title="Spotify" :value="data.integrations.spotify" icon="mdi-music" color="success" to="/users?filter=spotify" /></v-col>
                                <v-col cols="6"><StatCard title="AI enabled" :value="data.integrations.ai" icon="mdi-robot-outline" color="info" to="/users?filter=ai" /></v-col>
                            </v-row>
                        </v-card-text>
                    </v-card>
                </v-col>
            </v-row>

            <h2 class="section-title">Content and processing</h2>
            <v-row density="compact">
                <v-col cols="6" md="4" lg="2"><StatCard title="Activities (24h)" :value="data.content.activities24h" icon="mdi-lightning-bolt-outline" /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="Activities total" :value="data.stats?.activities?.total" icon="mdi-database-outline" :hint="`${formatNumber(data.stats?.activities?.withBacklink)} with backlink`" /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="GearWear" :value="data.content.gearwear" icon="mdi-cog-outline" :hint="`${formatNumber(data.content.gearwearDisabled)} disabled`" to="/gear" /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="Calendars" :value="data.content.calendars" icon="mdi-calendar-month-outline" to="/calendars" /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="Notifications (7d)" :value="data.content.notifications7d" icon="mdi-bell-outline" :hint="`${formatNumber(data.content.notificationsUnread)} unread overall`" to="/notifications" /></v-col>
                <v-col cols="6" md="4" lg="2"><StatCard title="Announcements" :value="data.announcements.active" icon="mdi-bullhorn-outline" :hint="`${data.announcements.scheduled} scheduled`" to="/announcements" /></v-col>
            </v-row>

            <v-row class="mt-2">
                <v-col cols="12" md="4">
                    <v-card variant="flat" border class="h-100">
                        <v-card-title>GearWear processing</v-card-title>
                        <v-card-text v-if="data.gearwear">
                            <v-list density="compact" class="pa-0">
                                <v-list-item title="Last processed" :subtitle="`${formatDate(data.gearwear.dateLastProcessed)} (${fromNow(data.gearwear.dateLastProcessed)})`"></v-list-item>
                                <v-list-item title="Users / activities" :subtitle="`${formatNumber(data.gearwear.recentUserCount)} users, ${formatNumber(data.gearwear.recentActivityCount)} activities`"></v-list-item>
                                <v-list-item title="Status">
                                    <template #subtitle>
                                        <v-chip size="small" :color="data.gearwear.processing ? 'warning' : 'success'" variant="tonal" label>{{ data.gearwear.processing ? "Processing" : "Idle" }}</v-chip>
                                    </template>
                                </v-list-item>
                            </v-list>
                        </v-card-text>
                        <v-card-text v-else class="text-medium-emphasis">No GearWear state available.</v-card-text>
                    </v-card>
                </v-col>
                <v-col cols="12" md="8">
                    <v-card variant="flat" border class="h-100">
                        <v-card-title class="d-flex align-center">
                            Recent admin activity
                            <v-spacer></v-spacer>
                            <v-btn variant="text" size="small" to="/audit" append-icon="mdi-chevron-right">Audit log</v-btn>
                        </v-card-title>
                        <AuditList :items="data.audit" />
                    </v-card>
                </v-col>
            </v-row>
        </template>
    </div>
</template>

<style lang="scss" scoped>
.section-title {
    font-size: 1rem;
    font-weight: 600;
    margin: 8px 0 8px 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
}
</style>
