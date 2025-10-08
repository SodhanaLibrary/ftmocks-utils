const fs = require("fs");
const path = require("path");
const { getMockDir, nameToFolder } = require("./common-utils");

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

module.exports = {
  getDefaultMockDataFromConfig,
  loadMockDataFromConfig,
  resetAllMockStats,
};
