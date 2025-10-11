const path = require("path");
const fs = require("fs");
const { FtJSON } = require("./json-utils");

const charDifference = (str1, str2) => {
  if (str1 && str2) {
    let count1 = {};
    let count2 = {};

    for (let ch of str1) count1[ch] = (count1[ch] || 0) + 1;
    for (let ch of str2) count2[ch] = (count2[ch] || 0) + 1;

    let diff = 0;
    let chars = new Set([...Object.keys(count1), ...Object.keys(count2)]);

    for (let ch of chars) {
      diff += Math.abs((count1[ch] || 0) - (count2[ch] || 0));
    }

    return diff;
  } else {
    if (!str1 && str2) {
      return str2.length;
    } else if (str1 && !str2) {
      return str1.length;
    }
    return 0;
  }
};

const nameToFolder = (name) => {
  return name.replaceAll(" ", "_");
};

const getMockDir = (config) => {
  if (!path.isAbsolute(config.MOCK_DIR)) {
    return path.resolve(process.cwd(), config.MOCK_DIR);
  }
  return config.MOCK_DIR;
};

const getFallbackDir = (config) => {
  if (config.FALLBACK_DIR && !path.isAbsolute(config.FALLBACK_DIR)) {
    return path.resolve(process.cwd(), config.FALLBACK_DIR);
  }
  return config.FALLBACK_DIR;
};

const capitalizeHeader = (header) => {
  return header
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("-");
};

const capitalizeHeaders = (headers) => {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      capitalizeHeader(key),
      value,
    ])
  );
};

const clearNulls = (postData) => {
  Object.keys(postData || {}).forEach((key) => {
    if (postData[key] === null) {
      delete postData[key];
    }
  });
};

const processURL = (url, ignoreParams = []) => {
  // Remove the hostname from the URL
  const urlWithoutHost = url.replace(/^(https?:\/\/)?[^\/]+/, "");
  const processedURL = new URL(`http://domain.com${urlWithoutHost}`);
  const params = new URLSearchParams(processedURL.search);
  if (ignoreParams?.length > 0) {
    ignoreParams.forEach((ip) => {
      params.delete(ip);
    });
  }
  params.sort();
  return decodeURIComponent(`${processedURL.pathname}?${params}`);
};

const getHeaders = (headers) => {
  let res = null;
  try {
    res = new Map([
      ...Object.entries(headers),
      ...Object.entries(capitalizeHeaders(headers)),
    ]);
  } catch (e) {
    console.error("error at getHeaders", e);
    res = new Map([
      ["Content-Type", "application/json"],
      ["content-type", "application/json"],
    ]);
  }
  return Object.fromEntries(res);
};

function countFilesInDirectory(directoryPath) {
  return new Promise((resolve, reject) => {
    fs.readdir(directoryPath, (err, files) => {
      if (err) {
        return reject(err); // Handle error
      }

      // Filter out directories and only count files
      const fileCount = files.filter((file) => {
        const filePath = path.join(directoryPath, file);
        return fs.statSync(filePath).isFile();
      }).length;

      resolve(fileCount);
    });
  });
}

const getTestByName = async (ftmocksConifg, testName) => {
  const testsPath = path.join(getMockDir(ftmocksConifg), "tests.json");
  let tests = [];
  try {
    // Read existing tests
    const testsData = fs.readFileSync(testsPath, "utf8");
    tests = JSON.parse(testsData);
    const etest = tests.find((tst) => tst.name === testName);
    return etest;
  } catch (error) {
    console.error(`\x1b[31mError reading tests.json:\x1b[0m`, error);
    return null;
  }
};

/**
 * Creates a map from an array of objects using `id` property as key.
 * @param {Array<object>} arr - The array of objects to map.
 * @returns {Object} Map of id -> object
 */
function createIdMap(arr) {
  if (!Array.isArray(arr)) return {};
  return arr.reduce((acc, obj) => {
    if (obj && obj.id !== undefined && obj.id !== null) {
      acc[obj.id] = obj;
    }
    return acc;
  }, {});
}

/**
 * Creates a map where the key is in the format '[method]-[pathname]' and the value is the mock's id.
 * @param {Array<object>} mocks - Array of mock objects. Each should have fileContent with method and url, and an id.
 * @returns {Object} Map of '[method]-[pathname]' -> mock.id
 */
function createMethodPathnameIdMap(mocks) {
  if (!Array.isArray(mocks)) return {};
  const map = {};
  for (const mock of mocks) {
    if (
      mock &&
      mock.id !== undefined &&
      mock.fileContent &&
      typeof mock.fileContent.method === "string" &&
      typeof mock.fileContent.url === "string"
    ) {
      const urlObj = (() => {
        try {
          return new URL(mock.fileContent.url, "http://localhost");
        } catch (e) {
          // fallback: treat as path only
          return { pathname: mock.fileContent.url };
        }
      })();
      const key = `${mock.fileContent.method.toUpperCase()}-${urlObj.pathname}`;
      if (!map[key]) {
        map[key] = [mock.id];
      } else {
        map[key].push(mock.id);
      }
    }
  }
  return map;
}

/**
 * Returns a unique key for the given mock in the format '[METHOD]-[pathname]'.
 * If the URL can't be parsed, uses the raw URL as pathname.
 * @param {object} mock - The mock object with at least fileContent.method and fileContent.url
 * @returns {string|null} The key as '[METHOD]-[pathname]', or null if invalid input
 */
function getMockKey(options) {
  if (
    !options ||
    !options.method ||
    !options.url ||
    typeof options.method !== "string" ||
    typeof options.url !== "string"
  ) {
    return null;
  }
  let pathname;
  try {
    const urlObj = new URL(options.url, "http://localhost");
    pathname = urlObj.pathname;
  } catch (_) {
    pathname = options.url;
  }
  return `${options.method.toUpperCase()}-${pathname}`;
}

module.exports = {
  charDifference,
  nameToFolder,
  getMockDir,
  getFallbackDir,
  capitalizeHeader,
  capitalizeHeaders,
  clearNulls,
  processURL,
  getHeaders,
  countFilesInDirectory,
  getTestByName,
  createIdMap,
  createMethodPathnameIdMap,
  getMockKey,
};
