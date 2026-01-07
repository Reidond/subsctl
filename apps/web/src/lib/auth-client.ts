import { createAuthClient } from 'better-auth/client'

const baseURL = `${window.location.origin}/api/auth`

export const authClient = createAuthClient({
	baseURL,
})
