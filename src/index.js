// import fs from 'fs';
const fs = require('fs')
// import path from 'path';
const path = require('path')

const nameToFolder = name => {
  return name.replaceAll(' ', '_');
};

const getMockDir = config => {
  if(!path.isAbsolute(config.MOCK_DIR)) {
    return path.resolve( process.cwd(), config.MOCK_DIR);
  }
  return config.MOCK_DIR;
}

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
  const defaultPath = path.join(getMockDir(testConfig), 'default.json');

try {
  const defaultData = fs.readFileSync(defaultPath, 'utf8');
  let parsedData = JSON.parse(defaultData);
  
  // Read and attach mock data for each entry in parsedData
  parsedData.forEach(entry => {
    const mockFilePath = path.join(getMockDir(testConfig), 'defaultMocks', `mock_${entry.id}.json`);;
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
  console.error(`Error reading or parsing default.json:`, error);
  return [];
}
}

// src/index.js
const loadMockDataFromConfig = (testConfig, _testName) => {
  try {
    let testName = _testName;
    if(!testName) {
      // Read the test ID from mockServer.config.json
      const configPath = path.join(getMockDir(testConfig), 'mockServer.config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      testName = config.testName;
    }
    // Read the tests from testConfig
    const mocksPath = path.join(getMockDir(testConfig), `test_${nameToFolder(testName)}`, '_mock_list.json');
    const mocksData = fs.readFileSync(mocksPath, 'utf8');
    const mocks = JSON.parse(mocksData);

    mocks.forEach(mock => {
      const fileContent = JSON.parse(fs.readFileSync(path.join(getMockDir(testConfig), `test_${nameToFolder(testName)}`, `mock_${mock.id}.json`), 'utf8'));
      mock.fileContent = fileContent;
    });

    
    return mocks;
  } catch (error) {
    console.debug('Error loading test data:', error.message);
    return [];
  }
};

const clearNulls = postData => {
  Object.keys(postData || {}).forEach(key => {
    if(postData[key] === null) {
      delete postData[key];
    }
  });
};

const isSameRequest = (req1, req2) => {
  clearNulls(req1.postData);
  clearNulls(req2.postData);
  let matched = true;
  if(req1.url !== req2.url) {
    matched = false;
  } else if(req1.method?.toLowerCase() !== req2.method?.toLowerCase()) {
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
  try{
    const mockURL = processURL(mock.fileContent.url, mock.fileContent.ignoreParams);
    const reqURL = processURL(fetchReq.url, mock.fileContent.ignoreParams);
    const postData = mock.fileContent.request?.postData?.text ? JSON.parse(mock.fileContent.request?.postData?.text) : mock.fileContent.request?.postData;
    return isSameRequest({url: mockURL, method: mock.fileContent.method, postData}, {
      method: fetchReq.options.method || 'GET',
      postData: fetchReq.options.body?.length ? JSON.parse(fetchReq.options.body) : fetchReq.options.body,
      url: reqURL,
    });
  } catch(e) {
    console.debug('error at compareMockToFetchRequest', mock, fetchReq);
    console.debug(e);
  }
  return false;
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
  let foundMock = matchedMocks.find(mock => !mock.fileContent.served) ? matchedMocks.find(mock => !mock.fileContent.served) : matchedMocks[matchedMocks.length - 1];
  // updating stats to mock file
  if(foundMock) {
    const mockFilePath = path.join(getMockDir(testConfig), `test_${nameToFolder(testName)}`, `mock_${foundMock.id}.json`);
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
    const mockFilePath = path.join(getMockDir(testConfig), `test_${nameToFolder(testName)}`, `mock_${tmd.id}.json`);
    tmd.fileContent.served = false;
    await fs.writeFileSync(mockFilePath, JSON.stringify(tmd.fileContent, null, 2));
  }
}

async function initiatePlaywrightRoutes (page, ftmocksConifg, testName, path = '**/*') {
  const testMockData = testName ? loadMockDataFromConfig(ftmocksConifg, testName) : [];
  resetAllMockStats({testMockData, testConfig: ftmocksConifg, testName});
  const defaultMockData = getDefaultMockDataFromConfig(ftmocksConifg);
  console.debug('calling initiatePlaywrightRoutes fetch');
  await page.route(path, async (route, request) => {
    const url = request.url();
    const options = {
      options: {
        url,
        method: request.method(),
        body: request.postData(),
      }
    }
    console.debug('got fetch request', request.method(), request.url(), request.postData());
    let mockData = getMatchingMockData({testMockData, defaultMockData, url, options, testConfig: ftmocksConifg, testName});
    if (mockData) {
      console.debug('mocked', url, options);
      const { content, headers, status } = mockData.response;
      const json = {
        status,
        headers: new Map(Object.entries(headers)),
        body: content,
      };

      await route.fulfill(json);
    } else {
      console.debug('missing mock data', url, options);
      await route.fallback();
    }
  });
}

async function initiateJestFetch (jest, ftmocksConifg, testName) {
  const testMockData = testName ? loadMockDataFromConfig(ftmocksConifg, testName) : [];
  resetAllMockStats({testMockData, testConfig: ftmocksConifg, testName});
  const defaultMockData = getDefaultMockDataFromConfig(ftmocksConifg);
  console.debug('calling initiateJestFetch fetch');
  global.fetch = jest.fn((url, options = {}) => {
    console.debug('got fetch request', url, options);
    let mockData = getMatchingMockData({testMockData, defaultMockData, url, options, testConfig: ftmocksConifg, testName});
    if (mockData) {
      console.debug('mocked', url, options);
    } else {
      console.debug('missing mock data', url, options);
      return Promise.resolve({
        status: 404,
        headers: new Map([['content-type', 'application/json']]),
        json: () => Promise.resolve({ error: 'Mock data not found' }),
      });
    }
  
    const { content, headers, status } = mockData.response;
    
    return Promise.resolve({
      status,
      headers: new Map(Object.entries(headers)),
      json: () => Promise.resolve(JSON.parse(content)),
    });
  });

  console.debug('calling XMLHttpRequest fetch');
  global.XMLHttpRequest = jest.fn(function () {
    const xhrMock = {
      open: jest.fn(),
      send: jest.fn(),
      setRequestHeader: jest.fn(),
      getAllResponseHeaders: jest.fn(() => {
        return '';
      }),
      getResponseHeader: jest.fn((header) => {
        return null;
      }),
      readyState: 4,
      status: 0,
      response: null,
      responseText: '',
      onreadystatechange: null,
      onload: null,
      onerror: null,
    };
  
    xhrMock.send.mockImplementation(function () {
      const mockData = getMatchingMockData({
        testMockData,
        defaultMockData,
        url: xhrMock._url,
        options: xhrMock._options,
        testConfig: ftmocksConifg,
        testName,
      });
  
      if (mockData) {
        console.debug('mocked', xhrMock._url, xhrMock._options);
        const { content, headers, status } = mockData.response;
  
        xhrMock.status = status;
        xhrMock.responseText = content;
        xhrMock.response = content;
        xhrMock.headers = headers;
  
        if (xhrMock.onreadystatechange) {
          xhrMock.onreadystatechange();
        }
        if (xhrMock.onload) {
          xhrMock.onload();
        }
      } else {
        console.debug('missing mock data', xhrMock._url, xhrMock._options);
  
        xhrMock.status = 404;
        xhrMock.responseText = JSON.stringify({ error: 'Mock data not found' });
        xhrMock.response = xhrMock.responseText;
  
        if (xhrMock.onreadystatechange) {
          xhrMock.onreadystatechange();
        }
        if (xhrMock.onerror) {
          xhrMock.onerror();
        }
      }
    });
  
    xhrMock.open.mockImplementation(function (method, url) {
      xhrMock._options = { method };
      xhrMock._url = url;
    });
  
    return xhrMock;
  });
  
  return;
};

function initiateConsoleLogs(jest, ftmocksConifg, testName) {
  const logsFile = path.join(getMockDir(ftmocksConifg), `test_${nameToFolder(testName)}`, '_logs.json');
  let logs = [];
  if(!fs.existsSync(logsFile)) {
    fs.appendFileSync(logsFile, '[]', 'utf8');
  } else {
    fs.writeFileSync(logsFile, '[]', 'utf8');
  }

  const writeToFile = (type, params) => {
    const logMessage = params.join(' ') + '\n'; // Combine params into a string with spaces
    logs.push({
      type,
      message: logMessage,
      time: Date.now()
    });
    fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2), 'utf8'); // Append the log message to the file
  } 
    
  global.console = {
    ...console,
    // uncomment to ignore a specific log level
    log: jest.fn((...params) => {
      writeToFile('log', params);
    }),
    debug: jest.fn((...params) => {
      writeToFile('debug', params);
    }),
    info: jest.fn((...params) => {
      writeToFile('info', params);
    }),
    warn: jest.fn((...params) => {
      writeToFile('warn', params);
    }),
    error: jest.fn((...params) => {
      writeToFile('error', params);
    }),
  };
}


function countFilesInDirectory(directoryPath) {
  return new Promise((resolve, reject) => {
    fs.readdir(directoryPath, (err, files) => {
      if (err) {
        return reject(err); // Handle error
      }

      // Filter out directories and only count files
      const fileCount = files.filter(file => {
        const filePath = path.join(directoryPath, file);
        return fs.statSync(filePath).isFile();
      }).length;

      resolve(fileCount);
    });
  });
}

const saveSnap = async (html, ftmocksConifg, testName) => {
  const snapFolder = path.join(getMockDir(ftmocksConifg), `test_${nameToFolder(testName)}`, '_snaps');
  const snapTemplate = path.join(getMockDir(ftmocksConifg), 'snap_template.html');
  
  if (!fs.existsSync(snapFolder)) {
    fs.mkdirSync(snapFolder);
  }
  const fileCount =  await (countFilesInDirectory(snapFolder));
  const snapFilePath = path.join(snapFolder, `snap_${fileCount + 1}.html`);
  let resHtml = html;
  if (fs.existsSync(snapFolder)) {
    const templateHtml = fs.readFileSync(snapTemplate, 'utf8');;
    resHtml = templateHtml.replace('<!--FtMocks-Snap-Template-To-Be-Replaced-->', html)
  }
  fs.writeFileSync(snapFilePath, resHtml)
};

const deleteAllSnaps = async (ftmocksConifg, testName) => {
  const snapFolder = path.join(getMockDir(ftmocksConifg), `test_${nameToFolder(testName)}`, '_snaps');
  fs.rmSync(snapFolder, { recursive: true, force: true });
};

const deleteAllLogs = async (ftmocksConifg, testName) => {
  const mockDir = path.join(getMockDir(ftmocksConifg), `test_${nameToFolder(testName)}`);
  const logFilePath = path.join(mockDir, `_logs.json`);
  fs.rmSync(logFilePath, { recursive: true, force: true });
};

function initiateJestEventSnaps(jest, ftmocksConifg, testName) {
  const mouseEvents = ftmocksConifg.snapEvents || ['click', 'change', 'url', 'dblclick', 'contextmenu'];
  mouseEvents.forEach(event => {
    jest.spyOn(document, 'addEventListener').mockImplementation((e, callback) => {
      if (mouseEvents.includes(e)) {
        saveSnap(document.outerHTML, ftmocksConifg, testName);
      }
    });
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
    compareMockToFetchRequest,
    getMatchingMockData,
    resetAllMockStats,
    initiateJestFetch,
    saveSnap,
    deleteAllSnaps,
    deleteAllLogs,
    initiateConsoleLogs,
    initiatePlaywrightRoutes,
    initiateJestEventSnaps
};
