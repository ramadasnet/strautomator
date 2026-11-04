<script lang="ts" setup>
definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const route = useRoute()
const {notify} = useToast()
const {items, total, page, pageCount, loading, fetch, setQuery} = usePagedList("/api/notifications", ["userId"])
const userId = ref((route.query.userId as string) || "")

const applyUser = () => {
    const value = userId.value.trim()
    if (value && !/^\d+$/.test(value)) {
        notify("The user ID must be numeric", "error")
        return
    }
    setQuery({userId: value})
}

const remove = async (notification: any) => {
    if (!confirm(`Delete the notification "${notification.title}" sent to user ${notification.userId}?`)) return
    try {
        await api(`/api/notifications/${notification.id}`, {method: "DELETE", body: {confirm: notification.id}})
        notify("Notification deleted")
        fetch()
    } catch (ex) {
        notify(errorMessage(ex), "error")
    }
}

// Clear the field and apply right away.
const clear = () => {
    userId.value = ""
    applyUser()
}

watch(
    () => route.query.userId,
    (value) => (userId.value = (value as string) || "")
)
</script>

<template>
    <div>
        <v-card class="mb-4">
            <v-card-title class="pt-4">Send a notification</v-card-title>
            <v-card-subtitle>Shows up in the notifications area of the web dashboard for each of the users. Notifications are not sent by email.</v-card-subtitle>
            <v-card-text class="pt-4">
                <NotificationForm @sent="fetch" />
            </v-card-text>
        </v-card>

        <v-card>
            <div class="d-flex flex-wrap align-center ga-2 pa-3">
                <div class="text-title-medium font-weight-medium mr-4">Recent notifications</div>
                <v-text-field
                    v-model="userId"
                    placeholder="Filter by user ID"
                    prepend-inner-icon="mdi-account-search-outline"
                    density="compact"
                    clearable
                    single-line
                    hide-details
                    class="toolbar-search"
                    @keydown.enter="applyUser"
                    @click:clear="clear"
                ></v-text-field>
                <v-btn variant="tonal" @click="applyUser">Apply</v-btn>
                <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Refresh" @click="fetch"></v-btn>
            </div>
            <v-progress-linear :active="loading" indeterminate color="primary"></v-progress-linear>
            <v-divider></v-divider>

            <v-table hover density="comfortable">
                <thead>
                    <tr>
                        <th>Notification</th>
                        <th>User</th>
                        <th class="d-none d-md-table-cell">Created</th>
                        <th class="d-none d-sm-table-cell">Status</th>
                        <th class="d-none d-lg-table-cell">Expires</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="n in items" :key="n.id">
                        <td class="cell-notification">
                            <div class="font-weight-medium">
                                {{ n.title }}
                                <v-chip v-if="n.admin" size="x-small" color="primary" variant="tonal" label class="ml-1">Admin</v-chip>
                            </div>
                            <div class="text-body-small text-medium-emphasis text-truncate" :title="n.body">{{ n.body }}</div>
                        </td>
                        <td><UserLink :user-id="n.userId" :user="n.user" /></td>
                        <td class="d-none d-md-table-cell text-no-wrap" :title="formatDate(n.dateCreated)">{{ fromNow(n.dateCreated) }}</td>
                        <td class="d-none d-sm-table-cell">
                            <v-chip size="x-small" :color="n.read ? 'success' : 'warning'" variant="tonal" label>{{ n.read ? "Read" : "Unread" }}</v-chip>
                        </td>
                        <td class="d-none d-lg-table-cell text-no-wrap">{{ formatDate(n.dateExpiry, false) }}</td>
                        <td class="text-right">
                            <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" aria-label="Delete notification" @click="remove(n)"></v-btn>
                        </td>
                    </tr>
                    <tr v-if="!loading && !items.length">
                        <td colspan="6" class="text-center text-medium-emphasis py-8">No notifications found.</td>
                    </tr>
                </tbody>
            </v-table>

            <v-divider></v-divider>
            <ListPager :page="page" :page-count="pageCount" :total="total" @change="setQuery({page: $event})" />
        </v-card>
    </div>
</template>

<style lang="scss" scoped>
.toolbar-search {
    flex: 1 1 240px;
}

.cell-notification {
    max-width: 420px;
}
</style>
