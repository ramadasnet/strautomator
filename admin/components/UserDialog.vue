<script lang="ts" setup>
import {useDisplay} from "vuetify"

const props = defineProps<{userId: string}>()
const emit = defineEmits<{updated: [user: any]; deleted: [id: string]; close: []}>()

const {mobile} = useDisplay()
const {notify} = useToast()
const open = computed({
    get: () => !!props.userId,
    set: (value) => {
        if (!value) emit("close")
    }
})

const tab = ref("profile")
const loading = ref(false)
const saving = ref(false)
const details = ref<any>(null)
const audit = ref<any[]>([])
const form = ref<any>({})
const proForm = ref({frequency: "lifetime", dateExpiry: ""})
const editSubscription = ref<any>(null)
const editSubscriptionOpen = ref(false)

const languages = ["en", "de", "es", "fr", "it", "lt", "nl", "pl", "pt", "se", "sk"]
const preferenceSwitches = [
    {key: "privacyMode", label: "Privacy mode"},
    {key: "delayedProcessing", label: "Delayed processing"},
    {key: "aiEnabled", label: "AI enabled"},
    {key: "ftpAutoUpdate", label: "FTP auto update"},
    {key: "activityHashtag", label: "Activity hashtag"},
    {key: "noSuffixes", label: "No suffixes"},
    {key: "showAds", label: "Show ads"}
]

const user = computed(() => details.value?.user)
const fullName = computed(() => [user.value?.profile?.firstName, user.value?.profile?.lastName].filter(Boolean).join(" ") || user.value?.displayName || props.userId)
const integrations = computed(() =>
    [
        {name: "Garmin", id: user.value?.garmin?.id},
        {name: "Wahoo", id: user.value?.wahoo?.id},
        {name: "Spotify", id: user.value?.spotify?.id},
        {name: "Last.fm", id: user.value?.lastfm?.username}
    ].filter((i) => i.id)
)
const gearNames = computed(() => {
    const result = {}
    for (let gear of [...(user.value?.profile?.bikes || []), ...(user.value?.profile?.shoes || [])]) result[gear.id] = gear.name
    return result
})
const rawJson = computed(() => JSON.stringify(user.value, null, 2))

// Editable copy of the user fields.
const resetForm = () => {
    const u = user.value || {}
    const prefs = u.preferences || {}
    form.value = {
        email: u.email || "",
        countryCode: u.countryCode || "",
        debug: u.debug || false,
        writeSuspended: u.writeSuspended || false,
        suspended: u.suspended || false,
        suspendReason: "",
        preferences: {
            language: prefs.language || "en",
            linksOn: prefs.linksOn ?? null,
            gearwearDelayDays: prefs.gearwearDelayDays ?? null,
            ...Object.fromEntries(preferenceSwitches.map((p) => [p.key, prefs[p.key] || false]))
        }
    }
}

const fetchUser = async () => {
    if (!props.userId) return
    loading.value = true
    try {
        details.value = await api(`/api/users/${props.userId}`)
        resetForm()
        fetchAudit()
    } catch (ex) {
        notify(errorMessage(ex), "error")
        emit("close")
    } finally {
        loading.value = false
    }
}

const fetchAudit = async () => {
    try {
        const result = await api("/api/audit", {query: {target: props.userId}})
        audit.value = [...result.items].sort((a: any, b: any) => new Date(b.dateCreated).valueOf() - new Date(a.dateCreated).valueOf())
    } catch (ex) {
        audit.value = []
    }
}

// Apply a fresh user returned by the API, and let the parent know.
const applyUser = (updated: any) => {
    details.value.user = updated
    resetForm()
    emit("updated", updated)
    fetchAudit()
}

