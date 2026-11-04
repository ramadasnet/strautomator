<script lang="ts" setup>
const props = defineProps<{subscription: any}>()
const emit = defineEmits<{saved: [subscription: any]}>()
const open = defineModel<boolean>({default: false})

const {notify} = useToast()
const saving = ref(false)
const form = ref<any>({})
const statuses = ["APPROVAL_PENDING", "APPROVED", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"]
const frequencies = ["monthly", "yearly", "lifetime"]
const isPaid = computed(() => ["paddle", "paypal"].includes(props.subscription?.source))

watch(
    () => [props.subscription, open.value],
    () => {
        const sub = props.subscription || {}
        form.value = {
            status: sub.status,
            frequency: sub.frequency || null,
            price: sub.price ?? "",
            currency: sub.currency || "",
            dateExpiry: toDateInput(sub.dateExpiry),
            dateNextPayment: toDateInput(sub.dateNextPayment),
            userId: sub.userId && sub.userId != "notfound" ? sub.userId : "",
            syncUser: true
        }
    },
    {immediate: true}
)

const save = async () => {
    saving.value = true
    try {
        const body: any = {
            status: form.value.status,
            frequency: form.value.frequency || undefined,
            price: form.value.price === "" ? null : form.value.price,
            currency: form.value.currency,
            dateExpiry: fromDateInput(form.value.dateExpiry),
            dateNextPayment: fromDateInput(form.value.dateNextPayment),
            syncUser: form.value.syncUser
        }
        if (form.value.userId?.trim()) body.userId = form.value.userId.trim()

        const result = await api(`/api/subscriptions/${encodeURIComponent(props.subscription.id)}`, {method: "PATCH", body})
        notify(result.changed ? `Subscription ${props.subscription.id} updated` : "Nothing to update", result.changed ? "success" : "info")
        emit("saved", result.subscription)
        open.value = false
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        saving.value = false
    }
}
</script>

<template>
    <v-dialog v-model="open" max-width="640" scrollable>
        <v-card v-if="subscription">
            <v-card-title class="d-flex align-center">
                <span class="text-truncate">Subscription {{ subscription.id }}</span>
                <v-spacer></v-spacer>
                <v-btn icon="mdi-close" variant="text" aria-label="Close" @click="open = false"></v-btn>
            </v-card-title>
            <v-card-subtitle>{{ subscription.source }} · created {{ formatDate(subscription.dateCreated) }} · last payment {{ formatDate(subscription.dateLastPayment, false) }}</v-card-subtitle>
            <v-card-text>
                <v-alert v-if="isPaid" type="warning" variant="tonal" density="compact" class="mb-4">
                    This is a {{ subscription.source }} subscription: changes here are not sent to {{ subscription.source }}, and might be overwritten by its webhooks.
                </v-alert>
                <v-row density="compact">
                    <v-col cols="12" sm="6"><v-select v-model="form.status" :items="statuses" label="Status"></v-select></v-col>
                    <v-col cols="12" sm="6"><v-select v-model="form.frequency" :items="frequencies" label="Frequency" clearable></v-select></v-col>
                    <v-col cols="6"><v-text-field v-model="form.price" label="Price" type="number" min="0" step="0.01"></v-text-field></v-col>
                    <v-col cols="6"><v-text-field v-model="form.currency" label="Currency" maxlength="3" placeholder="EUR"></v-text-field></v-col>
                    <v-col cols="12" sm="6"><v-text-field v-model="form.dateExpiry" label="Expiry date" type="date" clearable></v-text-field></v-col>
                    <v-col cols="12" sm="6"><v-text-field v-model="form.dateNextPayment" label="Next payment" type="date" clearable></v-text-field></v-col>
                    <v-col cols="12"><v-text-field v-model="form.userId" label="User ID" inputmode="numeric" hint="Changing the user moves the subscription (and PRO) to another account"></v-text-field></v-col>
                    <v-col cols="12">
                        <v-switch v-model="form.syncUser" label="Sync the user PRO status with the subscription status" color="primary"></v-switch>
                    </v-col>
                </v-row>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn variant="text" @click="open = false">Cancel</v-btn>
                <v-btn color="primary" variant="flat" :loading="saving" @click="save">Save</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>
