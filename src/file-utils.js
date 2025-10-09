const path = require("path");
const fs = require("fs");
const { getMockDir, nameToFolder } = require("./common-utils");

const saveIfItIsFile = async (route, testName, ftmocksConifg) => {
  const urlObj = new URL(route.request().url());

  // Check if URL contains file extension like .js, .png, .css etc
  const fileExtMatch = urlObj.pathname.match(/\.[a-zA-Z0-9]+$/);
  if (fileExtMatch) {
    const fileExt = fileExtMatch[0];
    // Create directory path matching URL structure
    const dirPath = path.join(
      getMockDir(ftmocksConifg),
      `test_${nameToFolder(testName)}`,
      "_files",
      path.dirname(urlObj.pathname)
    );

    // Create directories if they don't exist
    fs.mkdirSync(dirPath, { recursive: true });

    // Save file with original name
    const fileName = path.basename(urlObj.pathname);
    const filePath = path.join(dirPath, fileName);

    const response = await route.fetch();
    const buffer = await response.body();
    fs.writeFileSync(filePath, buffer);

    await route.continue();
    return true;
  }
  return false;
};

module.exports = {
  saveIfItIsFile,
};
