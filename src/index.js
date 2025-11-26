const { nameToFolder, processURL, getTestByName } = require("./common-utils");
const {
  getDefaultMockDataFromConfig,
  loadMockDataFromConfig,
  resetAllMockStats,
} = require("./mock-utils");
const { deleteAllLogs } = require("./log-utils");
const {
  isSameRequest,
  compareMockToRequest,
  compareMockToFetchRequest,
} = require("./compare-utils");
const { getMatchingMockData } = require("./match-utils");
const {
  initiateJestFetch,
  initiateConsoleLogs,
  initiateJestEventSnaps,
} = require("./react-utils");
const {
  initiatePlaywrightRoutes,
  recordPlaywrightRoutes,
} = require("./playwright-utils");
const { saveSnap, deleteAllSnaps } = require("./snap-utils");
const { injectEventRecordingScript } = require("./event-utils");
const {
  runEventsForTest,
  runEvent,
  runEventsInPresentationMode,
  runEventsInTrainingMode,
  runEventsForScreenshots,
} = require("./event-run-utils");

// Export functions as a module
module.exports = {
  getTestByName,
  compareMockToRequest,
  processURL,
  isSameRequest,
  loadMockDataFromConfig,
  getDefaultMockDataFromConfig,
  nameToFolder,
  compareMockToFetchRequest,
  getMatchingMockData,
  resetAllMockStats,
  initiateJestFetch,
  saveSnap,
  deleteAllSnaps,
  deleteAllLogs,
  initiateConsoleLogs,
  initiatePlaywrightRoutes,
  initiateJestEventSnaps,
  recordPlaywrightRoutes,
  injectEventRecordingScript,
  runEventsForTest,
  runEvent,
  runEventsInPresentationMode,
  runEventsInTrainingMode,
  runEventsForScreenshots,
};
