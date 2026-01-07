import { betterAuth } from 'better-auth'
import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'
import type { Env } from './env'

type AuthDatabase = Record<string, unknown>

let cachedAuth: ReturnType<typeof betterAuth> | null = null

export function getAuth(env: Env) {
	if (cachedAuth) {
		return cachedAuth
	}

	const db = new Kysely<AuthDatabase>({
		dialect: new D1Dialect({
			database: env.DB,
		}),
	})

	cachedAuth = betterAuth({
		database: db,
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		session: {
			expiresIn: 60 * 60 * 24 * 30,
		},
		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
			},
		},
	})

	return cachedAuth
}
