const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const {
  charDifference,
  nameToFolder,
  getMockDir,
  getFallbackDir,
  clearNulls,
  processURL,
  getHeaders,
  countFilesInDirectory,
  getTestByName,
} = require("./common-utils");
const { FtJSON } = require("./json-utils");
const Logger = require("./log-utils");

let logger = null;

const getDefaultMockDataFromConfig = (testConfig) => {
  const defaultPath = path.join(
    getMockDir(testConfig),
    "defaultMocks",
    "_mock_list.json"
  );

  try {
    const defaultData = fs.readFileSync(defaultPath, "utf8");
    let parsedData = JSON.parse(defaultData);

    // Read and attach mock data for each entry in parsedData
    parsedData.forEach((entry) => {
      const mockFilePath = path.join(
        getMockDir(testConfig),
        "defaultMocks",
        `mock_${entry.id}.json`
      );
      try {
        const mockData = fs.readFileSync(mockFilePath, "utf8");
        entry.fileContent = JSON.parse(mockData);
      } catch (error) {
        console.error(`Error reading mock data for ${entry.id}:`, error);
        return entry; // Return the original entry if there's an error
      }
    });
    return parsedData;
  } catch (error) {
    console.error(`Error reading or parsing default mocks:`, error);
    return [];
  }
};

// src/index.js
const loadMockDataFromConfig = (testConfig, _testName) => {
  try {
    let testName = _testName;
    if (!testName) {
      // Read the test ID from mockServer.config.json
      const configPath = path.join(
        getMockDir(testConfig),
        "mockServer.config.json"
      );
      const configData = fs.readFileSync(configPath, "utf8");
      const config = JSON.parse(configData);
      testName = config.testName;
    }
    // Read the tests from testConfig
    const mocksPath = path.join(
      getMockDir(testConfig),
      `test_${nameToFolder(testName)}`,
      "_mock_list.json"
    );
    const mocksData = fs.readFileSync(mocksPath, "utf8");
    const mocks = JSON.parse(mocksData);

    mocks.forEach((mock) => {
      const fileContent = JSON.parse(
        fs.readFileSync(
          path.join(
            getMockDir(testConfig),
            `test_${nameToFolder(testName)}`,
            `mock_${mock.id}.json`
          ),
          "utf8"
        )
      );
      mock.fileContent = fileContent;
    });

    return mocks;
  } catch (error) {
    console.error("Error loading test data:", error.message);
    return [];
  }
};

const isSameRequest = (req1, req2) => {
  clearNulls(req1.postData);
  clearNulls(req2.postData);
  let matched = true;
  if (req1.url !== req2.url) {
    matched = false;
  } else if (req1.method?.toLowerCase() !== req2.method?.toLowerCase()) {
    matched = false;
  } else if (
    (!req1.postData && req2.postData) ||
    (req1.postData && !req2.postData)
  ) {
    matched = FtJSON.areJsonEqual(req1.postData || {}, req2.postData || {});
  } else if (
    req1.postData &&
    req2.postData &&
    !FtJSON.areJsonEqual(req1.postData, req2.postData)
  ) {
    matched = false;
  }
  return matched;
};

const getSameRequestRank = (req1, req2) => {
  let rank = 1;
  clearNulls(req1.postData);
  clearNulls(req2.postData);
  // Compare path names
  const url1 = new URL(`http://domain.com${req1.url}`);
  const url2 = new URL(`http://domain.com${req2.url}`);
  if (url1.pathname !== url2.pathname) {
    rank = 0;
  } else if (url1.method?.toLowerCase() !== url2.method?.toLowerCase()) {
    rank = 0;
  } else {
    // Compare query strings
    const queryDiff = charDifference(url1.search || "", url2.search || "");
    rank = rank + queryDiff;
    // Compare post data
    const charDiff = charDifference(
      FtJSON.stringify(req1.postData || {}),
      FtJSON.stringify(req2.postData || {})
    );
    rank = rank + charDiff;
  }
  return rank;
};

