<script lang="ts" setup>
const props = defineProps<{gear: any; units?: string}>()
const emit = defineEmits<{updated: [gear: any]; deleted: [id: string]}>()

const {notify} = useToast()
const saving = ref(false)
const components = ref<any[]>([])
const distanceUnit = computed(() => (props.units == "imperial" ? "mi" : "km"))

// Editable copy of the components, times are edited in hours.
const reset = () => {
    components.value = (props.gear?.components || []).map((c: any) => ({
        originalName: c.name,
        name: c.name,
        currentDistance: c.currentDistance || 0,
        currentHours: Math.round(((c.currentTime || 0) / 3600) * 10) / 10,
        alertDistance: c.alertDistance || 0,
        alertHours: Math.round(((c.alertTime || 0) / 3600) * 10) / 10,
        preAlertPercent: c.preAlertPercent || 0,
        activityCount: c.activityCount || 0,
        disabled: c.disabled || false,
        dateAlertSent: c.dateAlertSent
    }))
}

watch(() => props.gear, reset, {immediate: true})

const addComponent = () => {
    components.value.push({name: "", currentDistance: 0, currentHours: 0, alertDistance: 0, alertHours: 0, preAlertPercent: 0, activityCount: 0, disabled: false})
}

const save = async () => {
    saving.value = true
    try {
        const body = {
            components: components.value.map((c) => ({
                originalName: c.originalName,
                name: c.name,
                currentDistance: c.currentDistance,
                currentTime: Math.round(parseFloat(c.currentHours || 0) * 3600),
                alertDistance: c.alertDistance,
                alertTime: Math.round(parseFloat(c.alertHours || 0) * 3600),
                preAlertPercent: c.preAlertPercent,
                activityCount: c.activityCount,
                disabled: c.disabled
            }))
        }
        const updated = await api(`/api/gear/${props.gear.id}`, {method: "PATCH", body})
        notify(`Gear ${props.gear.id} updated`)
        emit("updated", updated)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}

const toggleEnabled = async () => {
    saving.value = true
    try {
        const updated = await api(`/api/gear/${props.gear.id}`, {method: "PATCH", body: {disabled: !props.gear.disabled}})
        notify(`Gear ${props.gear.id} ${updated.disabled ? "disabled" : "enabled"}`)
        emit("updated", updated)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}

const remove = async () => {
    if (prompt(`This will delete the GearWear configuration of ${props.gear.name || props.gear.id}. Type the gear ID (${props.gear.id}) to confirm:`)?.trim() != props.gear.id) return
    saving.value = true
    try {
        await api(`/api/gear/${props.gear.id}`, {method: "DELETE", body: {confirm: props.gear.id}})
        notify(`Gear ${props.gear.id} deleted`)
        emit("deleted", props.gear.id)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <div>
        <div class="d-flex flex-wrap align-center ga-2 mb-3">
            <v-chip :color="gear.disabled ? 'error' : 'success'" variant="tonal" label size="small">{{ gear.disabled ? "Disabled" : "Enabled" }}</v-chip>
            <v-chip v-if="gear.updating" color="warning" variant="tonal" label size="small">Updating now</v-chip>
            <span class="text-body-small text-medium-emphasis">
                Last update: {{ formatDate(gear.lastUpdate?.date) }}
                <template v-if="gear.lastUpdate"> ({{ formatNumber(gear.lastUpdate.distance) }} {{ distanceUnit }}, {{ gear.lastUpdate.activities?.length || 0 }} activities{{ gear.lastUpdate.rollback ? ", rollback" : "" }})</template>
            </span>
        </div>

        <div v-for="(comp, index) in components" :key="index" class="component-row">
            <v-row density="compact" align="center">
                <v-col cols="12" sm="6" md="3">
                    <v-text-field v-model="comp.name" label="Component" density="compact"></v-text-field>
                </v-col>
                <v-col cols="6" sm="3" md="2">
                    <v-text-field v-model.number="comp.currentDistance" :label="`Distance (${distanceUnit})`" type="number" min="0" density="compact"></v-text-field>
                </v-col>
                <v-col cols="6" sm="3" md="1">
                    <v-text-field v-model.number="comp.currentHours" label="Hours" type="number" min="0" density="compact"></v-text-field>
                </v-col>
                <v-col cols="6" sm="3" md="2">
                    <v-text-field v-model.number="comp.alertDistance" :label="`Alert at (${distanceUnit})`" type="number" min="0" density="compact" hint="Min. 100, 0 = off"></v-text-field>
                </v-col>
                <v-col cols="6" sm="3" md="1">
                    <v-text-field v-model.number="comp.alertHours" label="Alert (h)" type="number" min="0" density="compact" hint="Min. 20, 0 = off"></v-text-field>
                </v-col>
                <v-col cols="6" sm="3" md="1">
                    <v-text-field v-model.number="comp.preAlertPercent" label="Pre-alert %" type="number" min="0" max="99" density="compact"></v-text-field>
                </v-col>
                <v-col cols="6" sm="3" md="2" class="d-flex align-center justify-end">
                    <v-switch v-model="comp.disabled" :true-value="false" :false-value="true" label="On" class="flex-grow-0 mr-2"></v-switch>
                    <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" :aria-label="`Remove ${comp.name}`" @click="components.splice(index, 1)"></v-btn>
                </v-col>
            </v-row>
            <div class="text-body-small text-medium-emphasis px-1">
                {{ formatNumber(comp.activityCount) }} activities
                <template v-if="comp.dateAlertSent"> · alert sent {{ formatDate(comp.dateAlertSent, false) }}</template>
            </div>
        </div>
        <div v-if="components.length == 0" class="text-medium-emphasis text-body-medium mb-2">No components.</div>

        <div class="d-flex flex-wrap ga-2 mt-3">
            <v-btn variant="text" prepend-icon="mdi-plus" @click="addComponent">Add component</v-btn>
            <v-spacer></v-spacer>
            <v-btn variant="text" color="error" prepend-icon="mdi-delete-outline" :disabled="saving" @click="remove">Delete</v-btn>
            <v-btn variant="tonal" :prepend-icon="gear.disabled ? 'mdi-check-circle-outline' : 'mdi-pause-circle-outline'" :disabled="saving" @click="toggleEnabled">{{ gear.disabled ? "Enable" : "Disable" }}</v-btn>
            <v-btn variant="text" :disabled="saving" @click="reset">Reset</v-btn>
            <v-btn color="primary" variant="flat" prepend-icon="mdi-content-save-outline" :loading="saving" @click="save">Save components</v-btn>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.component-row {
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    padding: 8px 0;
}
</style>
