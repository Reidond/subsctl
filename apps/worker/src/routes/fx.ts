import { Elysia } from 'elysia'
import type { Env } from '../env'
import { getDb } from '../db'
import { getFxRates } from '../fx'
import { authPlugin } from '../auth-plugin'
import { appError } from '../errors'
import { consumeRateLimit } from '../throttle'

export function fxRoutes(env: Env) {
	const db = getDb(env)

	return new Elysia({ prefix: '/api/fx' }).use(authPlugin(env)).get(
		'/rates',
		async ({ user }) => {
			const authUser = user as { id: string }
			const allowed = consumeRateLimit(`fx-rates:${authUser.id}`, 30, 60_000)
			if (!allowed) {
				throw appError.tooManyRequests('FX rate limit exceeded')
			}
			const snapshot = await getFxRates(env, db)
			return {
				rates: snapshot.rates,
				base: snapshot.base,
				fetchedAt: snapshot.fetchedAt,
				isStale: snapshot.isStale,
			}
		},
		{ auth: true }
	)
}
