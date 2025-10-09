const { compareMockToFetchRequest } = require("./compare-utils");
const { getCompareRankMockToFetchRequest } = require("./rank-compare-utils");
const { getMockDir, nameToFolder } = require("./common-utils");
const path = require("path");
const fs = require("fs");

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

module.exports = {
  getMatchingMockData,
};
