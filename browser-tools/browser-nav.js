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
// watcher on OOPIF-heavy pages even though the page loads fine. Only a timeout is
// tolerated (reported); real navigation errors (DNS, refused, bad URL) exit 1.
let timedOut = false;
const tolerate = (e) => {
	if (e.name !== "TimeoutError") {
		console.error("✗ Navigation failed:", e.message);
		process.exit(1);
	}
	timedOut = true;
};
const go = (p) => p.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(tolerate);
const note = () => (timedOut ? " (load tracking timed out; verify with browser-eval.js)" : "");

if (newTab) {
	const p = await b.newPage();
	await go(p);
	console.log(`✓ Opened: ${p.url()}${note()}`);
} else {
	const p = (await b.pages()).at(-1);
	await go(p);
	if (reload) {
		await p.reload({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(tolerate);
	}
	console.log(`✓ Navigated to: ${p.url()}${note()}`);
}

await b.disconnect();