function compareMockToRequest(mock, req) {
  const mockURL = processURL(
    mock.fileContent.url,
    mock.fileContent.ignoreParams
  );
  const reqURL = processURL(req.originalUrl, mock.fileContent.ignoreParams);
  const postData = mock.fileContent.request?.postData?.text
    ? FtJSON.parse(mock.fileContent.request?.postData?.text)
    : mock.fileContent.request?.postData;
  return isSameRequest(
    { url: mockURL, method: mock.fileContent.method, postData },
    {
      method: req.method,
      postData: req.body,
      url: reqURL,
    }
  );
}

function compareMockToFetchRequest(mock, fetchReq) {
  try {
    const mockURL = processURL(
      mock.fileContent.url,
      mock.fileContent.ignoreParams
    );
    const reqURL = processURL(fetchReq.url, mock.fileContent.ignoreParams);
    const postData = mock.fileContent.request?.postData?.text
      ? FtJSON.parse(mock.fileContent.request?.postData?.text)
      : mock.fileContent.request?.postData;
    return isSameRequest(
      { url: mockURL, method: mock.fileContent.method, postData },
      {
        method: fetchReq.options.method || "GET",
        postData: fetchReq.options.body?.length
          ? FtJSON.parse(fetchReq.options.body)
          : fetchReq.options.body,
        url: reqURL,
      }
    );
  } catch (e) {
    console.error("error at compareMockToFetchRequest", mock, fetchReq);
    console.error(e);
  }
  return false;
}

function getCompareRankMockToFetchRequest(mock, fetchReq) {
  try {
    const mockURL = processURL(
      mock.fileContent.url,
      mock.fileContent.ignoreParams
    );
    const reqURL = processURL(fetchReq.url, mock.fileContent.ignoreParams);
    const postData = mock.fileContent.request?.postData?.text
      ? FtJSON.parse(mock.fileContent.request?.postData?.text)
      : mock.fileContent.request?.postData;
    return getSameRequestRank(
      { url: mockURL, method: mock.fileContent.method, postData },
      {
        method: fetchReq.options.method || "GET",
        postData: fetchReq.options.body?.length
          ? FtJSON.parse(fetchReq.options.body)
          : fetchReq.options.body,
        url: reqURL,
      }
    );
  } catch (e) {
    console.error("error at getCompareRankMockToFetchRequest", mock, fetchReq);
    console.error(e);
  }
  return false;
}

function getMatchingMockData({
  testMockData,
  defaultMockData,
  url,
  options,
  testConfig,
  testName,
  mode,
}) {
  let served = false;
  let matchedMocks =
    testMockData?.filter((mock) => {
      if (mock.fileContent.waitForPrevious && !served) {
        return false;
      }
      served = mock.fileContent.served;
      return compareMockToFetchRequest(mock, { url, options });
    }) || [];
  let foundMock = matchedMocks.find((mock) => !mock.fileContent.served)
    ? matchedMocks.find((mock) => !mock.fileContent.served)
    : matchedMocks[matchedMocks.length - 1];

  if (!foundMock) {
    foundMock = defaultMockData.find((tm) =>
      compareMockToFetchRequest(tm, {
        url,
        options,
      })
    );
  }

  if (!foundMock && mode !== "strict") {
    const mockRanks = {};
    testMockData.forEach((tm) => {
      const rank = getCompareRankMockToFetchRequest(tm, {
        url,
        options,
      });
      if (rank > 0) {
        mockRanks[tm.id] = rank;
      }
    });
    defaultMockData.forEach((tm) => {
      const rank = getCompareRankMockToFetchRequest(tm, {
        url,
        options,
      });
      if (rank > 0) {
        mockRanks[tm.id] = rank;
      }
    });
    // Sort by rank to find the best match
    const sortedRanks = Object.entries(mockRanks).sort((a, b) => a[1] - b[1]);
    if (sortedRanks.length > 0) {
      const bestMockId = sortedRanks?.[0]?.[0];
      if (bestMockId) {
        foundMock = [...testMockData, ...defaultMockData].find(
          (mock) => mock.id === bestMockId
        );
      }
    }
  }
  // updating stats to mock file
  if (foundMock) {
    let mockFilePath = path.join(
      getMockDir(testConfig),
      `test_${nameToFolder(testName)}`,
      `mock_${foundMock.id}.json`
    );
    if (!fs.existsSync(mockFilePath)) {
      mockFilePath = path.join(
        getMockDir(testConfig),
        "defaultMocks",
        `mock_${foundMock.id}.json`
      );
    }
    foundMock.fileContent.served = true;
    fs.writeFileSync(
      mockFilePath,
      JSON.stringify(foundMock.fileContent, null, 2)
    );
  }
  return foundMock ? foundMock.fileContent : null;
}

