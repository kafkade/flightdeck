// @ts-check
const { test: base, expect, chromium } = require("@playwright/test");
const path = require("path");

const extensionPath = path.resolve(__dirname, "..", "..", "src");

// Custom fixture that launches a persistent browser context with the extension loaded.
const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = path.resolve(
      __dirname,
      "..",
      "..",
      "test-results",
      "user-data-" + Date.now()
    );
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--no-first-run",
        "--disable-search-engine-choice-screen"
      ]
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let sw;
    if (context.serviceWorkers().length > 0) {
      sw = context.serviceWorkers()[0];
    } else {
      sw = await context.waitForEvent("serviceworker", { timeout: 15_000 });
    }
    const extId = sw.url().split("/")[2];
    await use(extId);
  }
});

// ---------------------------------------------------------------------------
// 1. Extension loads without errors
// ---------------------------------------------------------------------------
test("extension loads and service worker is registered", async ({ context, extensionId }) => {
  expect(extensionId).toBeTruthy();
  expect(extensionId.length).toBeGreaterThan(0);

  const sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  expect(sw).toBeTruthy();

  const name = await sw.evaluate(() => chrome.runtime.getManifest().name);
  expect(name).toBe("FlightDeck");
});

// ---------------------------------------------------------------------------
// 2. Popup renders
// ---------------------------------------------------------------------------
test("popup renders with title and toggle", async ({ context, extensionId }) => {
  const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
  const page = await context.newPage();
  await page.goto(popupUrl, { waitUntil: "domcontentloaded" });

  await expect(page.locator("h1.title")).toContainText("FlightDeck");

  const toggles = page.locator("label.toggle");
  await expect(toggles.first()).toBeVisible();

  await page.close();
});

// ---------------------------------------------------------------------------
// 3. Toggle enables DNR rule
// ---------------------------------------------------------------------------
test("toggling a preset registers a DNR rule", async ({ context, extensionId }) => {
  const sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  expect(sw).toBeTruthy();

  const rulesBefore = await sw.evaluate(() =>
    chrome.declarativeNetRequest.getDynamicRules()
  );
  expect(rulesBefore.length).toBe(0);

  // Toggle the "example-debug" preset on
  await sw.evaluate(() =>
    new Promise((resolve) => {
      FlightDeckStorage.toggleRule("example-debug", true).then((state) => {
        const dnrRules = FlightDeckRules.compileRules(state);
        const existingP = chrome.declarativeNetRequest.getDynamicRules();
        existingP.then((existing) => {
          chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: existing.map((r) => r.id),
            addRules: dnrRules
          }).then(resolve);
        });
      });
    })
  );

  const rulesAfter = await sw.evaluate(() =>
    chrome.declarativeNetRequest.getDynamicRules()
  );
  expect(rulesAfter.length).toBeGreaterThan(0);

  const rule = rulesAfter[0];
  expect(rule.condition.urlFilter).toContain("example.com");
  expect(rule.action.redirect.transform.queryTransform.addOrReplaceParams).toEqual(
    expect.arrayContaining([expect.objectContaining({ key: "debug", value: "true" })])
  );

  // Clean up
  await sw.evaluate(() =>
    FlightDeckStorage.toggleRule("example-debug", false).then((state) => {
      const dnrRules = FlightDeckRules.compileRules(state);
      return chrome.declarativeNetRequest.getDynamicRules().then((existing) =>
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existing.map((r) => r.id),
          addRules: dnrRules
        })
      );
    })
  );
});

// ---------------------------------------------------------------------------
// 4. Mutual exclusion — enabling production disables staging
// ---------------------------------------------------------------------------
test("mutual exclusion: enabling production disables staging", async ({ context, extensionId }) => {
  const sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  expect(sw).toBeTruthy();

  const stateAfterStaging = await sw.evaluate(() =>
    FlightDeckStorage.toggleRule("example-staging", true)
  );
  const staging = stateAfterStaging.presets.find((p) => p.id === "example-staging");
  expect(staging.enabled).toBe(true);

  const stateAfterProd = await sw.evaluate(() =>
    FlightDeckStorage.toggleRule("example-production", true)
  );
  const stagingAfter = stateAfterProd.presets.find((p) => p.id === "example-staging");
  const prodAfter = stateAfterProd.presets.find((p) => p.id === "example-production");

  expect(stagingAfter.enabled).toBe(false);
  expect(prodAfter.enabled).toBe(true);

  // Clean up
  await sw.evaluate(() => FlightDeckStorage.toggleRule("example-production", false));
});

// ---------------------------------------------------------------------------
// 5. Unrelated domains are untouched
// ---------------------------------------------------------------------------
test("unrelated domains do not get query params appended", async ({ context, extensionId }) => {
  const sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  expect(sw).toBeTruthy();

  // Enable a preset targeting example.com
  await sw.evaluate(() =>
    FlightDeckStorage.toggleRule("example-debug", true).then((state) => {
      const dnrRules = FlightDeckRules.compileRules(state);
      return chrome.declarativeNetRequest.getDynamicRules().then((existing) =>
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existing.map((r) => r.id),
          addRules: dnrRules
        })
      );
    })
  );

  // Navigate to an unrelated domain
  const page = await context.newPage();
  await page.goto("https://httpbin.org/get", { waitUntil: "domcontentloaded", timeout: 15_000 });

  const url = new URL(page.url());
  expect(url.searchParams.has("debug")).toBe(false);

  await page.close();

  // Clean up
  await sw.evaluate(() =>
    FlightDeckStorage.toggleRule("example-debug", false).then((state) => {
      const dnrRules = FlightDeckRules.compileRules(state);
      return chrome.declarativeNetRequest.getDynamicRules().then((existing) =>
        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existing.map((r) => r.id),
          addRules: dnrRules
        })
      );
    })
  );
});

// ---------------------------------------------------------------------------
// 6. Param NOT appended when preset is inactive
// ---------------------------------------------------------------------------
test("param is not appended when preset is inactive", async ({ context, extensionId }) => {
  const sw = context.serviceWorkers().find((w) => w.url().includes(extensionId));
  expect(sw).toBeTruthy();

  const rules = await sw.evaluate(() =>
    chrome.declarativeNetRequest.getDynamicRules()
  );
  expect(rules.length).toBe(0);

  const page = await context.newPage();

  let capturedUrl = null;
  await page.route("**/example.com/**", (route) => {
    capturedUrl = route.request().url();
    route.abort();
  });

  await page.goto("https://example.com/test-inactive", { waitUntil: "commit", timeout: 10_000 }).catch(() => {});

  if (capturedUrl) {
    const url = new URL(capturedUrl);
    expect(url.searchParams.has("debug")).toBe(false);
  }

  await page.close();
});
