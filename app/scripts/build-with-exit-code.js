#!/usr/bin/env node

/**
 * Wrapper script to ensure proper exit code propagation from flatbread
 * This ensures that CI builds fail when they should fail.
 */

import { spawn } from "child_process"
import process from "process"

// Get the command to run from arguments
const args = process.argv.slice(2)

if (args.length === 0) {
	console.error("Usage: node build-with-exit-code.js <command> [args...]")
	process.exit(1)
}

// Spawn the child process with proper stdio handling
const child = spawn("npx", args, {
	stdio: "inherit",
	shell: true,
	env: process.env,
})

// Handle child process events
child.on("error", (error) => {
	console.error("Failed to start child process:", error)
	process.exit(1)
})

child.on("close", (code, signal) => {
	if (signal) {
		console.error(`Child process killed with signal ${signal}`)
		process.exit(1)
	}

	if (code !== 0) {
		console.error(`Child process exited with code ${code}`)
		process.exit(code)
	}

	console.log("Build completed successfully")
	process.exit(0)
})

// Handle termination signals
process.on("SIGINT", () => {
	console.log("Received SIGINT, terminating child process...")
	child.kill("SIGINT")
})

process.on("SIGTERM", () => {
	console.log("Received SIGTERM, terminating child process...")
	child.kill("SIGTERM")
})