async function resetAllMockStats({ testMockData, testConfig, testName }) {
  for (let i = 0; i < testMockData.length; i++) {
    const tmd = testMockData[i];
    const mockFilePath = path.join(
      getMockDir(testConfig),
      `test_${nameToFolder(testName)}`,
      `mock_${tmd.id}.json`
    );
    tmd.fileContent.served = false;
    await fs.writeFileSync(
      mockFilePath,
      JSON.stringify(tmd.fileContent, null, 2)
    );
  }
}

async function initiatePlaywrightRoutes(
  page,
  ftmocksConifg,
  testName,
  mockPath = "**/*",
  excludeMockPath = null
) {
  logger = new Logger({disableLogs: ftmocksConifg.DISABLE_LOGS}, ftmocksConifg, testName);
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

async function initiateJestFetch(jest, ftmocksConifg, testName) {
  const testMockData = testName
    ? loadMockDataFromConfig(ftmocksConifg, testName)
    : [];
  resetAllMockStats({ testMockData, testConfig: ftmocksConifg, testName });
  const defaultMockData = getDefaultMockDataFromConfig(ftmocksConifg);
  console.debug("calling initiateJestFetch fetch");
  global.fetch = jest.fn((url, options = {}) => {
    console.debug("got fetch request", url, options);
    let mockData = getMatchingMockData({
      testMockData,
      defaultMockData,
      url,
      options,
      testConfig: ftmocksConifg,
      testName,
    });
    if (mockData) {
      console.debug("mocked", url, options);
    } else {
      console.debug("missing mock data", url, options);
      return Promise.resolve({
        status: 404,
        headers: new Map([["Content-Type", "application/json"]]),
        json: () => Promise.resolve({ error: "Mock data not found" }),
      });
    }

    const { content, headers, status } = mockData.response;

    return Promise.resolve({
      status,
      headers: new Map(Object.entries(headers)),
      json: () => Promise.resolve(FtJSON.parse(content)),
    });
  });

  console.debug("calling XMLHttpRequest fetch");
  global.XMLHttpRequest = jest.fn(function () {
    const xhrMock = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
      getAllResponseHeaders: jest.fn(() => {
        return "";
      }),
      getResponseHeader: jest.fn((header) => {
        return null;
      }),
      readyState: 4,
      status: 0,
      response: null,
      responseText: "",
      headers: new Map(Object.entries(headers)),
      onreadystatechange: null,
      onload: null,
      onerror: null,
    };

    xhrMock.send.mockImplementation(function () {
      const mockData = getMatchingMockData({
        testMockData,
        defaultMockData,
        url: xhrMock._url,
        options: xhrMock._options,
        testConfig: ftmocksConifg,
        testName,
      });

      if (mockData) {
        console.debug("mocked", xhrMock._url, xhrMock._options);
        const { content, headers, status } = mockData.response;

        xhrMock.status = status;
        xhrMock.responseText = content;
        xhrMock.response = content;
        xhrMock.headers = new Map(Object.entries(headers));

        if (xhrMock.onreadystatechange) {
          xhrMock.onreadystatechange();
        }
        if (xhrMock.onload) {
          xhrMock.onload();
        }
      } else {
        console.debug("missing mock data", xhrMock._url, xhrMock._options);

        xhrMock.status = 404;
        xhrMock.responseText = JSON.stringify({ error: "Mock data not found" });
        xhrMock.response = xhrMock.responseText;

        if (xhrMock.onreadystatechange) {
          xhrMock.onreadystatechange();
        }
        if (xhrMock.onerror) {
          xhrMock.onerror();
        }
      }
    });

    xhrMock.open.mockImplementation(function (method, url) {
      xhrMock._options = { method };
      xhrMock._url = url;
    });

    return xhrMock;
  });

  return;
}

