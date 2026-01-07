import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { AppShell } from '@/components/app-shell'
import { AuthProvider } from '@/components/auth-context'
import { ToastProvider } from '@/components/toast'

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60 * 5,
			retry: 1,
		},
	},
})

export const Route = createRootRoute({
	component: RootComponent,
})

function RootComponent() {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<ToastProvider>
					<AppShell>
						<Outlet />
					</AppShell>
					{import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
				</ToastProvider>
			</AuthProvider>
		</QueryClientProvider>
	)
}
