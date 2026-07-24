#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";

const useProfile = process.argv[2] === "--profile";
const PORT = process.env.BROWSER_TOOLS_PORT || "9222";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chromium profile (cookies, logins)");
	process.exit(1);
}

// Default port keeps the legacy dir; custom ports get their own profile
const SCRAPING_DIR = `${process.env.HOME}/.cache/browser-tools${PORT === "9222" ? "" : `-${PORT}`}`;

// Bounded liveness probe: a full CDP connect can hang on a wedged browser,
// and its speed depends on what page the browser is sitting on.
const alive = () =>
	fetch(`http://localhost:${PORT}/json/version`, { signal: AbortSignal.timeout(2000) })
		.then((r) => r.ok)
		.catch(() => false);

if (await alive()) {
	console.log(`✓ Chromium already running on :${PORT}`);
	process.exit(0);
}

// Setup profile directory
execSync(`mkdir -p "${SCRAPING_DIR}"`, { stdio: "ignore" });

// Remove SingletonLock to allow new instance
try {
	execSync(`rm -f "${SCRAPING_DIR}/SingletonLock" "${SCRAPING_DIR}/SingletonSocket" "${SCRAPING_DIR}/SingletonCookie"`, { stdio: "ignore" });
} catch {}

if (useProfile) {
	console.log("Syncing profile...");
	execSync(
		`rsync -a --delete \
			--exclude='SingletonLock' \
			--exclude='SingletonSocket' \
			--exclude='SingletonCookie' \
			--exclude='*/Sessions/*' \
			--exclude='*/Current Session' \
			--exclude='*/Current Tabs' \
			--exclude='*/Last Session' \
			--exclude='*/Last Tabs' \
			"${process.env.HOME}/.config/chromium/" "${SCRAPING_DIR}/"`,
		{ stdio: "pipe" },
	);
}

// Start Chromium with flags to force new instance
spawn(
	"/usr/bin/chromium",
	[
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=${SCRAPING_DIR}`,
		"--no-first-run",
		"--no-default-browser-check",
	],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Chromium to be ready
let connected = false;
for (let i = 0; i < 30; i++) {
	if (await alive()) {
		connected = true;
		break;
	}
	await new Promise((r) => setTimeout(r, 500));
}

if (!connected) {
	console.error("✗ Failed to connect to Chromium");
	process.exit(1);
}

console.log(`✓ Chromium started on :${PORT}${useProfile ? " with your profile" : ""}`);