function initiateConsoleLogs(jest, ftmocksConifg, testName) {
  const logsFile = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    "_logs.json"
  );
  let logs = [];
  if (!fs.existsSync(logsFile)) {
    fs.appendFileSync(logsFile, "[]", "utf8");
  } else {
    fs.writeFileSync(logsFile, "[]", "utf8");
  }

  const writeToFile = (type, params) => {
    const logMessage = params.join(" ") + "\n"; // Combine params into a string with spaces
    logs.push({
      type,
      message: logMessage,
      time: Date.now(),
    });
    fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2), "utf8"); // Append the log message to the file
  };

  global.console = {
    ...console,
    // uncomment to ignore a specific log level
    log: jest.fn((...params) => {
      writeToFile("log", params);
    }),
    debug: jest.fn((...params) => {
      writeToFile("debug", params);
    }),
    info: jest.fn((...params) => {
      writeToFile("info", params);
    }),
    warn: jest.fn((...params) => {
      writeToFile("warn", params);
    }),
    error: jest.fn((...params) => {
      writeToFile("error", params);
    }),
  };
}

const saveSnap = async (html, ftmocksConifg, testName) => {
  const snapFolder = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    "_snaps"
  );
  const snapTemplate = path.join(
    getMockDir(ftmocksConifg),
    "snap_template.html"
  );

  if (!fs.existsSync(snapFolder)) {
    fs.mkdirSync(snapFolder);
  }
  const fileCount = await countFilesInDirectory(snapFolder);
  const snapFilePath = path.join(snapFolder, `snap_${fileCount + 1}.html`);
  let resHtml = html;
  if (fs.existsSync(snapFolder)) {
    const templateHtml = fs.readFileSync(snapTemplate, "utf8");
    resHtml = templateHtml.replace(
      "<!--FtMocks-Snap-Template-To-Be-Replaced-->",
      html
    );
  }
  fs.writeFileSync(snapFilePath, resHtml);
};

const deleteAllSnaps = async (ftmocksConifg, testName) => {
  const snapFolder = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    "_snaps"
  );
  fs.rmSync(snapFolder, { recursive: true, force: true });
};