const saveProfile = async (extra: any = {}) => {
    saving.value = true
    try {
        const body = {...form.value, preferences: {...form.value.preferences}, ...extra}
        if (body.preferences.linksOn === null || body.preferences.linksOn === "") delete body.preferences.linksOn
        if (body.preferences.gearwearDelayDays === null || body.preferences.gearwearDelayDays === "") delete body.preferences.gearwearDelayDays
        if (!body.suspended || !body.suspendReason) delete body.suspendReason

        const result = await api(`/api/users/${props.userId}`, {method: "PATCH", body})
        notify(result.changed ? "User updated" : "Nothing to update", result.changed ? "success" : "info")
        if (result.changed) applyUser(result.user)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}

const setPro = async (action: "grant" | "revoke") => {
    const label = action == "grant" ? `Grant PRO (${proForm.value.frequency}${proForm.value.dateExpiry ? `, until ${proForm.value.dateExpiry}` : ""})` : "Revoke PRO and expire the current subscription"
    if (!confirm(`${label} for ${fullName.value}?`)) return
    saving.value = true
    try {
        const result = await api(`/api/users/${props.userId}/pro`, {method: "POST", body: {action, frequency: proForm.value.frequency, dateExpiry: fromDateInput(proForm.value.dateExpiry)}})
        notify(action == "grant" ? "PRO granted" : "PRO revoked")
        await fetchUser()
        emit("updated", result.user)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}

const openSubscription = (sub: any) => {
    editSubscription.value = sub
    editSubscriptionOpen.value = true
}

const deleteNotification = async (notification: any) => {
    if (!confirm(`Delete notification "${notification.title}"?`)) return
    try {
        await api(`/api/notifications/${notification.id}`, {method: "DELETE", body: {confirm: notification.id}})
        details.value.notifications = details.value.notifications.filter((n: any) => n.id != notification.id)
        notify("Notification deleted")
    } catch (ex) {
        notify(errorMessage(ex), "error")
    }
}

const onGearUpdated = (gear: any) => {
    const index = details.value.gearwear.findIndex((g: any) => g.id == gear.id)
    if (index >= 0) details.value.gearwear[index] = gear
    fetchAudit()
}

const onGearDeleted = (id: string) => {
    details.value.gearwear = details.value.gearwear.filter((g: any) => g.id != id)
    fetchAudit()
}

const deleteUser = async () => {
    const typed = prompt(`This will permanently delete ${fullName.value} and all of their data (recipes, gear, calendars, notifications, linked accounts).\n\nType the user ID (${props.userId}) to confirm:`)
    if (typed?.trim() != props.userId) return
    saving.value = true
    try {
        await api(`/api/users/${props.userId}`, {method: "DELETE", body: {confirm: props.userId}})
        notify(`User ${props.userId} deleted`)
        emit("deleted", props.userId)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}

watch(
    () => props.userId,
    (id) => {
        details.value = null
        audit.value = []
        tab.value = "profile"
        if (id) fetchUser()
    },
    {immediate: true}
)
</script>

<template>
    <v-dialog v-model="open" :fullscreen="mobile" max-width="1100" scrollable>
        <v-card class="user-dialog">
            <v-card-title class="d-flex align-center ga-2 pt-4">
                <v-avatar color="primary" variant="tonal" size="40">
                    <v-img v-if="user?.profile?.urlAvatar" :src="user.profile.urlAvatar" :alt="fullName"></v-img>
                    <v-icon v-else icon="mdi-account"></v-icon>
                </v-avatar>
                <div class="min-width-0">
                    <div class="text-truncate">{{ fullName }}</div>
                    <div class="text-body-small text-medium-emphasis">
                        {{ userId }}<template v-if="user?.profile?.username"> · @{{ user.profile.username }}</template>
                    </div>
                </div>
                <v-spacer></v-spacer>
                <v-btn :href="`https://www.strava.com/athletes/${userId}`" target="_blank" rel="noopener noreferrer" icon="mdi-open-in-new" variant="text" title="Open on Strava" aria-label="Open on Strava"></v-btn>
                <v-btn icon="mdi-close" variant="text" aria-label="Close" @click="open = false"></v-btn>
            </v-card-title>

            <div v-if="user" class="d-flex flex-wrap ga-1 px-6 pb-2">
                <v-chip v-if="user.isPro" color="primary" size="small" label>PRO{{ user.isTrial ? " (trial)" : "" }}</v-chip>
                <v-chip v-else size="small" label>Free</v-chip>
                <v-chip v-if="user.suspended" color="error" size="small" label>Suspended</v-chip>
                <v-chip v-if="user.writeSuspended" color="warning" size="small" label>Write suspended</v-chip>
                <v-chip v-if="user.debug" color="info" size="small" label>Debug</v-chip>
                <v-chip v-for="integration in integrations" :key="integration.name" size="small" variant="outlined" label>{{ integration.name }}</v-chip>
            </div>

            <v-tabs v-model="tab" color="primary" show-arrows class="px-2">
                <v-tab value="profile">Profile</v-tab>
                <v-tab value="subscription">Subscription</v-tab>
                <v-tab value="gear">Gear ({{ details?.gearwear?.length || 0 }})</v-tab>
                <v-tab value="notifications">Notifications</v-tab>
                <v-tab value="data">Data</v-tab>
                <v-tab value="danger">Danger zone</v-tab>
            </v-tabs>
            <v-divider></v-divider>

            <v-card-text class="dialog-body">
                <v-skeleton-loader v-if="loading && !details" type="article, article"></v-skeleton-loader>

                <v-window v-else-if="details" v-model="tab">
                    <!-- PROFILE -->
                    <v-window-item value="profile">
                        <v-row density="compact" class="mb-2">
                            <v-col cols="6" md="3"
                                ><div class="info-label">Registered</div>
                                {{ formatDate(user.dateRegistered) }}</v-col
                            >
                            <v-col cols="6" md="3"
                                ><div class="info-label">Last login</div>
                                {{ formatDate(user.dateLogin) }}</v-col
                            >
                            <v-col cols="6" md="3"
                                ><div class="info-label">Last activity</div>
                                {{ formatDate(user.dateLastActivity) }}</v-col
                            >
                            <v-col cols="6" md="3"
                                ><div class="info-label">Processed activities</div>
                                {{ formatNumber(user.activityCount || 0) }}</v-col
                            >
                            <v-col cols="6" md="3"
                                ><div class="info-label">Recipes</div>
                                {{ details.recipes.length }}</v-col
                            >
                            <v-col cols="6" md="3"
                                ><div class="info-label">Bikes / shoes</div>
                                {{ user.profile?.bikes?.length || 0 }} / {{ user.profile?.shoes?.length || 0 }}</v-col
                            >
                            <v-col cols="6" md="3"
                                ><div class="info-label">Units</div>
                                {{ user.profile?.units || "metric" }}</v-col
                            >
                            <v-col cols="6" md="3">
                                <div class="info-label">Failures (auth / email)</div>
                                {{ user.authFailures || 0 }} / {{ user.emailFailures || 0 }}
                            </v-col>
                        </v-row>

                        <v-row density="compact">
                            <v-col cols="12" md="8"><v-text-field v-model="form.email" label="Email" type="email"></v-text-field></v-col>
                            <v-col cols="12" md="4"><v-text-field v-model="form.countryCode" label="Country code" maxlength="2"></v-text-field></v-col>
                        </v-row>

                        <h3 class="form-section">Account flags</h3>
                        <v-row density="compact">
                            <v-col cols="12" sm="4"><v-switch v-model="form.suspended" label="Suspended" color="error"></v-switch></v-col>
                            <v-col cols="12" sm="4"><v-switch v-model="form.writeSuspended" label="Write suspended" color="warning"></v-switch></v-col>
                            <v-col cols="12" sm="4"><v-switch v-model="form.debug" label="Debug logging"></v-switch></v-col>
                            <v-col v-if="form.suspended && !user.suspended" cols="12">
                                <v-text-field v-model="form.suspendReason" label="Suspension reason (optional)" hint="If set, the user gets a suspension email with this reason" persistent-hint></v-text-field>
                            </v-col>
                        </v-row>

                        <h3 class="form-section">Preferences</h3>
                        <v-row density="compact">
                            <v-col cols="12" sm="4"><v-select v-model="form.preferences.language" :items="languages" label="Language"></v-select></v-col>
                            <v-col cols="6" sm="4"><v-text-field v-model.number="form.preferences.linksOn" label="Linkback every N activities" type="number" min="0" hint="0 = disabled (PRO only)"></v-text-field></v-col>
                            <v-col cols="6" sm="4"><v-text-field v-model.number="form.preferences.gearwearDelayDays" label="GearWear delay (days)" type="number" min="0" max="10"></v-text-field></v-col>
                            <v-col v-for="pref in preferenceSwitches" :key="pref.key" cols="6" sm="4" md="3">
                                <v-switch v-model="form.preferences[pref.key]" :label="pref.label"></v-switch>
                            </v-col>
                        </v-row>

                        <div class="d-flex flex-wrap ga-2 mt-4">
                            <v-btn v-if="user.authFailures || user.dateAuthFailed" variant="tonal" :disabled="saving" @click="saveProfile({resetAuthFailures: true})">Reset auth failures</v-btn>
                            <v-btn v-if="user.emailFailures" variant="tonal" :disabled="saving" @click="saveProfile({resetEmailFailures: true})">Reset email failures</v-btn>
                            <v-spacer></v-spacer>
                            <v-btn variant="text" :disabled="saving" @click="resetForm">Reset</v-btn>
                            <v-btn color="primary" variant="flat" prepend-icon="mdi-content-save-outline" :loading="saving" @click="saveProfile()">Save changes</v-btn>
                        </div>
                    </v-window-item>

                    <!-- SUBSCRIPTION -->
                    <v-window-item value="subscription">
                        <v-card variant="tonal" :color="user.isPro ? 'primary' : undefined" class="mb-4">
                            <v-card-text>
                                <template v-if="user.isPro">
                                    <div class="text-title-medium font-weight-bold">PRO account{{ user.isTrial ? " (trial)" : "" }}</div>
                                    <div class="text-body-medium mb-3">Current subscription: {{ user.subscriptionId || "none" }}</div>
                                    <v-btn color="error" variant="flat" prepend-icon="mdi-star-off-outline" :loading="saving" @click="setPro('revoke')">Revoke PRO</v-btn>
                                </template>
                                <template v-else>
                                    <div class="text-title-medium font-weight-bold mb-2">Free account</div>
                                    <v-row density="compact" align="center">
                                        <v-col cols="12" sm="4">
                                            <v-select v-model="proForm.frequency" :items="['lifetime', 'yearly', 'monthly']" label="Frequency" density="compact"></v-select>
                                        </v-col>
                                        <v-col cols="12" sm="4">
                                            <v-text-field v-model="proForm.dateExpiry" label="Expires on (optional)" type="date" density="compact"></v-text-field>
                                        </v-col>
                                        <v-col cols="12" sm="4">
                                            <v-btn color="primary" variant="flat" block prepend-icon="mdi-star-outline" :loading="saving" @click="setPro('grant')">Grant PRO</v-btn>
                                        </v-col>
                                    </v-row>
                                    <div class="text-body-small mt-1">Creates a "friend" subscription. When an expiry date is set, the user goes back to Free on that day.</div>
                                </template>
                            </v-card-text>
                        </v-card>

                        <v-table v-if="details.subscriptions.length" density="comfortable">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Source</th>
                                    <th>Status</th>
                                    <th class="d-none d-sm-table-cell">Price</th>
                                    <th class="d-none d-md-table-cell">Expiry / next payment</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="sub in details.subscriptions" :key="sub.id">
                                    <td class="text-no-wrap">
                                        {{ sub.id }}
                                        <v-icon v-if="sub.id == user.subscriptionId" icon="mdi-check-circle" color="success" size="small" title="Current subscription"></v-icon>
                                    </td>
                                    <td>{{ sub.source }}</td>
                                    <td>
                                        <v-chip :color="statusColor(sub.status)" size="small" variant="tonal" label>{{ sub.status }}</v-chip>
                                    </td>
                                    <td class="d-none d-sm-table-cell">{{ sub.price ? `${sub.price} ${sub.currency || ""}` : "-" }} {{ sub.frequency || "" }}</td>
                                    <td class="d-none d-md-table-cell">{{ formatDate(sub.dateExpiry, false) }} / {{ formatDate(sub.dateNextPayment, false) }}</td>
                                    <td class="text-right"><v-btn size="small" variant="tonal" @click="openSubscription(sub)">Edit</v-btn></td>
                                </tr>
                            </tbody>
                        </v-table>
                        <div v-else class="text-medium-emphasis">No subscriptions.</div>
                    </v-window-item>

                    <!-- GEAR -->
                    <v-window-item value="gear">
                        <v-expansion-panels v-if="details.gearwear.length" variant="accordion">
                            <v-expansion-panel v-for="gear in details.gearwear" :key="gear.id">
                                <v-expansion-panel-title>
                                    <div class="d-flex align-center ga-2 min-width-0">
                                        <v-icon :icon="gear.id.startsWith('g') ? 'mdi-shoe-sneaker' : 'mdi-bike'" size="small"></v-icon>
                                        <span class="text-truncate">{{ gearNames[gear.id] || gear.name || gear.id }}</span>
                                        <span class="text-body-small text-medium-emphasis">{{ gear.id }} · {{ gear.components.length }} components</span>
                                        <v-chip v-if="gear.disabled" color="error" size="x-small" label>Disabled</v-chip>
                                        <v-chip v-if="!gearNames[gear.id]" color="warning" size="x-small" label>Not on Strava</v-chip>
                                    </div>
                                </v-expansion-panel-title>
                                <v-expansion-panel-text>
                                    <GearEditor :gear="gear" :units="user.profile?.units" @updated="onGearUpdated" @deleted="onGearDeleted" />
                                </v-expansion-panel-text>
                            </v-expansion-panel>
                        </v-expansion-panels>
                        <div v-else class="text-medium-emphasis">No GearWear configurations.</div>

                        <div v-if="user.profile?.bikes?.length || user.profile?.shoes?.length" class="mt-4">
                            <div class="info-label mb-1">Gear on Strava</div>
                            <div class="d-flex flex-wrap ga-1">
                                <v-chip v-for="gear in [...(user.profile.bikes || []), ...(user.profile.shoes || [])]" :key="gear.id" size="small" variant="outlined" label>
                                    {{ gear.name }} <span class="text-medium-emphasis ml-1">{{ gear.id }}</span>
                                </v-chip>
                            </div>
                        </div>
                    </v-window-item>

                    <!-- NOTIFICATIONS -->
                    <v-window-item value="notifications">
                        <h3 class="form-section mt-0">Send a notification</h3>
                        <NotificationForm :user-ids="[userId]" @sent="fetchUser" />

                        <h3 class="form-section">Recent notifications</h3>
                        <v-list v-if="details.notifications.length" density="compact" lines="two" class="pa-0">
                            <v-list-item v-for="notification in details.notifications" :key="notification.id" class="px-0">
                                <template #prepend>
                                    <v-icon :icon="notification.read ? 'mdi-bell-check-outline' : 'mdi-bell-ring-outline'" :color="notification.read ? undefined : 'primary'"></v-icon>
                                </template>
                                <v-list-item-title>{{ notification.title }}</v-list-item-title>
                                <v-list-item-subtitle>{{ notification.body }}</v-list-item-subtitle>
                                <div class="text-body-small text-medium-emphasis">
                                    {{ formatDate(notification.dateCreated) }} · {{ notification.read ? `read ${formatDate(notification.dateRead)}` : "unread" }} · expires {{ formatDate(notification.dateExpiry, false) }}
                                </div>
                                <template #append>
                                    <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" aria-label="Delete notification" @click="deleteNotification(notification)"></v-btn>
                                </template>
                            </v-list-item>
                        </v-list>
                        <div v-else class="text-medium-emphasis">No notifications.</div>
                    </v-window-item>

                    <!-- DATA -->
                    <v-window-item value="data">
                        <h3 class="form-section mt-0">Recipes</h3>
                        <v-table v-if="details.recipes.length" density="compact">
                            <tbody>
                                <tr v-for="recipe in details.recipes" :key="recipe.id">
                                    <td>{{ recipe.title }}</td>
                                    <td class="text-body-small text-medium-emphasis">{{ recipe.conditionCount }} conditions, {{ recipe.actionCount }} actions</td>
                                    <td class="text-right">
                                        <v-chip v-if="recipe.disabled" size="x-small" color="error" label>Disabled</v-chip>
                                        <v-chip v-if="recipe.killSwitch" size="x-small" color="warning" label class="ml-1">Kill switch</v-chip>
                                    </td>
                                </tr>
                            </tbody>
                        </v-table>
                        <div v-else class="text-medium-emphasis">No recipes.</div>

                        <h3 class="form-section">Calendars</h3>
                        <v-table v-if="details.calendars.length" density="compact">
                            <tbody>
                                <tr v-for="cal in details.calendars" :key="cal.id">
                                    <td class="text-truncate">{{ cal.id }}</td>
                                    <td class="text-body-small">{{ cal.activityCount || 0 }} activities, {{ cal.clubEventCount || 0 }} club events</td>
                                    <td class="text-body-small text-right">accessed {{ fromNow(cal.dateAccess) }}</td>
                                </tr>
                            </tbody>
                        </v-table>
                        <div v-else class="text-medium-emphasis">No calendars.</div>

                        <h3 class="form-section">Admin history</h3>
                        <AuditList :items="audit" />

                        <h3 class="form-section">Raw data</h3>
                        <pre class="raw-json">{{ rawJson }}</pre>
                    </v-window-item>

                    <!-- DANGER ZONE -->
                    <v-window-item value="danger">
                        <v-alert type="error" variant="tonal" title="Delete user">
                            Permanently deletes the account and all related data: recipes, GearWear, calendars, notifications and linked accounts. Users with an ongoing Paddle or PayPal subscription must have it cancelled first.
                            <div class="mt-4">
                                <v-btn color="error" variant="flat" prepend-icon="mdi-delete-forever-outline" :loading="saving" @click="deleteUser">Delete user</v-btn>
                            </div>
                        </v-alert>
                    </v-window-item>
                </v-window>
            </v-card-text>
        </v-card>

        <SubscriptionDialog v-model="editSubscriptionOpen" :subscription="editSubscription" @saved="fetchUser" />
    </v-dialog>
</template>

<style lang="scss" scoped>
.min-width-0 {
    min-width: 0;
}

.dialog-body {
    min-height: 360px;
}

.info-label {
    font-size: 0.75rem;
    opacity: 0.65;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.form-section {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
    margin: 20px 0 8px;
}

.raw-json {
    background: rgba(0, 0, 0, 0.04);
    border-radius: 8px;
    font-size: 0.75rem;
    max-height: 400px;
    overflow: auto;
    padding: 12px;
}
</style>
