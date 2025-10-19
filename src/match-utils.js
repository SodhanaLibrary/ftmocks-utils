const { compareMockToFetchRequest } = require("./compare-utils");
const { getCompareRankMockToFetchRequest } = require("./rank-compare-utils");
const {
  getMockDir,
  nameToFolder,
  createIdMap,
  createMethodPathnameIdMap,
  getMockKey,
} = require("./common-utils");
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
  const testMockIdMap = createIdMap(testMockData);
  let matchedMocks =
    testMockData?.filter((mock) => {
      if (mock.fileContent.waitForPrevious && !served) {
        return false;
      }
      if (mock.fileContent.waitFor) {
        const waitForMocks = mock.fileContent.waitFor.filter(
          (waitForMockId) => {
            const waitForMock = testMockIdMap[waitForMockId];
            return waitForMock && !waitForMock.fileContent.served;
          }
        );
        if (waitForMocks.length > 0) {
          return false;
        }
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

function getMatchingMockDataV2({
  testMockData,
  defaultMockData,
  url,
  options,
  testConfig,
  testName,
  mode,
}) {
  const testMockIdMap = createIdMap(testMockData);
  const testMockMethodPathnameMap = createMethodPathnameIdMap(testMockData);
  const defaultMockIdMap = createIdMap(defaultMockData);
  const defaultMockMethodPathnameMap =
    createMethodPathnameIdMap(defaultMockData);
  const key = getMockKey(options);
  let matchedMocks = testMockMethodPathnameMap[key] || [];
  let defaultMatchedMocks = [];
  const nonWaitForMocks = matchedMocks.filter((mockId) => {
    const mock = testMockIdMap[mockId];
    if (mock.fileContent.waitFor) {
      const waitForMocks = mock.fileContent.waitFor.filter((waitForMockId) => {
        const waitForMock = testMockIdMap[waitForMockId];
        return waitForMock && !waitForMock.fileContent.served;
      });
      if (waitForMocks.length > 0) {
        return false;
      }
    }
    return true;
  });
  const nonServedMocks = nonWaitForMocks.filter((mockId) => {
    const mock = testMockIdMap[mockId];
    return !mock.fileContent.served;
  });
  let foundMock = null;
  if (nonServedMocks.length > 0) {
    foundMock = testMockIdMap[nonServedMocks[0]];
  } else if (nonWaitForMocks.length > 0) {
    foundMock = testMockIdMap[nonWaitForMocks[nonWaitForMocks.length - 1]];
  }
  if (!foundMock) {
    defaultMatchedMocks = defaultMockMethodPathnameMap[key] || [];
    if (defaultMatchedMocks.length > 0) {
      foundMock = defaultMockIdMap[defaultMatchedMocks[0]];
    }
  }
  if (!foundMock && mode !== "strict") {
    const mockRanks = {};
    matchedMocks.forEach((mockId) => {
      const mock = testMockIdMap[mockId];
      const rank = getCompareRankMockToFetchRequest(mock, {
        url,
        options,
      });
      if (rank > 0) {
        mockRanks[mock.id] = rank;
      }
    });
    defaultMatchedMocks.forEach((mockId) => {
      const mock = defaultMockIdMap[mockId];
      const rank = getCompareRankMockToFetchRequest(mock, {
        url,
        options,
      });
      if (rank > 0) {
        mockRanks[mock.id] = rank;
      }
    });
    // Sort by rank to find the best match
    const sortedRanks = Object.entries(mockRanks).sort((a, b) => a[1] - b[1]);
    if (sortedRanks.length > 0) {
      const bestMockId = sortedRanks?.[0]?.[0];
      if (bestMockId) {
        foundMock = testMockIdMap[bestMockId] || defaultMockIdMap[bestMockId];
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
  getMatchingMockDataV2,
};
