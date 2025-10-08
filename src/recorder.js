window.FTMOCKS_CONFIG = {
  record_mocks_url: "http://localhost:5000/api/v1/recordMockdata",
  record_events_url: "http://localhost:5000/api/v1/recordedEvents",
};

(function () {
  // Intercept Fetch API
  const originalFetch = window.fetch;
  const recordedTracks = [];

  const addTrack = (track) => {
    track.id = recordedTracks.length
      ? recordedTracks[recordedTracks.length - 1].id + 1
      : 1;
    track.time = new Date();
    // track.bodyHtml = document.documentElement.outerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');;

    fetch(window.FTMOCKS_CONFIG.record_events_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(track),
    }).then((response) => response.json());
  };

  window.fetch = async function (url, options = {}) {
    const method = options.method || "GET";
    const body = options.body;
    const headers = options.headers || {};
    const queryString = url.includes("?") ? url.split("?")[1] : null;
    const response = await originalFetch(url, options);
    const ftMocksURL = new URL(window.FTMOCKS_CONFIG.record_mocks_url);
    const currentURL = new URL(
      url.startsWith("http") ? url : `http://something/${url}`
    );
    const clonedResponse = response.clone();
    clonedResponse.text().then((text) => {
      if (ftMocksURL.hostname !== currentURL.hostname) {
        const mockResponse = {
          url: url,
          time: new Date().toString(),
          method: method,
          request: {
            headers: headers,
            queryString: queryString,
            postData: {
              mimeType: headers["Content-Type"] || null,
              text: body,
            },
          },
          response: {
            status: response.status,
            headers: Array.from(clonedResponse.headers.entries()),
            content: text,
          },
        };
        fetch(window.FTMOCKS_CONFIG.record_mocks_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mockResponse),
        }).then((response) => response.json());
        addTrack({
          type: mockResponse.method,
          target: mockResponse.url,
        });
      }
    });
    return response;
  };

  // Intercept XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;

  function MockXHR() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const originalSetRequestHeader = xhr.setRequestHeader;
    let requestDetails = {
      headers: {},
    };

    // Override 'open' method
    xhr.open = function (method, url, async, user, password) {
      requestDetails.method = method;
      requestDetails.url = url;
      requestDetails.async = async;
      requestDetails.user = user;
      requestDetails.password = password;
      requestDetails.queryString = url.includes("?") ? url.split("?")[1] : null;
      originalOpen.apply(xhr, arguments);
    };

    // Override 'setRequestHeader' to log headers
    xhr.setRequestHeader = function (header, value) {
      requestDetails.headers[header] = value;
      originalSetRequestHeader.apply(xhr, arguments);
    };

    // Override 'send' method
    xhr.send = function (body) {
      requestDetails.body = body;
      const originalOnReadyStateChange = xhr.onreadystatechange;
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          // Complete
          const ftMocksURL = new URL(window.FTMOCKS_CONFIG.record_mocks_url);
          const currentURL = new URL(
            requestDetails.url.startsWith("http")
              ? requestDetails.url
              : `http://something/${requestDetails.url}`
          );
          if (ftMocksURL.hostname !== currentURL.hostname) {
            const mockResponse = {
              url: requestDetails.url,
              time: new Date().toString(),
              method: requestDetails.method,
              request: {
                headers: requestDetails.headers,
                queryString: requestDetails.queryString,
                postData: {
                  mimeType: requestDetails.headers["Content-Type"] || null,
                  text: requestDetails.body,
                },
              },
              response: {
                status: xhr.status,
                headers: xhr.getAllResponseHeaders(),
                content: xhr.responseText,
              },
            };
            fetch(window.FTMOCKS_CONFIG.record_mocks_url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(mockResponse),
            }).then((response) => response.json());
          }
        }
        if (originalOnReadyStateChange)
          originalOnReadyStateChange.apply(xhr, arguments);
      };
      originalSend.apply(xhr, arguments);
    };

    return xhr;
  }

  window.XMLHttpRequest = MockXHR;

  const generateXPathWithNearestParentId = (element) => {
    let path = "";
    let nearestParentId = null;

    // Check if the current element's has an ID
    if (element.id) {
      nearestParentId = element.id;
    }

    while (!nearestParentId && element !== document.body && element) {
      const tagName = element.tagName.toLowerCase();
      let index = 1;
      let sibling = element.previousElementSibling;

      while (sibling) {
        if (sibling.tagName.toLowerCase() === tagName) {
          index += 1;
        }
        sibling = sibling.previousElementSibling;
      }

      if (index === 1) {
        path = `/${tagName}${path}`;
      } else {
        path = `/${tagName}[${index}]${path}`;
      }

      // Check if the current element's parent has an ID
      if (element.parentElement && element.parentElement.id) {
        nearestParentId = element.parentElement.id;
        break; // Stop searching when we find the nearest parent with an ID
      }

      element = element.parentElement;
    }

    if (nearestParentId) {
      path = `//*[@id='${nearestParentId}']${path}`;
      return path;
    }
    return null; // No parent with an ID found
  };

  const handleMouseEvent = (type, limit) => (event) => {
    const target = generateXPathWithNearestParentId(event.target);
    const track = {
      id: recordedTracks.length
        ? recordedTracks[recordedTracks.length - 1].id + 1
        : 1,
      type,
      target,
      time: new Date(),
    };
    if (recordedTracks.length > limit + 1) {
      recordedTracks.shift();
    }
    recordedTracks.push(track);
    addTrack(track);
  };

  const handleChange = (limit) => (event) => {
    const prevCommand =
      recordedTracks && recordedTracks.length
        ? recordedTracks[recordedTracks.length - 1]
        : null;
    const target = generateXPathWithNearestParentId(event.target);
    const track = {
      id: recordedTracks.length
        ? recordedTracks[recordedTracks.length - 1].id + 1
        : 1,
      type: "change",
      target,
      value: event.target.value,
      time: new Date(),
    };
    if (recordedTracks.length > limit + 1) {
      recordedTracks.shift();
    }
    if (
      prevCommand &&
      prevCommand.type === "change" &&
      prevCommand.target === target
    ) {
      recordedTracks.pop();
    }
    recordedTracks.push(track);
    addTrack(track);
  };

  const handleDocumentLoad = (limit) => () => {
    let oldHref = document.location.href;
    const body = document.querySelector("body");
    const observer = new MutationObserver((mutations) => {
      if (oldHref !== document.location.href) {
        oldHref = document.location.href;
        const track = {
          id: recordedTracks.length
            ? recordedTracks[recordedTracks.length - 1].id + 1
            : 1,
          type: "url",
          value: oldHref,
          time: new Date(),
        };
        if (recordedTracks.length > limit + 1) {
          recordedTracks.shift();
        }
        recordedTracks.push(track);
        addTrack(track);
      }
    });
    observer.observe(body, { childList: true, subtree: true });
  };

  const clearTracks = () => {
    recordedTracks = [];
  };

  const getAllTracks = () => {
    return recordedTracks;
  };

  const initTracks = (
    initInfo = {
      events: ["click", "change", "url", "dblclick", "contextmenu"],
      limit: 100,
    }
  ) => {
    const { events, limit } = initInfo;
    const mouseEvents = {
      click: handleMouseEvent("click", limit),
      contextmenu: handleMouseEvent("contextmenu", limit),
      dblclick: handleMouseEvent("dblclick", limit),
      mousedown: handleMouseEvent("mousedown", limit),
      mouseenter: handleMouseEvent("mouseenter", limit),
      mouseleave: handleMouseEvent("mouseleave", limit),
      mousemove: handleMouseEvent("mousemove", limit),
      mouseout: handleMouseEvent("mouseout", limit),
      mouseover: handleMouseEvent("mouseover", limit),
      mouseup: handleMouseEvent("mouseup", limit),
    };
    events.forEach((e) => {
      if (e === "url") {
        window.onload = handleDocumentLoad(limit);
      } else if (e === "change") {
        document.addEventListener("input", handleChange(limit));
      } else {
        document.addEventListener(e, mouseEvents[e]);
      }
    });
  };
  initTracks();
})();
