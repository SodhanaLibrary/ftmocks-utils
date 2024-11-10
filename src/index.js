import fs from 'fs';
import path from 'path';

export const nameToFolder = name => {
  return name.replaceAll(' ', '_');
};

const getDefaultMockDataFromConfig = (testConfig) => {
  const defaultPath = path.join(testConfig.MOCK_DIR, testConfig.MOCK_DEFAULT_FILE);

try {
  const defaultData = fs.readFileSync(defaultPath, 'utf8');
  let parsedData = JSON.parse(defaultData);
  
  // Read and attach mock data for each entry in parsedData
  parsedData.forEach(entry => {
    const mockFilePath = path.join(testConfig.MOCK_DIR, testConfig.MOCK_DEFAULT_DIR, `mock_${entry.id}.json`);;
    try {
      const mockData = fs.readFileSync(mockFilePath, 'utf8');
      entry.fileContent = JSON.parse(mockData);
    } catch (error) {
      console.error(`Error reading mock data for ${entry.path}:`, error);
      return entry; // Return the original entry if there's an error
    }
  });
  return parsedData;
} catch (error) {
  console.error(`Error reading or parsing ${testConfig.MOCK_DEFAULT_FILE}:`, error);
  return [];
}
}

// src/index.js
const loadMockDataFromConfig = (testConfig, _testName) => {
  try {
    let testName = _testName;
    if(!testName) {
      // Read the test ID from mockServer.config.json
      const configPath = path.join(testConfig.MOCK_DIR, 'mockServer.config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      testName = config.testName;
    }
    // Read the tests from testConfig.MOCK_TEST_FILE
    const mocksPath = path.join(testConfig.MOCK_DIR, `test_${nameToFolder(testName)}`, '_mock_list.json');
    const mocksData = fs.readFileSync(mocksPath, 'utf8');
    const mocks = JSON.parse(mocksData);

    mocks.forEach(mock => {
      const fileContent = JSON.parse(fs.readFileSync(path.join(testConfig.MOCK_DIR, `test_${nameToFolder(testName)}`, `mock_${mock.id}.json`), 'utf8'));
      mock.fileContent = fileContent;
    });

    return mocks;
  } catch (error) {
    console.error('Error loading test data:', error.message);
    return [];
  }
};

const isSameRequest = (req1, req2) => {
  let matched = true;
  if(req1.url !== req2.url) {
    matched = false;
  } else if(req1.method !== req2.method) {
    matched = false;
  } else if((!req1.postData && req2.postData) || (req1.postData && !req2.postData)) {
    matched = areJsonEqual(req1.postData || {} ,  req2.postData || {});
  } else if(req1.postData && req2.postData && !areJsonEqual(req1.postData ,  req2.postData)) {
    matched = false;
  }
  return matched;
}

const processURL = (url, ignoreParams=[]) => {
    // Remove the hostname from the URL
    const urlWithoutHost = url.replace(/^(https?:\/\/)?[^\/]+/, '');
    const processedURL = new URL(`http://domain.com${urlWithoutHost}`);
    const params = new URLSearchParams(processedURL.search);
    if(ignoreParams?.length > 0) {
      ignoreParams.forEach(ip => {
        params.delete(ip);
      });
    }
    params.sort();
    return decodeURIComponent(`${processedURL.pathname}?${params}`);
}
  

function compareMockToRequest(mock, req) {
    const mockURL = processURL(mock.fileContent.url, mock.fileContent.ignoreParams);
    const reqURL = processURL(req.originalUrl, mock.fileContent.ignoreParams);
    const postData = mock.fileContent.request?.postData?.text ? JSON.parse(mock.fileContent.request?.postData?.text) : mock.fileContent.request?.postData;
    return isSameRequest({url: mockURL, method: mock.fileContent.method, postData}, {
      method: req.method,
      postData: req.body,
      url: reqURL,
    });
}

function compareMockToFetchRequest(mock, fetchReq) {
  const mockURL = processURL(mock.fileContent.url, mock.fileContent.ignoreParams);
  const reqURL = processURL(fetchReq.url, mock.fileContent.ignoreParams);
  const postData = mock.fileContent.request?.postData?.text ? JSON.parse(mock.fileContent.request?.postData?.text) : mock.fileContent.request?.postData;
  return isSameRequest({url: mockURL, method: mock.fileContent.method, postData}, {
    method: fetchReq.options.method || 'GET',
    postData: fetchReq.options.body,
    url: reqURL,
  });
}


// Export functions as a module
module.exports = {
    compareMockToRequest,
    processURL,
    isSameRequest,
    loadMockDataFromConfig,
    getDefaultMockDataFromConfig,
    nameToFolder,
    compareMockToFetchRequest
};
