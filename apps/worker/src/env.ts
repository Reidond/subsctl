export interface Env {
	DB: D1Database
	ASSETS?: Fetcher
	VECTORIZE?: VectorizeIndex
	EMBEDDINGS_QUEUE?: Queue
	AI: Ai
	APP_VERSION?: string
	ALLOWED_EMAILS?: string
	BETTER_AUTH_SECRET: string
	BETTER_AUTH_URL: string
	GOOGLE_CLIENT_ID: string
	GOOGLE_CLIENT_SECRET: string
	OPEN_EXCHANGE_RATES_APP_ID?: string
	VAPID_PUBLIC_KEY?: string
	VAPID_PRIVATE_KEY?: string
}
