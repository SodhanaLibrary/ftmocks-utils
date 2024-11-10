// src/index.js


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

// Export functions as a module
module.exports = {
    compareMockToRequest,
    processURL
};
