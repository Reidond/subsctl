import { Elysia } from 'elysia'
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker'

export default new Elysia({
	adapter: CloudflareAdapter,
})
	.get('/', () => 'Hello Elysia')
	.compile()
