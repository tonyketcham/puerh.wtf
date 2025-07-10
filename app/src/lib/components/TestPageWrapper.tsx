import { ReactNode } from "react"

interface TestPageWrapperProps {
	children: ReactNode
}

export default function TestPageWrapper({ children }: TestPageWrapperProps) {
	// Allow test pages in development mode OR when running tests (CI or local)
	const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.CI === "true"
	const isDevelopment = process.env.NODE_ENV === "development"

	if (process.env.NODE_ENV === "production" && !isTestEnvironment) {
		return (
			<div className="flex items-center justify-center min-h-screen p-8 bg-gray-900">
				<div className="text-center">
					<h1 className="mb-4 text-2xl font-bold text-white">404 - Page Not Found</h1>
					<p className="text-gray-400">Test pages are not available in production.</p>
					<p className="mt-2 text-sm text-gray-500">
						This page is only available in development mode.
					</p>
				</div>
			</div>
		)
	}

	return <>{children}</>
}