const deleteAllLogs = async (ftmocksConifg, testName) => {
  const mockDir = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`
  );
  const logFilePath = path.join(mockDir, `_logs.json`);
  fs.rmSync(logFilePath, { recursive: true, force: true });
};

function initiateJestEventSnaps(jest, ftmocksConifg, testName) {
  const mouseEvents = ftmocksConifg.snapEvents || [
    "click",
    "change",
    "url",
    "dblclick",
    "contextmenu",
  ];
  mouseEvents.forEach((event) => {
    jest
      .spyOn(document, "addEventListener")
      .mockImplementation((e, callback) => {
        if (mouseEvents.includes(e)) {
          saveSnap(document.outerHTML, ftmocksConifg, testName);
        }
      });
  });
}

const createTest = async (ftmocksConifg, testName) => {
  const testsPath = path.join(getMockDir(ftmocksConifg), "tests.json");
  let tests = [];
  try {
    // Read existing tests
    const testsData = fs.readFileSync(testsPath, "utf8");
    tests = JSON.parse(testsData);
    const etest = tests.find((tst) => tst.name === testName);
    if (!etest) {
      const newTest = {
        id: uuidv4(),
        name: testName,
      };
      tests.push(newTest);
      fs.writeFileSync(testsPath, JSON.stringify(tests, null, 2));
      const folderPath = path.join(
        getMockDir(ftmocksConifg),
        `test_${nameToFolder(testName)}`
      );
      const mockListFilePath = path.join(folderPath, "_mock_list.json");
      fs.mkdir(folderPath, { recursive: true }, (err) => {
        if (err) {
          console.error("\x1b[31mError creating directory:\x1b[0m", err);
        } else {
          console.log("\x1b[32mDirectory created successfully!\x1b[0m");
        }
      });
      await fs.appendFile(mockListFilePath, "[]", () => {
        console.log("\x1b[32mmock list file created successfully\x1b[0m");
      });

      return newTest;
    } else {
      throw "Test already exists";
    }
  } catch (error) {
    console.error(`\x1b[31mError reading tests.json:\x1b[0m`, error);
    return null;
  }
};

const isSameResponse = (req1, req2) => {
  try {
    let matched = true;
    if (req1.response.status !== req2.response.status) {
      matched = false;
      // console.log('not matched at url', req1.method, req2.method);
    } else if (
      (!req1.response.content && req2.response.content) ||
      (req1.response.content && !req2.response.content)
    ) {
      matched = FtJSON.areJsonEqual(
        FtJSON.parse(req1.response.content) || {},
        FtJSON.parse(req2.response.content) || {}
      );
      // console.log('not matched at post Data 0', req1.postData, req2.postData);
    } else if (
      req1.response.content &&
      req2.response.content &&
      !FtJSON.areJsonEqual(
        FtJSON.parse(req1.response.content) || {},
        FtJSON.parse(req2.response.content) || {}
      )
    ) {
      matched = false;
    }
    // if (matched) {
    //   console.log('matched responses', req1, req2);
    // }
    return matched;
  } catch (error) {
    console.error(error);
    return false;
  }
};

const compareMockToMock = (mock1, mock2, matchResponse) => {
  try {
    if (matchResponse) {
      return isSameRequest(mock1, mock2) && isSameResponse(mock1, mock2);
    } else {
      return isSameRequest(mock1, mock2);
    }
  } catch (error) {
    console.error(error);
    return false;
  }
};

const saveIfItIsFile = async (route, testName, ftmocksConifg) => {
  const urlObj = new URL(route.request().url());

  // Check if URL contains file extension like .js, .png, .css etc
  const fileExtMatch = urlObj.pathname.match(/\.[a-zA-Z0-9]+$/);
  if (fileExtMatch) {
    const fileExt = fileExtMatch[0];
    // Create directory path matching URL structure
    const dirPath = path.join(
      getMockDir(ftmocksConifg),
      `test_${nameToFolder(testName)}`,
      "_files",
      path.dirname(urlObj.pathname)
    );

    // Create directories if they don't exist
    fs.mkdirSync(dirPath, { recursive: true });

    // Save file with original name
    const fileName = path.basename(urlObj.pathname);
    const filePath = path.join(dirPath, fileName);

    const response = await route.fetch();
    const buffer = await response.body();
    fs.writeFileSync(filePath, buffer);

    await route.continue();
    return true;
  }
  return false;
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
    try {
      const urlObj = new URL(route.request().url());
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

      if (await saveIfItIsFile(route, config.testName, ftmocksConifg)) {
        return;
      }

      const mockData = {
        url: urlObj.pathname + urlObj.search,
        time: new Date().toString(),
        method: route.request().method(),
        request: {
          headers: await route.request().headers(),
          queryString: Array.from(urlObj.searchParams.entries()).map(
            ([name, value]) => ({
              name,
              value,
            })
          ),
          postData: route.request().postData()
            ? {
                mimeType: "application/json",
                text: route.request().postData(),
              }
            : null,
        },
        response: {
          status: (await route.fetch()).status(),
          headers: (await route.fetch()).headers(),
          content: await (await route.fetch()).text(),
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
      await route.continue();
    } catch (error) {
      console.error(error);
      await route.continue();
    }
  });
}

// Export functions as a module
module.exports = {
  getTestByName,
  compareMockToRequest,
  processURL,
  isSameRequest,
  loadMockDataFromConfig,
  getDefaultMockDataFromConfig,
  nameToFolder,
  compareMockToFetchRequest,
  getMatchingMockData,
  resetAllMockStats,
  initiateJestFetch,
  saveSnap,
  deleteAllSnaps,
  deleteAllLogs,
  initiateConsoleLogs,
  initiatePlaywrightRoutes,
  initiateJestEventSnaps,
  recordPlaywrightRoutes,
};
