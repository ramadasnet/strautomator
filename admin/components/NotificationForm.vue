<script lang="ts" setup>
const props = defineProps<{userIds?: string[]}>()
const emit = defineEmits<{sent: [result: any]}>()

const {notify} = useToast()
const sending = ref(false)
const recipients = ref("")
const title = ref("")
const body = ref("")
const href = ref("")
const dateExpiry = ref("")

const fixedRecipients = computed(() => (props.userIds?.length ? props.userIds : null))
const recipientIds = computed(() => fixedRecipients.value || recipients.value.split(/[\s,;]+/).filter(Boolean))
const valid = computed(() => recipientIds.value.length > 0 && title.value.trim().length > 2 && body.value.trim().length > 5)

const send = async () => {
    if (recipientIds.value.length > 1 && !confirm(`Send this notification to ${recipientIds.value.length} users?`)) return
    sending.value = true
    try {
        const result = await api("/api/notifications", {
            method: "POST",
            body: {userIds: recipientIds.value, title: title.value, body: body.value, href: href.value, dateExpiry: fromDateInput(dateExpiry.value)}
        })
        const notFound = result.notFound.length ? `, not found: ${result.notFound.join(", ")}` : ""
        notify(`Notification sent to ${result.sent.length} user(s)${notFound}`, result.notFound.length ? "warning" : "success")
        title.value = ""
        body.value = ""
        href.value = ""
        dateExpiry.value = ""
        if (!fixedRecipients.value) recipients.value = ""
        emit("sent", result)
    } catch (ex) {
        notify(errorMessage(ex), "error")
    } finally {
        sending.value = false
    }
}
</script>

<template>
    <v-form @submit.prevent="send">
        <v-row density="compact">
            <v-col v-if="!fixedRecipients" cols="12">
                <v-textarea v-model="recipients" label="User IDs" rows="2" auto-grow hint="Separated by commas, spaces or new lines (max. 1000)" persistent-hint></v-textarea>
            </v-col>
            <v-col cols="12" md="6"><v-text-field v-model="title" label="Title" maxlength="100" counter></v-text-field></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="href" label="Link (optional)" placeholder="/gear or https://..."></v-text-field></v-col>
            <v-col cols="12"><v-textarea v-model="body" label="Message" rows="3" auto-grow maxlength="1000" counter></v-textarea></v-col>
            <v-col cols="12" sm="6"><v-text-field v-model="dateExpiry" label="Expires on (optional)" type="date" hint="Defaults to 120 days" persistent-hint></v-text-field></v-col>
            <v-col cols="12" sm="6" class="d-flex align-center justify-end">
                <v-btn type="submit" color="primary" variant="flat" prepend-icon="mdi-send-outline" :disabled="!valid" :loading="sending"> Send{{ recipientIds.length > 1 ? ` to ${recipientIds.length} users` : "" }} </v-btn>
            </v-col>
        </v-row>
    </v-form>
</template>
