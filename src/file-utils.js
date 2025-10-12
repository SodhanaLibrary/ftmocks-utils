const path = require("path");
const fs = require("fs");
const { getMockDir, nameToFolder } = require("./common-utils");

const saveIfItIsFile = async (route, testName, ftmocksConifg) => {
  const urlObj = new URL(route.request().url());

  // Check if URL contains file extension like .js, .png, .css etc
  const fileExtMatch = urlObj.pathname.match(/\.[a-zA-Z0-9]+$/);
  // Check mime type if extension is not present
  let fileExt = null;
  if (!fileExtMatch) {
    // Try to get extension from content-type header
    const response = await route.fetch();
    const contentType = response.headers()["content-type"];
    if (contentType) {
      // Map common mime types to extensions
      const mimeToExt = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "application/javascript": ".js",
        "application/x-javascript": ".js",
        "text/javascript": ".js",
        "text/css": ".css",
        "font/woff": ".woff",
        "font/woff2": ".woff2",
        "font/ttf": ".ttf",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "video/mp4": ".mp4",
        "application/pdf": ".pdf",
      };
      // Remove any charset, etc.
      const mime = contentType.split(";")[0].trim();
      if (mimeToExt[mime]) {
        fileExt = mimeToExt[mime];
      }
    }
  } else {
    fileExt = fileExtMatch[0];
  }
  if (fileExt) {
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
    const fileName = `${id}${fileExt}`;
    const filePath = path.join(dirPath, fileName);

    const response = await route.fetch();
    const buffer = await response.body();
    fs.writeFileSync(filePath, buffer);

    return fileName;
  }
  return false;
};

module.exports = {
  saveIfItIsFile,
};
