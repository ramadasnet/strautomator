<script lang="ts" setup>
import {GoogleSignInButton, CredentialResponse} from "vue3-google-signin"
import {storeToRefs} from "pinia"
import {useAuthStore} from "~/store/auth"

const {authenticateUser} = useAuthStore()
const {authenticated} = storeToRefs(useAuthStore())
const router = useRouter()
const loginError = ref("")

const handleLoginSuccess = async (response: CredentialResponse) => {
    await authenticateUser(response)
    if (authenticated.value) {
        router.push({path: "/"})
    } else {
        loginError.value = "Failed to authenticate user"
    }
}

const handleLoginError = (ex) => {
    loginError.value = `Failed to login: ${ex.message || ex.toString()}`
}
</script>

<template>
    <v-app>
        <div class="text-center">
            <h1 class="mt-4 mb-10">Strautomator Admin</h1>

            <GoogleSignInButton @success="handleLoginSuccess" @error="handleLoginError" auto-select="true"></GoogleSignInButton>
            <p v-if="loginError">
                {{ loginError }}
            </p>
        </div>
    </v-app>
</template>
