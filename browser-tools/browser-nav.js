#!/usr/bin/env node

import { connect } from "./connect.js";

const args = process.argv.slice(2);
const newTab = args.includes("--new");
const reload = args.includes("--reload");
const url = args.find(a => !a.startsWith("--"));

if (!url) {
	console.log("Usage: browser-nav.js <url> [--new] [--reload]");
	console.log("\nExamples:");
	console.log("  browser-nav.js https://example.com          # Navigate current tab");
	console.log("  browser-nav.js https://example.com --new    # Open in new tab");
	console.log("  browser-nav.js https://example.com --reload # Navigate and force reload");
	process.exit(1);
}

const b = await connect();

// Bounded goto: connect.js filters iframe targets, which starves the lifecycle
// watcher on OOPIF-heavy pages even though the page loads fine. Verify via url().
const go = (p) => p.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});

if (newTab) {
	const p = await b.newPage();
	await go(p);
	console.log("✓ Opened:", p.url());
} else {
	const p = (await b.pages()).at(-1);
	await go(p);
	if (reload) {
		await p.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
	}
	console.log("✓ Navigated to:", p.url());
}

await b.disconnect();
