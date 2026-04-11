const { clearNulls, processURL } = require("./common-utils");
const { FtJSON } = require("./json-utils");

/** @param {Record<string, string>|undefined|null} headers */
function getHeaderValueCaseInsensitive(headers, headerName) {
  if (!headers || !headerName) {
    return undefined;
  }
  const lower = headerName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return headers[key];
    }
  }
  return undefined;
}

function parseMatchHeadersList(testConfig) {
  const raw = testConfig?.MATCH_HEADERS;
  if (!raw || typeof raw !== "string") {
    return [];
  }
  return raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
}

/** Normalize fetch `options.headers` (plain object or Headers) to a plain object. */
function normalizeIncomingHeaders(headers) {
  if (!headers) {
    return {};
  }
  if (typeof headers.forEach === "function") {
    const out = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (typeof headers === "object") {
    return { ...headers };
  }
  return {};
}

/**
 * When MATCH_HEADERS is set, each listed header must match between the mock
 * recording and the incoming request (case-insensitive name, value compared as strings).
 */
function incomingHeadersMatchMock(mock, incomingHeaders, testConfig) {
  const names = parseMatchHeadersList(testConfig);
  if (names.length === 0) {
    return true;
  }
  const mockHeaders = mock.fileContent.request?.headers || {};
  const incoming = incomingHeaders || {};
  for (const name of names) {
    const mockVal = getHeaderValueCaseInsensitive(mockHeaders, name);
    const reqVal = getHeaderValueCaseInsensitive(incoming, name);
    if (String(mockVal ?? "") !== String(reqVal ?? "")) {
      return false;
    }
  }
  return true;
}

const isUrlAndMethodSame = (req1, req2) => {
  const url1 = new URL(`http://domain.com${req1.url}`);
  const url2 = new URL(`http://domain.com${req2.url}`);
  return (
    url1.pathname === url2.pathname &&
    url1.method?.toLowerCase() === url2.method?.toLowerCase()
  );
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
        FtJSON.parse(req2.response.content) || {},
      );
      // console.log('not matched at post Data 0', req1.postData, req2.postData);
    } else if (
      req1.response.content &&
      req2.response.content &&
      !FtJSON.areJsonEqual(
        FtJSON.parse(req1.response.content) || {},
        FtJSON.parse(req2.response.content) || {},
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

function compareMockToRequest(mock, req) {
  const mockURL = processURL(
    mock.fileContent.url,
    mock.fileContent.ignoreParams,
  );
  const reqURL = processURL(req.originalUrl, mock.fileContent.ignoreParams);
  const isSameUrlAndMethod = isUrlAndMethodSame(
    { url: mockURL, method: mock.fileContent.method },
    { url: reqURL, method: req.method },
  );
  if (!isSameUrlAndMethod) {
    return false;
  }
  const postData = mock.fileContent.request?.postData?.text
    ? FtJSON.parse(mock.fileContent.request?.postData?.text)
    : mock.fileContent.request?.postData;
  return isSameRequest(
    { url: mockURL, method: mock.fileContent.method, postData },
    {
      method: req.method,
      postData: req.body,
      url: reqURL,
    },
  );
}

function compareMockToFetchRequest(mock, fetchReq, testConfig) {
  try {
    const mockURL = processURL(
      mock.fileContent.url,
      mock.fileContent.ignoreParams,
    );
    const reqURL = processURL(fetchReq.url, mock.fileContent.ignoreParams);
    const isSameUrlAndMethod = isUrlAndMethodSame(
      { url: mockURL, method: mock.fileContent.method },
      { url: reqURL, method: fetchReq.options.method || "GET" },
    );
    if (!isSameUrlAndMethod) {
      return false;
    }
    const postData = mock.fileContent.request?.postData?.text
      ? FtJSON.parse(mock.fileContent.request?.postData?.text)
      : mock.fileContent.request?.postData;
    const sameBody = isSameRequest(
      { url: mockURL, method: mock.fileContent.method, postData },
      {
        method: fetchReq.options.method || "GET",
        postData: fetchReq.options.body?.length
          ? FtJSON.parse(fetchReq.options.body)
          : fetchReq.options.body,
        url: reqURL,
      },
    );
    if (!sameBody) {
      return false;
    }
    const incomingHeaders = normalizeIncomingHeaders(fetchReq.options?.headers);
    return incomingHeadersMatchMock(mock, incomingHeaders, testConfig);
  } catch (e) {
    console.error("error at compareMockToFetchRequest", mock, fetchReq);
    console.error(e);
  }
  return false;
}

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

module.exports = {
  isUrlAndMethodSame,
  isSameRequest,
  isSameResponse,
  compareMockToRequest,
  compareMockToFetchRequest,
  compareMockToMock,
  getHeaderValueCaseInsensitive,
  parseMatchHeadersList,
  normalizeIncomingHeaders,
  incomingHeadersMatchMock,
};
