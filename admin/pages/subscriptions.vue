<script lang="ts" setup>
definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const route = useRoute()
const {notify} = useToast()
const {items, total, page, pageCount, truncated, loading, fetch, setQuery} = usePagedList("/api/subscriptions", ["status", "source"])

const statuses = ["APPROVAL_PENDING", "APPROVED", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]
const sources = ["amex", "friend", "github", "paddle", "paypal", "revolut", "traderepublic"]

const search = computed(() => (route.query.search as string) || "")
const editing = ref<any>(null)
const editOpen = ref(false)
const syncing = ref("")

const openEdit = (sub: any) => {
    editing.value = sub
    editOpen.value = true
}

// Check the Paddle customer against the subscription user, and fix the mismatch if needed.
// The Paddle API is only called when the button is clicked, to avoid hitting it for every row.
const syncPaddleCustomer = async (sub: any) => {
    let check: any
    syncing.value = sub.id

    try {
        check = await api("/api/subscriptions/paddle-customer", {query: {id: sub.id}})
    } catch (ex) {
        notify(`Failed to check the Paddle customer: ${errorMessage(ex)}`, "error")
        syncing.value = ""
        return
    }

    try {
        if (!check.mismatch) {
            notify(`Paddle customer ${check.customerId} and subscription ${check.id} are in sync (user ${check.customerUserId || "none"})`, "info")
            return
        }

        const current = check.userId && check.userId != "notfound" ? check.userId : "none"
        const userId = prompt(`Paddle customer ${check.customerId} is set to user ${check.customerUserId || "none"}, but subscription ${check.id} belongs to user ${current}.\nEnter the correct user ID:`)?.trim()
        if (!userId) return
        if (!/^\d+$/.test(userId)) {
            notify("Invalid user ID", "error")
            return
        }
        if (!confirm(`Set the user of subscription ${sub.id} and Paddle customer ${check.customerId} to ${userId}?`)) return

        await api("/api/subscriptions/paddle-customer", {method: "POST", body: {id: sub.id, userId: userId}})
        notify("Paddle customer and subscription updated")
        fetch()
    } catch (ex) {
        notify(`Failed to change the user: ${errorMessage(ex)}`, "error")
    } finally {
        syncing.value = ""
    }
}
</script>

<template>
    <div>
        <v-card>
            <div class="d-flex flex-wrap ga-2 pa-3">
                <SearchField class="toolbar-search" placeholder="Subscription ID, source, user ID or price" />
                <v-select :model-value="route.query.status || null" :items="statuses" :disabled="!!search" label="Status" density="compact" clearable hide-details class="toolbar-select" @update:model-value="setQuery({status: $event})"></v-select>
                <v-select :model-value="route.query.source || null" :items="sources" :disabled="!!search" label="Source" density="compact" clearable hide-details class="toolbar-select" @update:model-value="setQuery({source: $event})"></v-select>
                <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Refresh" @click="fetch"></v-btn>
            </div>
            <v-progress-linear :active="loading" indeterminate color="primary"></v-progress-linear>
            <v-divider></v-divider>

            <v-table hover density="comfortable">
                <thead>
                    <tr>
                        <th>Subscription</th>
                        <th>User</th>
                        <th>Status</th>
                        <th class="d-none d-md-table-cell">Price</th>
                        <th class="d-none d-lg-table-cell">Last / next payment</th>
                        <th class="d-none d-lg-table-cell">Expiry</th>
                        <th class="d-none d-xl-table-cell">Updated</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="sub in items" :key="sub.id">
                        <td>
                            <div class="font-weight-medium text-no-wrap">{{ sub.id }}</div>
                            <div class="text-body-small text-medium-emphasis">
                                {{ sub.source }}<template v-if="sub.customerId"> · {{ sub.customerId }}</template>
                            </div>
                        </td>
                        <td><UserLink :user-id="sub.userId" :user="sub.user" /></td>
                        <td>
                            <v-chip :color="statusColor(sub.status)" size="small" variant="tonal" label>{{ sub.status }}</v-chip>
                        </td>
                        <td class="d-none d-md-table-cell text-no-wrap">
                            {{ sub.price ? `${sub.price} ${sub.currency || "USD"}` : "-" }} <span class="text-body-small">{{ sub.frequency || "" }}</span>
                        </td>
                        <td class="d-none d-lg-table-cell text-no-wrap">{{ formatDate(sub.dateLastPayment, false) }} / {{ formatDate(sub.dateNextPayment, false) }}</td>
                        <td class="d-none d-lg-table-cell text-no-wrap">{{ formatDate(sub.dateExpiry, false) }}</td>
                        <td class="d-none d-xl-table-cell text-no-wrap" :title="formatDate(sub.dateUpdated)">{{ fromNow(sub.dateUpdated) }}</td>
                        <td class="text-right text-no-wrap">
                            <v-btn
                                v-if="sub.source == 'paddle' && sub.customerId"
                                icon="mdi-account-sync-outline"
                                size="small"
                                variant="text"
                                :loading="syncing == sub.id"
                                title="Check the Paddle customer user ID against the subscription"
                                aria-label="Sync Paddle customer"
                                @click="syncPaddleCustomer(sub)"
                            ></v-btn>
                            <v-btn size="small" variant="tonal" color="primary" @click="openEdit(sub)">Edit</v-btn>
                        </td>
                    </tr>
                    <tr v-if="!loading && !items.length">
                        <td colspan="8" class="text-center text-medium-emphasis py-8">No subscriptions found.</td>
                    </tr>
                </tbody>
            </v-table>

            <v-divider></v-divider>
            <ListPager :page="page" :page-count="pageCount" :total="total" :truncated="truncated" @change="setQuery({page: $event})" />
        </v-card>

        <SubscriptionDialog v-model="editOpen" :subscription="editing" @saved="fetch" />
    </div>
</template>

<style lang="scss" scoped>
.toolbar-search {
    flex: 1 1 280px;
}

.toolbar-select {
    flex: 0 1 200px;
    min-width: 160px;
}
</style>
