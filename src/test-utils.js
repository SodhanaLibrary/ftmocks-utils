const fs = require("fs");
const path = require("path");
const { getMockDir, nameToFolder } = require("./common-utils");
const { ensureServedFile } = require("./served-utils");
const { v4: uuidv4 } = require("uuid");

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
      fs.mkdirSync(folderPath, { recursive: true });
      fs.writeFileSync(mockListFilePath, "[]", "utf8");
      ensureServedFile(folderPath);

      return newTest;
    } else {
      throw "Test already exists";
    }
  } catch (error) {
    console.error(`\x1b[31mError reading tests.json:\x1b[0m`, error);
    return null;
  }
};

module.exports = {
  createTest,
};
