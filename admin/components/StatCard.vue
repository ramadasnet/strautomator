<script lang="ts" setup>
defineProps<{title: string; value: any; icon?: string; color?: string; to?: string; hint?: string}>()
</script>

<template>
    <v-card :to="to" variant="flat" border class="stat-card h-100">
        <v-card-text class="d-flex align-center">
            <div class="flex-grow-1 min-width-0">
                <div class="text-body-small text-medium-emphasis text-uppercase">{{ title }}</div>
                <div class="text-headline-small font-weight-bold mt-1">{{ value === null || value === undefined ? "-" : typeof value == "number" ? value.toLocaleString("en-US") : value }}</div>
                <div v-if="hint" class="text-body-small text-medium-emphasis mt-1">{{ hint }}</div>
            </div>
            <v-avatar v-if="icon" :color="color || 'primary'" variant="tonal" size="44">
                <v-icon :icon="icon"></v-icon>
            </v-avatar>
        </v-card-text>
    </v-card>
</template>

<style lang="scss" scoped>
.min-width-0 {
    min-width: 0;
}
</style>
