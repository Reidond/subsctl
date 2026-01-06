import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
	component: IndexComponent,
})

function IndexComponent() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
			<h1 className="text-4xl font-bold">subsctl</h1>
			<p className="text-muted-foreground">Subscription tracking made simple.</p>
		</main>
	)
}
