const fs = require("fs");
const path = require("path");
const { getMockDir, nameToFolder } = require("./common-utils");
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

module.exports = {
  createTest,
};
