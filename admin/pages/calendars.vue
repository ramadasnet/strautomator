<script lang="ts" setup>
definePageMeta({
    layout: "admin",
    middleware: "auth"
})

const {items, total, page, pageCount, truncated, loading, fetch, setQuery} = usePagedList("/api/calendars")

// Event count, or "0" when the event type is enabled but empty, or "-" when disabled.
const eventCount = (count: number, enabled: boolean) => (count ? formatNumber(count) : enabled ? "0" : "-")
</script>

<template>
    <div>
        <v-card>
            <div class="d-flex flex-wrap ga-2 pa-3">
                <SearchField class="toolbar-search" placeholder="Calendar ID or user ID" />
                <v-btn icon="mdi-refresh" variant="text" :loading="loading" aria-label="Refresh" @click="fetch"></v-btn>
            </div>
            <v-progress-linear :active="loading" indeterminate color="primary"></v-progress-linear>
            <v-divider></v-divider>

            <v-table hover density="comfortable">
                <thead>
                    <tr>
                        <th>Calendar</th>
                        <th>User</th>
                        <th class="d-none d-md-table-cell">Range (days)</th>
                        <th class="d-none d-sm-table-cell text-center">Activities</th>
                        <th class="d-none d-sm-table-cell text-center">Club events</th>
                        <th class="d-none d-lg-table-cell text-center">Gear events</th>
                        <th class="d-none d-md-table-cell">Last access</th>
                        <th class="d-none d-lg-table-cell">Last update</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="cal in items" :key="cal.id">
                        <td class="text-truncate cell-id" :title="cal.id">{{ cal.id }}</td>
                        <td><UserLink :user-id="cal.userId" :user="cal.user" /></td>
                        <td class="d-none d-md-table-cell">{{ cal.options?.daysFrom || "#" }} to {{ cal.options?.daysTo || "#" }}</td>
                        <td class="d-none d-sm-table-cell text-center">{{ eventCount(cal.activityCount, cal.options?.activities) }}</td>
                        <td class="d-none d-sm-table-cell text-center">{{ eventCount(cal.clubEventCount, cal.options?.clubs) }}</td>
                        <td class="d-none d-lg-table-cell text-center">{{ eventCount(cal.gearEventCount, cal.options?.gear) }}</td>
                        <td class="d-none d-md-table-cell text-no-wrap" :title="formatDate(cal.dateAccess)">{{ fromNow(cal.dateAccess) }}</td>
                        <td class="d-none d-lg-table-cell text-no-wrap">{{ formatDate(cal.dateUpdated) }}</td>
                    </tr>
                    <tr v-if="!loading && !items.length">
                        <td colspan="8" class="text-center text-medium-emphasis py-8">No calendars found.</td>
                    </tr>
                </tbody>
            </v-table>

            <v-divider></v-divider>
            <ListPager :page="page" :page-count="pageCount" :total="total" :truncated="truncated" @change="setQuery({page: $event})" />
        </v-card>
    </div>
</template>

<style lang="scss" scoped>
.toolbar-search {
    flex: 1 1 280px;
}

.cell-id {
    max-width: 220px;
}
</style>
