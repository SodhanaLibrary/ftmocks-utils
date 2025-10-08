const path = require("path");
const fs = require("fs");
const { getMockDir, nameToFolder } = require("./common-utils");

class Logger {
  constructor(options = {}, ftmocksConifg, testName) {
    this.levels = ["error", "warn", "info", "debug"];
    this.level = options.level || "info";
    this.disableLogs = options.disableLogs || false;
    this.logsFile = path.join(
      getMockDir(ftmocksConifg),
      `test_${nameToFolder(testName)}`,
      "_logs.json"
    );
    this.logs = [];
  }

  setLevel(level) {
    if (this.levels.includes(level)) {
      this.level = level;
    }
  }

  writeToFile(type, params) {
    try {
      const logMessage = params.join(" ") + "\n"; // Combine params into a string with spaces
      this.logs.push({
        type,
        message: logMessage,
        time: Date.now(),
        source: "ftmocks-utils",
      });
      fs.writeFileSync(this.logsFile, JSON.stringify(this.logs, null, 2), "utf8"); // Append the log message to the file
    } catch (error) {
      // Ignore error
    }
  }

  log(level, ...args) {
    if (this.disableLogs) return;
    const levelIdx = this.levels.indexOf(level);
    const currentLevelIdx = this.levels.indexOf(this.level);
    if (levelIdx <= currentLevelIdx) {
      const color = this._getColor(level);
      const prefix = `[${level.toUpperCase()}]`;
      if (typeof args[0] === "string") {
        // Color only the prefix
        console.log(`${color}${prefix}\x1b[0m`, ...args);
      } else {
        // Non-string first arg, just print
        console.log(`${color}${prefix}\x1b[0m`, ...args);
      }
    }
    this.writeToFile(level, args);
  }

  error(...args) {
    this.log("error", ...args);
  }

  warn(...args) {
    this.log("warn", ...args);
  }

  info(...args) {
    this.log("info", ...args);
  }

  debug(...args) {
    this.log("debug", ...args);
    console.debug(...args);
  }

  _getColor(level) {
    switch (level) {
      case "error":
        return "\x1b[31m"; // Red
      case "warn":
        return "\x1b[33m"; // Yellow
      case "info":
        return "\x1b[36m"; // Cyan
      case "debug":
        return "\x1b[90m"; // Gray
      default:
        return "";
    }
  }
}

module.exports = Logger;
