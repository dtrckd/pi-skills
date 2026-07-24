#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const PORT = process.env.BROWSER_TOOLS_PORT || "9222";
const args = process.argv.slice(2);
const clickIdx = args.indexOf("--click");
const selector = clickIdx !== -1 ? args[clickIdx + 1] : null;
const dirIdx = args.indexOf("--dir");
const skip = new Set();
if (clickIdx !== -1) skip.add(clickIdx + 1);
if (dirIdx !== -1) skip.add(dirIdx + 1);
const url = args.find((a, i) => !a.startsWith("--") && !skip.has(i));

if ((!url && !selector) || (url && selector)) {
	console.log("Usage: browser-download.js <url> [--dir <path>]");
	console.log("       browser-download.js --click <selector> [--dir <path>]");
	console.log("\nExamples:");
	console.log("  browser-download.js https://example.com/invoice.pdf");
	console.log('  browser-download.js --click "a.invoice-download" --dir /tmp/bills');
	console.log(`\nDownloads inherit cookies/auth from the running :${PORT} browser session.`);
	process.exit(1);
}

// CDP requires an absolute downloadPath
const dir = dirIdx !== -1 ? resolve(args[dirIdx + 1]) : mkdtempSync(join(tmpdir(), "browser-dl-"));
mkdirSync(dir, { recursive: true });

const b = await Promise.race([
	puppeteer.connect({
		browserURL: `http://localhost:${PORT}`,
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

const p = (await b.pages()).at(-1);
if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

// Browser-level session so downloads from any tab/popup are captured
const session = await b.target().createCDPSession();
await session.send("Browser.setDownloadBehavior", {
	behavior: "allow",
	downloadPath: dir,
	eventsEnabled: true,
});

let filename = null;
const done = new Promise((res, rej) => {
	session.on("Browser.downloadWillBegin", (e) => {
		filename = e.suggestedFilename;
	});
	session.on("Browser.downloadProgress", (e) => {
		if (e.state === "completed") res();
		else if (e.state === "canceled") rej(new Error("Download canceled"));
	});
	setTimeout(() => rej(new Error("Timed out after 120s (no download triggered?)")), 120_000);
});

if (selector) {
	// In-page click (skill idiom); p.click() hangs over connect() in puppeteer 23
	const found = await p.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (el) el.click();
		return !!el;
	}, selector);
	if (!found) {
		console.error(`✗ No element matches selector: ${selector}`);
		process.exit(1);
	}
} else {
	// Direct download URLs abort navigation by design
	await p.goto(url, { waitUntil: "domcontentloaded" }).catch((e) => {
		if (!e.message.includes("net::ERR_ABORTED")) throw e;
	});
}

try {
	await done;
} catch (e) {
	console.error("✗", e.message);
	process.exit(1);
}

// Chrome may dedupe the filename ("file (1).pdf") — fall back to newest file in dir
let file = filename && existsSync(join(dir, filename)) ? join(dir, filename) : null;
if (!file) {
	file = readdirSync(dir)
		.filter((f) => !f.endsWith(".crdownload"))
		.map((f) => join(dir, f))
		.sort((a, b2) => statSync(b2).mtimeMs - statSync(a).mtimeMs)[0];
}

console.log("✓ Downloaded:", file);
await b.disconnect();
process.exit(0);
