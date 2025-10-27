const { getMatchingMockData } = require("./match-utils");
const { getMockDir, nameToFolder, getHeaders } = require("./common-utils");
const { getFallbackDir } = require("./common-utils");
const { getTestByName } = require("./common-utils");
const { compareMockToMock } = require("./compare-utils");
const { loadMockDataFromConfig } = require("./mock-utils");
const { resetAllMockStats } = require("./mock-utils");
const { getDefaultMockDataFromConfig } = require("./mock-utils");
const { Logger } = require("./log-utils");
const { saveIfItIsFile } = require("./file-utils");
const { createTest } = require("./test-utils");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

let logger = null;
const DEFAULT_EXCLUDED_HEADERS =
  "cookie,set-cookie,authorization,www-authenticate";

async function initiatePlaywrightRoutes(
  page,
  ftmocksConifg,
  testName,
  mockPath = "**/*",
  excludeMockPath = null
) {
  logger = new Logger(
    { disableLogs: ftmocksConifg.DISABLE_LOGS },
    ftmocksConifg,
    testName
  );
  const testMockData = testName
    ? loadMockDataFromConfig(ftmocksConifg, testName)
    : [];
  resetAllMockStats({ testMockData, testConfig: ftmocksConifg, testName });
  const test = await getTestByName(ftmocksConifg, testName);
  const defaultMockData = getDefaultMockDataFromConfig(ftmocksConifg);
  logger.debug("\x1b[32mcalling initiatePlaywrightRoutes fetch\x1b[0m");
  let firstUrl = null;
  await page.route(mockPath, async (route, request) => {
    const url = request.url();
    if (!firstUrl) {
      firstUrl = url;
    }
    const options = {
      url,
      method: request.method(),
      body: request.postData(),
    };
    if (excludeMockPath && new RegExp(excludeMockPath).test(url)) {
      await route.fallback();
      return;
    }
    let mockData = getMatchingMockData({
      testMockData,
      defaultMockData,
      url,
      options,
      testConfig: ftmocksConifg,
      testName,
      mode: test.mode || "loose",
    });
    try {
      if (mockData) {
        const { content, headers, status, file } = mockData.response;

        const json = {
          status,
          headers: getHeaders(headers),
          body: content,
        };

        if (file) {
          let filePath = path.join(
            getMockDir(ftmocksConifg),
            `test_${nameToFolder(testName)}`,
            "_files",
            file
          );
          if (!fs.existsSync(filePath)) {
            filePath = path.join(
              getMockDir(ftmocksConifg),
              "defaultMocks",
              "_files",
              file
            );
          }
          if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
            const fileContent = fs.readFileSync(filePath);
            json.body = fileContent;

            console.debug(
              "\x1b[32mresponse is a file, serving file\x1b[0m",
              filePath,
              url
            );
            await route.fulfill(json);
          }
        } else {
          await route.fulfill(json);
        }
      } else {
        const fallbackDir = getFallbackDir(ftmocksConifg);
        if (!fallbackDir) {
          await route.fallback();
          return;
        }
        const urlObj = new URL(route.request().url());
        let filePath = path.join(
          fallbackDir,
          urlObj.pathname === "/" || urlObj.pathname === ""
            ? ftmocksConifg.FALLBACK_DIR_INDEX_FILE || "index.html"
            : urlObj.pathname
        );

        if (
          !fs.existsSync(filePath) &&
          !path.extname(filePath) &&
          url === firstUrl
        ) {
          filePath = path.join(
            fallbackDir,
            ftmocksConifg.FALLBACK_DIR_INDEX_FILE_FOR_STATUS_404 || "index.html"
          );
          logger.debug(
            "\x1b[32mserving file for status 404\x1b[0m",
            filePath,
            url
          );
        }
        if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
          const fileContent = fs.readFileSync(filePath);
          const ext = path.extname(filePath);
          const contentType =
            {
              ".html": "text/html",
              ".htm": "text/html",
              ".xhtml": "application/xhtml+xml",
              ".css": "text/css",
              ".js": "application/javascript",
              ".json": "application/json",
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".svg": "image/svg+xml",
              ".ico": "image/x-icon",
              ".webp": "image/webp",
              ".mp4": "video/mp4",
              ".mp3": "audio/mpeg",
              ".wav": "audio/wav",
              ".ogg": "audio/ogg",
              ".pdf": "application/pdf",
              ".doc": "application/msword",
              ".docx":
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ".xls": "application/vnd.ms-excel",
              ".xlsx":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ".ppt": "application/vnd.ms-powerpoint",
              ".pptx":
                "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              ".zip": "application/zip",
              ".rar": "application/x-rar-compressed",
              ".7z": "application/x-7z-compressed",
              ".tar": "application/x-tar",
              ".gz": "application/gzip",
              ".bz2": "application/x-bzip2",
              ".xz": "application/x-xz",
              ".exe": "application/x-msdownload",
              ".dll": "application/x-msdownload",
              ".so": "application/x-sharedlib",
              ".dylib": "application/x-dynamiclib",
              ".bin": "application/octet-stream",
              ".txt": "text/plain",
              ".csv": "text/csv",
              ".tsv": "text/tab-separated-values",
              ".xml": "application/xml",
              ".xsl": "application/xml",
              ".xslt": "application/xml",
              ".xlt": "application/xml",
              ".xltx": "application/xml",
              ".xltm": "application/xml",
              ".yaml": "text/yaml",
              ".yml": "text/yaml",
              ".toml": "text/toml",
              ".php": "application/x-httpd-php",
            }[ext] || "application/octet-stream";

          logger.info("\x1b[32mserving file\x1b[0m", filePath);
          await route.fulfill({
            body: fileContent,
            headers: { "Content-Type": contentType },
          });
        } else {
          logger.debug("\x1b[31mmissing mock data, falling back\x1b[0m", url);
          await route.fallback();
        }
      }
    } catch (e) {
      logger.error(e);
      logger.error(
        "\x1b[31merror at initiatePlaywrightRoutes\x1b[0m",
        url,
        options
      );
    }
  });
}

