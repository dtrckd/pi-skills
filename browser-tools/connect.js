import puppeteer from "puppeteer-core";

export const PORT = process.env.BROWSER_TOOLS_PORT || "9222";
const TIMEOUT = Number(process.env.BROWSER_TOOLS_TIMEOUT || 15000);

// Shared connect: connect init waits for every page AND iframe target to attach,
// so iframe-heavy pages (payment portals, ad embeds) can stall it for many seconds.
// The targetFilter keeps only real tabs, which makes connect fast regardless of
// what the current page embeds.
export async function connect() {
	try {
		return await Promise.race([
			puppeteer.connect({
				browserURL: `http://localhost:${PORT}`,
				defaultViewport: null,
				// "tab" parents each "page" in modern Chrome and "browser" is the root; both required
				targetFilter: (t) => ["page", "tab", "browser"].includes(t.type()),
			}),
			// unref: don't keep the process alive for the timer after connect succeeds
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error(`timeout after ${TIMEOUT}ms`)), TIMEOUT).unref(),
			),
		]);
	} catch (e) {
		// Distinguish "browser down" from "browser alive but connect slow"
		const alive = await fetch(`http://localhost:${PORT}/json/version`)
			.then((r) => r.ok)
			.catch(() => false);
		console.error("✗ Could not connect to browser:", e.message);
		if (alive) {
			console.error(`  Browser is alive on :${PORT} but connect timed out.`);
			console.error("  Retry, or raise BROWSER_TOOLS_TIMEOUT (ms).");
		} else {
			console.error("  Run: browser-start.js");
		}
		process.exit(1);
	}
}
