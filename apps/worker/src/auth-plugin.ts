import { Elysia } from 'elysia'
import { getAuth } from './auth'
import type { Env } from './env'
import { appError } from './errors'

function parseAllowedEmails(value?: string) {
	return (value ?? '')
		.split(',')
		.map((email) => email.trim())
		.filter(Boolean)
}

export function authPlugin(env: Env) {
	const auth = getAuth(env)
	const allowedEmails = parseAllowedEmails(env.ALLOWED_EMAILS)

	return new Elysia().macro({
		auth: {
			async resolve({ request }) {
				const session = await auth.api.getSession({
					headers: request.headers,
				})

				if (!session?.user) {
					throw appError.unauthorized()
				}

				if (allowedEmails.length > 0 && !allowedEmails.includes(session.user.email)) {
					throw appError.forbidden()
				}

				return {
					user: session.user,
					session: session.session,
				}
			},
		},
	})
}
