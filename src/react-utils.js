const { getMatchingMockData } = require("./match-utils");
const { loadMockDataFromConfig } = require("./mock-utils");
const { resetAllMockStats } = require("./mock-utils");
const { getDefaultMockDataFromConfig } = require("./mock-utils");
const { FtJSON } = require("./json-utils");
const { getMockDir, nameToFolder } = require("./common-utils");
const { saveSnap } = require("./snap-utils");
const path = require("path");
const fs = require("fs");

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

module.exports = {
  initiateJestFetch,
  initiateConsoleLogs,
  initiateJestEventSnaps,
};
