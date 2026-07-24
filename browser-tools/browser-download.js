#!/usr/bin/env node

import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connect } from "./connect.js";

const args = process.argv.slice(2);
const opt = (name) => {
	const i = args.indexOf(name);
	return i !== -1 ? args[i + 1] : null;
};
const selector = opt("--click");
const clickText = opt("--click-text");
const pageUrl = opt("--url");
const outName = opt("--out");
const dirArg = opt("--dir");

const optValueIdx = new Set();
for (const name of ["--click", "--click-text", "--url", "--out", "--dir"]) {
	const i = args.indexOf(name);
	if (i !== -1) optValueIdx.add(i + 1);
}
const url = args.find((a, i) => !a.startsWith("--") && !optValueIdx.has(i));

const clickMode = !!(selector || clickText);
if ((!url && !clickMode) || (url && clickMode) || (selector && clickText) || (pageUrl && !clickMode)) {
	console.log("Usage: browser-download.js <url> [--dir <path>] [--out <name>]");
	console.log("       browser-download.js [--url <page>] --click <selector> [--dir <path>] [--out <name>]");
	console.log('       browser-download.js [--url <page>] --click-text <regex> [--dir <path>] [--out <name>]');
	console.log("\nExamples:");
	console.log("  browser-download.js https://example.com/invoice.pdf");
	console.log('  browser-download.js --click "a.invoice-download" --dir /tmp/bills');
	console.log('  browser-download.js --url https://pay.example.com/inv/123 --click-text "Download invoice" --out 2026-07-04.pdf');
	console.log("\n--url navigates the current tab first (for portals where each bill lives on its own page).");
	console.log("--click-text matches a button/link by its visible text (case-insensitive regex).");
	console.log("--out renames the download (overwrites an existing file with that name).");
	console.log("\nDownloads inherit cookies/auth from the running browser session.");
	process.exit(1);
}

// CDP requires an absolute downloadPath
const dir = dirArg ? resolve(dirArg) : mkdtempSync(join(tmpdir(), "browser-dl-"));
mkdirSync(dir, { recursive: true });

const b = await connect();

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
let started = false;
const done = new Promise((res, rej) => {
	session.on("Browser.downloadWillBegin", (e) => {
		started = true;
		filename = e.suggestedFilename;
	});
	session.on("Browser.downloadProgress", (e) => {
		if (e.state === "completed") res();
		else if (e.state === "canceled") rej(new Error("Download canceled"));
	});
	setTimeout(() => rej(new Error("Timed out after 120s (no download triggered?)")), 120_000);
});

// Fail fast: if the action lands on a normal page instead of triggering a
// download, abort after a short grace period rather than waiting 120s.
const failFast = async (hint) => {
	await new Promise((r) => setTimeout(r, 5000));
	if (!started) {
		console.error(`✗ No download triggered within 5s. ${hint}`);
		process.exit(1);
	}
};

if (clickMode) {
	// Bounded goto: connect.js filters iframe targets, which starves goto's lifecycle
	// watcher on OOPIF-heavy pages. The page still loads; the button poll below waits.
	if (pageUrl) await p.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
	// In-page click (skill idiom); p.click() hangs over connect() in puppeteer 23.
	// Poll from Node (up to 10s) for late-rendering buttons — in-page setTimeout is
	// throttled to 1s in unfocused tabs, so the page can't poll itself.
	const tryClick = () =>
		p.evaluate(
			(sel, textRe) => {
				const el = sel
					? document.querySelector(sel)
					: Array.from(document.querySelectorAll('button, a, [role="button"]')).find((e) =>
							new RegExp(textRe, "i").test(e.textContent),
						);
				if (el) el.click();
				return !!el;
			},
			selector,
			clickText,
		);
	let found = false;
	for (let i = 0; i < 50 && !found; i++) {
		found = await tryClick().catch(() => false);
		if (!found) await new Promise((r) => setTimeout(r, 200));
	}
	if (!found) {
		console.error(`✗ No element matches ${selector ? `selector: ${selector}` : `text: ${clickText}`}`);
		process.exit(1);
	}
	failFast("The click may not be a download trigger, or the element opens a viewer instead.");
} else {
	// Direct download URLs abort navigation by design. Timeout = lifecycle starved
	// by connect.js's iframe filter — treat as "rendered a page" and let failFast decide.
	let aborted = false;
	await p.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 }).catch((e) => {
		aborted = e.message.includes("net::ERR_ABORTED");
	});
	if (!aborted) failFast("The URL rendered a page instead of downloading — try --click / --click-text on that page.");
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

if (outName) {
	const target = join(dir, outName);
	renameSync(file, target); // overwrites an existing file with the same name
	file = target;
}

console.log("✓ Downloaded:", file);

// Note: the tab is deliberately left on whatever page the download came from
// (no about:blank reset). Tradeoff: iframe-heavy pages used to slow down the
// NEXT tool's connect, but connect.js's targetFilter now ignores iframes, so
// resetting isn't worth losing the page state (pagination position, SPA state).
await b.disconnect();
process.exit(0);
