const fs = require("fs");
const path = require("path");
const { getMockDir, nameToFolder } = require("./common-utils");
const { attachServedToMocks, resetServed } = require("./served-utils");

const getDefaultMockDataFromConfig = (testConfig) => {
  const defaultFolder = path.join(getMockDir(testConfig), "defaultMocks");
  const defaultPath = path.join(defaultFolder, "_mock_list.json");

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
    attachServedToMocks(parsedData, defaultFolder);
    return parsedData;
  } catch (error) {
    console.error(`Error reading or parsing default mocks:`, error);
    return [];
  }
};

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
    const testFolder = path.join(
      getMockDir(testConfig),
      `test_${nameToFolder(testName)}`
    );
    const mocksPath = path.join(testFolder, "_mock_list.json");
    const mocksData = fs.readFileSync(mocksPath, "utf8");
    const mocks = JSON.parse(mocksData);

    mocks.forEach((mock) => {
      const fileContent = JSON.parse(
        fs.readFileSync(
          path.join(testFolder, `mock_${mock.id}.json`),
          "utf8"
        )
      );
      mock.fileContent = fileContent;
    });

    attachServedToMocks(mocks, testFolder);

    return mocks;
  } catch (error) {
    console.error("Error loading test data:", error.message);
    return [];
  }
};

async function resetAllMockStats({ testMockData, testConfig, testName }) {
  const testFolder = path.join(
    getMockDir(testConfig),
    `test_${nameToFolder(testName)}`
  );
  resetServed(testFolder);
  testMockData.forEach((tmd) => {
    if (tmd.fileContent) {
      tmd.fileContent.served = false;
    }
  });
}

module.exports = {
  getDefaultMockDataFromConfig,
  loadMockDataFromConfig,
  resetAllMockStats,
};
