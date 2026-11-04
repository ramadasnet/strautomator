<script lang="ts" setup>
defineProps<{page: number; pageCount: number; total: number; truncated?: boolean}>()
defineEmits<{change: [page: number]}>()
</script>

<template>
    <div class="list-pager d-flex flex-wrap align-center ga-2 pa-3">
        <span class="text-body-medium text-medium-emphasis"> {{ formatNumber(total) }} result{{ total == 1 ? "" : "s" }}<template v-if="truncated"> (search truncated, refine the term to see more)</template> </span>
        <v-spacer></v-spacer>
        <v-pagination v-if="pageCount > 1" :model-value="page" :length="pageCount" :total-visible="5" density="comfortable" size="small" @update:model-value="$emit('change', $event)"></v-pagination>
    </div>
</template>
