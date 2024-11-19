import fs from 'fs';
import path from 'path';

export const nameToFolder = name => {
  return name.replaceAll(' ', '_');
};

const areJsonEqual = (jsonObj1, jsonObj2) => {
  // Check if both are objects and not null
  if (typeof jsonObj1 === 'object' && jsonObj1 !== null &&
      typeof jsonObj2 === 'object' && jsonObj2 !== null) {
    
    // Get the keys of both objects
    const keys1 = Object.keys(jsonObj1);
    const keys2 = Object.keys(jsonObj2);
    
    // Check if the number of keys is different
    if (keys1.length !== keys2.length) {
      return false;
    }
    
    // Recursively check each key-value pair
    for (let key of keys1) {
      if (!keys2.includes(key) || !areJsonEqual(jsonObj1[key], jsonObj2[key])) {
        return false;
      }
    }
    
    return true;
  } else {
    // For non-object types, use strict equality comparison
    return jsonObj1 === jsonObj2;
  }
}

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
    console.debug('Error loading test data:', error.message);
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
    postData: fetchReq.options.body?.length ? JSON.parse(fetchReq.options.body) : fetchReq.options.body,
    url: reqURL,
  });
}

function getMatchingMockData({testMockData, defaultMockData, url, options, testConfig, testName}) {
  let served = false;
  let matchedMocks = testMockData?.filter(mock => {
    if (mock.fileContent.waitForPrevious && !served) {
      return false;
    }
    served = mock.fileContent.served;
    return compareMockToFetchRequest(mock, { url, options });
  }) || [];
  let foundMock = matchedMocks.find(mock => !mock.fileContent.served) ? matchedMocks.find(mock => !mock.fileContent.served) : matchedMocks[0];
  // updating stats to mock file
  if(foundMock) {
    const mockFilePath = path.join(testConfig.MOCK_DIR, `test_${nameToFolder(testName)}`, `mock_${foundMock.id}.json`);
    foundMock.fileContent.served = true;
    fs.writeFileSync(mockFilePath, JSON.stringify(foundMock.fileContent, null, 2));
  }
  
  if(!foundMock) {
    foundMock = defaultMockData.find(tm => compareMockToFetchRequest(tm, {
      url,
      options
    }));
  }
  return foundMock ? foundMock.fileContent : null;
}

async function resetAllMockStats({testMockData, testConfig, testName}) {
  for(let i=0; i<testMockData.length; i++) {
    const tmd = testMockData[i];
    const mockFilePath = path.join(testConfig.MOCK_DIR, `test_${nameToFolder(testName)}`, `mock_${tmd.id}.json`);
    tmd.fileContent.served = false;
    await fs.writeFileSync(mockFilePath, JSON.stringify(tmd.fileContent, null, 2));
  }
}


// Export functions as a module
module.exports = {
    compareMockToRequest,
    processURL,
    isSameRequest,
    loadMockDataFromConfig,
    getDefaultMockDataFromConfig,
    nameToFolder,
    compareMockToFetchRequest,
    getMatchingMockData,
    resetAllMockStats
};
