# ftmocks-utils

Util functions for FtMocks

## Usage: initiatePlaywrightRoutes

`initiatePlaywrightRoutes` sets up Playwright network route mocks for your tests.

### Example Test

```js
import { test, expect } from "@playwright/test";
import { initiatePlaywrightRoutes } from "ftmocks-utils";

test("Sample test case", async ({ page }) => {
  // Initiate Playwright routes with custom directories and patterns
  await initiatePlaywrightRoutes(
    page,
    {
      MOCK_DIR: "../ftmocks",
      FALLBACK_DIR: "../public",
    },
    "Sample test case",
    "**/*", // Pattern(s) to intercept; you can use a string or array of patterns
  );

  await page.goto("https://example-test.com/");

  // Now your requests will be mocked as per your ftmocks setup
  // Add your test steps and assertions here
});
```

**Parameters**:

- `page`: Playwright page object.
- `options`: Object with configuration. At minimum, provide `MOCK_DIR` (required). `FALLBACK_DIR` is optional.
- `testName`: (string) Name of this test, so ftmocks can find the right mock data.
- `patterns`: (string or array) Glob patterns for requests to intercept.

Make sure your `MOCK_DIR` points to the directory where your FtMocks records are saved.

## Suppressing missing-mock logs (`.logIgnore`)

When a request has no matching mock and the route falls back to the network (or a fallback file), ftmocks-utils logs a debug message such as **missing mock data, falling back** (Playwright) or **missing mock data** (Jest). Playwright also logs **response is a file, serving file** when a mock response is served from a file on disk. Some URLs are expected to be noisy (analytics, health checks, static bundles, etc.) and do not need those messages in the logs.

Add a `.logIgnore` file in your `MOCK_DIR` with one URL regex pattern per line. If an incoming URL matches any pattern, these debug logs are skipped for that request:

- **missing mock data, falling back** (Playwright) / **missing mock data** (Jest)
- **response is a file, serving file** (Playwright)

Static asset URLs (`.js`, `.css`, images, fonts, etc.) are already suppressed for the missing-mock messages and do not need to be listed.

**Example** (`MOCK_DIR/.logIgnore`):

```text
# Analytics and telemetry
https://.*\.google-analytics\.com/.*
https://.*\.segment\.io/.*

# Expected unmocked API calls
/api/health
^wss?://.*/socket
```

- Lines starting with `#` and blank lines are ignored.
- Each non-comment line is compiled as a JavaScript `RegExp` and tested against the full request URL.
- Invalid regex lines are skipped with a console warning.

See more API documentation at [ftmocks.com](https://ftmocks.com) or in the main FtMocks repository.

## Usage: recordPlaywrightRoutes

`recordPlaywrightRoutes` allows you to record network requests and responses from a Playwright test session and save them as FtMocks mocks. This is useful for setting up new mocks or updating existing ones with actual traffic.

### Example Usage

```js
import { test } from "@playwright/test";
import { recordPlaywrightRoutes } from "ftmocks-utils";

test("Record API interactions", async ({ page }) => {
  await recordPlaywrightRoutes(
    page,
    {
      MOCK_DIR: "../ftmocks",
      FALLBACK_DIR: "../public",
    },
    {
      testName: "Recorded test",
      mockPath: "**/*", // Intercept all requests by default
      pattern: "^/api/.*", // Only record requests matching this regex pattern (e.g., API endpoints)
      avoidDuplicatesInTheTest: true, // Skip duplicates within a single test recording
      avoidDuplicatesWithDefaultMocks: true, // Skip duplicates with default mocks
    },
  );

  await page.goto("https://your-app-under-test.com/");
  // Interact with your page as needed; API requests will be recorded
});
```

**Parameters**:

- `page`: Playwright page object.
- `ftmocksConifg`: Object, must contain at minimum `MOCK_DIR`. `FALLBACK_DIR` is optional.
- `config`: Object containing recording options:
  - `testName`: (string) Name of the test, used for saving the mock data.
  - `mockPath`: (string|array) Glob pattern(s) for requests to intercept.
  - `pattern`: (string) Regex string; only requests matching this will be recorded.
  - `avoidDuplicatesInTheTest`: (boolean) Skip duplicate entries during this run.
  - `avoidDuplicatesWithDefaultMocks`: (boolean) Skip recording if identical default mocks are present.

After running the test, FtMocks-compatible mock files will be saved to the specified folder for easy reuse.

See more API documentation and advanced usage at [ftmocks.com](https://ftmocks.com).