const excludeHeaders = (headers, ftmocksConifg) => {
  const excludedHeaders =
    ftmocksConifg.EXCLUDED_HEADERS || DEFAULT_EXCLUDED_HEADERS;
  if (!excludedHeaders) {
    return headers;
  }
  excludedHeaders.split(",").forEach((header) => {
    Object.keys(headers).forEach((key) => {
      if (key.toLowerCase() === header.toLowerCase()) {
        delete headers[key];
      }
    });
  });
  return headers;
};

async function recordPlaywrightRoutes(
  page,
  ftmocksConifg,
  config = {
    testName,
    mockPath: "**/*",
    pattern: "^/api/.*",
    avoidDuplicatesInTheTest: false,
    avoidDuplicatesWithDefaultMocks: false,
  }
) {
  await page.route(config.mockPath, async (route) => {
    const currentRequest = route.request();
    let response = null;
    try {
      const urlObj = new URL(currentRequest.url());
      if (config.pattern && config.pattern.length > 0) {
        const patternRegex = new RegExp(config.pattern);
        if (!patternRegex.test(urlObj.pathname)) {
          await route.continue();
          return;
        }
      }

      const test = await getTestByName(ftmocksConifg, config.testName);
      if (!test) {
        await createTest(ftmocksConifg, config.testName);
      }

      response = await route.fetch();

      const fileName = await saveIfItIsFile(
        currentRequest,
        response,
        config.testName,
        ftmocksConifg
      );

      const mockData = {
        url: urlObj.pathname + urlObj.search,
        time: new Date().toString(),
        method: currentRequest.method(),
        request: {
          headers: excludeHeaders(
            await currentRequest.headers(),
            ftmocksConifg
          ),
          queryString: Array.from(urlObj.searchParams.entries()).map(
            ([name, value]) => ({
              name,
              value,
            })
          ),
          postData: currentRequest.postData()
            ? {
                mimeType: "application/json",
                text: currentRequest.postData(),
              }
            : null,
        },
        response: {
          file: fileName,
          status: response.status(),
          headers: response.headers(),
          content: fileName ? null : await response.text(),
        },
        id: crypto.randomUUID(),
        served: false,
        ignoreParams: ftmocksConifg.ignoreParams || [],
      };

      await createTest(ftmocksConifg, config.testName);
      if (config.avoidDuplicatesInTheTest) {
        // Check if the mock data is a duplicate of a mock data in the test
        const testMockList = loadMockDataFromConfig(
          ftmocksConifg,
          config.testName
        );
        const matchResponse = testMockList.find((mock) =>
          compareMockToMock(mock.fileContent, mockData, true)
        );
        if (matchResponse) {
          console.log("Aborting duplicate mock data in the test");
          await route.continue();
          return;
        }
      }

      if (config.avoidDuplicatesWithDefaultMocks) {
        // Check if the mock data is a duplicate of a mock data in the test
        const defaultMockList = getDefaultMockDataFromConfig(ftmocksConifg);
        const matchResponse = defaultMockList.find((mock) =>
          compareMockToMock(mock.fileContent, mockData, true)
        );
        if (matchResponse) {
          console.log("Aborting duplicate mock data with default mocks");
          await route.continue();
          return;
        }
      }

      // Save the mock data to the test
      const mockListPath = path.join(
        getMockDir(ftmocksConifg),
        `test_${nameToFolder(config.testName)}`,
        "_mock_list.json"
      );
      let mockList = [];
      if (fs.existsSync(mockListPath)) {
        mockList = JSON.parse(fs.readFileSync(mockListPath, "utf8"));
      }
      mockList.push({
        id: mockData.id,
        url: mockData.url,
        method: mockData.method,
        time: mockData.time,
      });

      // Create test directory if it doesn't exist
      const testDir = path.join(
        getMockDir(ftmocksConifg),
        `test_${nameToFolder(config.testName)}`
      );
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      fs.writeFileSync(mockListPath, JSON.stringify(mockList, null, 2));
      const mocDataPath = path.join(
        getMockDir(ftmocksConifg),
        `test_${nameToFolder(config.testName)}`,
        `mock_${mockData.id}.json`
      );
      fs.writeFileSync(mocDataPath, JSON.stringify(mockData, null, 2));
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body: await response.body(),
      });
    } catch (error) {
      console.error(error);
      if (!response) {
        await route.continue();
      } else {
        await route.fulfill({
          status: response.status(),
          headers: response.headers(),
          body: await response.body(),
        });
      }
    }
  });
}

module.exports = {
  initiatePlaywrightRoutes,
  recordPlaywrightRoutes,
};
