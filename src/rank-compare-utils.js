const { clearNulls, charDifference, processURL } = require("./common-utils");
const { FtJSON } = require("./json-utils");
const { isUrlAndMethodSame } = require("./compare-utils");

const getSameRequestRank = (req1, req2) => {
  let rank = 1;
  clearNulls(req1.postData);
  clearNulls(req2.postData);
  // Compare query strings
  const queryDiff = charDifference(
    req1.url.split("?")[1] || "",
    req2.url.split("?")[1] || ""
  );
  rank = rank + queryDiff;
  // Compare post data
  const postDataDiff = charDifference(
    FtJSON.stringify(req1.postData || {}),
    FtJSON.stringify(req2.postData || {})
  );
  rank = rank + postDataDiff;
  return rank;
};

function getCompareRankMockToFetchRequest(mock, fetchReq) {
  try {
    const mockURL = processURL(
      mock.fileContent.url,
      mock.fileContent.ignoreParams
    );
    const reqURL = processURL(fetchReq.url, mock.fileContent.ignoreParams);
    if (
      !isUrlAndMethodSame(
        { url: mockURL, method: mock.fileContent.method },
        { url: reqURL, method: fetchReq.options.method || "GET" }
      )
    ) {
      return 0;
    }
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

module.exports = {
  getSameRequestRank,
  getCompareRankMockToFetchRequest,
};
