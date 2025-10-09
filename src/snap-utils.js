const path = require("path");
const fs = require("fs");
const { getMockDir, nameToFolder } = require("./common-utils");
const { countFilesInDirectory } = require("./common-utils");

const saveSnap = async (html, ftmocksConifg, testName) => {
  const snapFolder = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    "_snaps"
  );
  const snapTemplate = path.join(
    getMockDir(ftmocksConifg),
    "snap_template.html"
  );

  if (!fs.existsSync(snapFolder)) {
    fs.mkdirSync(snapFolder);
  }
  const fileCount = await countFilesInDirectory(snapFolder);
  const snapFilePath = path.join(snapFolder, `snap_${fileCount + 1}.html`);
  let resHtml = html;
  if (fs.existsSync(snapFolder)) {
    const templateHtml = fs.readFileSync(snapTemplate, "utf8");
    resHtml = templateHtml.replace(
      "<!--FtMocks-Snap-Template-To-Be-Replaced-->",
      html
    );
  }
  fs.writeFileSync(snapFilePath, resHtml);
};

const deleteAllSnaps = async (ftmocksConifg, testName) => {
  const snapFolder = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    "_snaps"
  );
  fs.rmSync(snapFolder, { recursive: true, force: true });
};

module.exports = {
  saveSnap,
  deleteAllSnaps,
};
