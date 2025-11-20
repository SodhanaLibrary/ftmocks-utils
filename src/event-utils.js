const path = require("path");
const fs = require("fs");
const { getMockDir, nameToFolder } = require("./common-utils");

const injectEventRecordingScript = async (
  page,
  url,
  ftmocksConifg,
  testName
) => {
  console.log("calling injectEventRecordingScript");
  try {
    const eventsFile = path.join(
      getMockDir(ftmocksConifg),
      `test_${nameToFolder(testName)}`,
      `_events.json`
    );
    if (!fs.existsSync(eventsFile)) {
      // Ensure the directory exists before writing the eventsFile
      const dir = path.dirname(eventsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(eventsFile, JSON.stringify([], null, 2));
    }

    const takeScreenshot = async (imgOptions) => {
      if (!ftmocksConifg.recordScreenshots) {
        return;
      }
      const screenshot = await page.screenshot({ fullPage: false });
      const screenshotsDir = path.join(
        getMockDir(ftmocksConifg),
        `test_${nameToFolder(testName)}`,
        "screenshots"
      );
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }
      const screenshotFile = path.join(
        getMockDir(ftmocksConifg),
        `test_${nameToFolder(testName)}`,
        "screenshots",
        `screenshot_${imgOptions.name}.png`
      );
      fs.writeFileSync(screenshotFile, screenshot);
      return screenshotFile;
    };

    // Expose a function to receive click info from the browser
    await page.exposeFunction("saveEventForTest", async (event) => {
      event.id = crypto.randomUUID();
      if (!fs.existsSync(eventsFile)) {
        // Ensure the directory exists before writing the eventsFile
        const dir = path.dirname(eventsFile);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(eventsFile, JSON.stringify([], null, 2));
      }
      const events = JSON.parse(fs.readFileSync(eventsFile, "utf8"));
      if (
        event.type === "input" &&
        events[events.length - 1]?.type === "input"
      ) {
        events[events.length - 1].value = event.value;
        await takeScreenshot({ name: events[events.length - 1].id });
      } else {
        events.push(event);
        await takeScreenshot({ name: event.id });
      }
      fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
    });

    fs.writeFileSync(
      eventsFile,
      JSON.stringify(
        [
          {
            id: crypto.randomUUID(),
            type: "url",
            target: url,
            time: new Date().toISOString(),
            value: url,
          },
        ],
        null,
        2
      )
    );
    await page.addInitScript(() => {
      console.log("calling addInitScript");
      let prevEventSnapshot = null;
      let currentEventSnapshot = null;

      const getAbsoluteXPath = (element) => {
        if (element === document.body) return "/html/body";
        const svgTagNames = [
          "svg",
          "path",
          "rect",
          "circle",
          "ellipse",
          "line",
          "polygon",
          "polyline",
          "text",
          "tspan",
        ];

        let xpath = "";
        for (
          ;
          element && element.nodeType === 1;
          element = element.parentNode
        ) {
          let index = 0;
          let sibling = element;
          while ((sibling = sibling.previousSibling)) {
            if (sibling.nodeType === 1 && sibling.nodeName === element.nodeName)
              index++;
          }
          const tagName = element.nodeName.toLowerCase();
          const position = index ? `[${index + 1}]` : "";
          xpath =
            "/" +
            (svgTagNames.includes(tagName)
              ? `*[local-name()='${tagName}']`
              : tagName) +
            position +
            xpath;
        }

        return xpath;
      };

      const filterElementsFromHtml = (html = "", selector) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        const elements = doc.querySelectorAll(selector);
        return elements;
      };

      const filterXpathElementsFromHtml = (html, xpath) => {
        try {
          const doc = new DOMParser().parseFromString(html, "text/html");
          // The elements variable should be an array, not an XPathResult snapshot. Convert the snapshot to an array of elements.
          const snapshot = doc.evaluate(
            xpath,
            doc,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );
          const elements = [];
          for (let i = 0; i < snapshot.snapshotLength; i++) {
            elements.push(snapshot.snapshotItem(i));
          }
          return elements;
        } catch (error) {
          console.error("Error filtering XPath elements from HTML", {
            error: error.message,
            stack: error.stack,
          });
          return [];
        }
      };

      const getElementsByRank = (elements, mainElement) => {
        const ranksAndIndexes = [];

        for (let i = 0; i < elements.length; i++) {
          // Compare element with mainElement based on attributes and textContent
          let rank = 1;
          const e = elements[i];
          if (e && mainElement) {
            if (e.attributes && mainElement.attributes) {
              if (e.attributes.length !== mainElement.attributes.length) {
                rank =
                  rank +
                  Math.abs(e.attributes.length - mainElement.attributes.length);
              }
              for (let j = 0; j < e.attributes.length; j++) {
                const attrName = e.attributes[j].name;
                if (
                  e.getAttribute(attrName) &&
                  mainElement.getAttribute(attrName) &&
                  e.getAttribute(attrName) !==
                    mainElement.getAttribute(attrName)
                ) {
                  rank = rank + 1;
                }
              }
            }

            if (e.textContent === mainElement.textContent) {
              rank = rank + 1;
            }
            // Compare node depth in the DOM tree
            const getDepth = (node) => {
              let depth = 0;
              let current = node;
              while (current && current.parentNode) {
                depth++;
                current = current.parentNode;
              }
              return depth;
            };

            if (e && mainElement) {
              const eDepth = getDepth(e);
              const mainDepth = getDepth(mainElement);
              rank = rank + Math.abs(eDepth - mainDepth);
            }
          }
          ranksAndIndexes.push({ index: i, rank });
        }
        return ranksAndIndexes.sort((a, b) => a.rank - b.rank);
      };

      const isUniqueXpath = (xpath) => {
        try {
          const elements = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null
          );
          return elements.snapshotLength === 1;
        } catch (error) {
          console.error("Error checking if XPath is unique", {
            error: error.message,
            stack: error.stack,
          });
          return true;
        }
      };
      const getUniqueXpath = (xpath, mainElement) => {
        const prevElements = filterXpathElementsFromHtml(
          prevEventSnapshot,
          xpath
        );
        if (prevElements.snapshotLength > 1 && mainElement) {
          return `(${xpath})[${
            getElementsByRank(prevElements, mainElement)[0].index + 1
          }]`;
        }
        return xpath;
      };

      const getUniqueElementSelectorNth = (selector, mainElement) => {
        const prevElements = filterElementsFromHtml(
          prevEventSnapshot,
          selector
        );
        if (prevElements.length > 1) {
          return getElementsByRank(prevElements, mainElement)[0].index + 1;
        }
        return 1;
      };

      const getSelectorsByConfidence = (selectors) => {
        const selectorCounts = selectors.map((selector) => {
          if (selector.value.startsWith("/")) {
            const prevElements = filterXpathElementsFromHtml(
              prevEventSnapshot,
              selector.value
            );
            const nextElements = filterXpathElementsFromHtml(
              currentEventSnapshot,
              selector.value
            );
            return {
              selector: selector.value,
              type: selector.type,
              count: prevElements.length + nextElements.length,
            };
          } else {
            const prevElements = filterElementsFromHtml(
              prevEventSnapshot,
              selector.value
            );
            const nextElements = filterElementsFromHtml(
              currentEventSnapshot,
              selector.value
            );
            return {
              selector: selector.value,
              type: selector.type,
              count: prevElements.length + nextElements.length,
            };
          }
        });
        const zeroCountSelectors = selectorCounts
          .filter((selector) => selector.count === 0)
          .map((selector) => selector.selector);
        const nonZeroCountSelectors = selectorCounts
          .filter((selector) => selector.count > 0)
          .sort((selObj1, selObj2) => selObj1.count - selObj2.count)
          .map((selObj) => selObj.selector);
        return [...nonZeroCountSelectors, ...zeroCountSelectors];
      };

      const getBestSelectors = (element, event) => {
        const selectors = [];
        const excludeTagNames = ["script", "style", "link", "meta"];
        try {
          const tagName = element.tagName.toLowerCase();
          if (excludeTagNames.includes(tagName)) {
            return selectors;
          }
          if (element.getAttribute("data-testid")) {
            selectors.push({
              type: "locator",
              value: `${tagName}[data-testid='${element.getAttribute(
                "data-testid"
              )}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[data-testid='${element.getAttribute(
                  "data-testid"
                )}']`,
                element
              ),
            });
          }
          if (element.getAttribute("data-id")) {
            selectors.push({
              type: "locator",
              value: `${tagName}[data-id='${element.getAttribute("data-id")}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[data-id='${element.getAttribute("data-id")}']`,
                element
              ),
            });
          }
          if (element.getAttribute("data-action")) {
            selectors.push({
              type: "locator",
              value: `${tagName}[data-action='${element.getAttribute(
                "data-action"
              )}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[data-action='${element.getAttribute(
                  "data-action"
                )}']`,
                element
              ),
            });
          }
          if (element.getAttribute("data-cy")) {
            selectors.push({
              type: "locator",
              value: `${tagName}[data-cy='${element.getAttribute("data-cy")}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[data-cy='${element.getAttribute("data-cy")}']`,
                element
              ),
            });
          }
          if (
            element.name &&
            tagName === "input" &&
            (element.type === "text" || element.type === "password")
          ) {
            selectors.push({
              type: "locator",
              value: `${tagName}[name='${element.name}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[name='${element.name}']`,
                element
              ),
            });
          } else if (
            element.name &&
            tagName === "input" &&
            (element.type === "checkbox" || element.type === "radio")
          ) {
            selectors.push({
              type: "locator",
              value: `${tagName}[name='${element.name}'][value='${element.value}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[name='${element.name}'][value='${element.value}']`,
                element
              ),
            });
          }
          if (element.ariaLabel) {
            selectors.push({
              type: "locator",
              value: `${tagName}[aria-label='${element.ariaLabel}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[aria-label='${element.ariaLabel}']`,
                element
              ),
            });
          }
          if (element.role && element.name) {
            selectors.push({
              type: "locator",
              value: `${tagName}[role='${element.role}'][name='${element.name}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[role='${element.role}'][name='${element.name}']`,
                element
              ),
            });
          }
          if (element.getAttribute("src")) {
            selectors.push({
              type: "locator",
              value: `${tagName}[src='${element.getAttribute("src")}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[src='${element.getAttribute("src")}']`,
                element
              ),
            });
          }
          if (element.getAttribute("href")) {
            selectors.push({
              type: "locator",
              value: `${tagName}[href='${element.getAttribute("href")}']`,
              nth: getUniqueElementSelectorNth(
                `${tagName}[href='${element.getAttribute("href")}']`,
                element
              ),
            });
          }
          const escapedText = element.textContent
            .replace(/'/g, "\\'")
            .replace(/\s+/g, " ")
            .trim();
          if (element.role && element.textContent) {
            selectors.push({
              type: "locator",
              value: getUniqueXpath(
                `//${tagName}[@role='${element.role}' and normalize-space(.) = '${escapedText}']`,
                element
              ),
            });
          }
          if (
            event?.target?.textContent?.length > 0 &&
            event?.target?.textContent?.length < 200
          ) {
            selectors.push({
              type: "locator",
              value: getUniqueXpath(
                `//*[normalize-space(.)='${event.target.textContent
                  .replace(/'/g, "\\'")
                  .replace(/\s+/g, " ")
                  .trim()}']`,
                event.target
              ),
            });
          }
          return selectors;
        } catch (error) {
          console.error("Error getting best selectors", {
            error: error.message,
            stack: error.stack,
          });
          return selectors;
        }
      };

      const generateXPathWithNearestParentId = (element) => {
        const otherIdAttributes = [
          "data-id",
          "data-action",
          "data-testid",
          "data-cy",
          "data-role",
          "data-name",
          "data-label",
        ];
        try {
          let path = "";
          let nearestParentId = null;
          let nearestParentAttribute = null;
          let nearestParentAttributeValue = null;

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

            let nextSibling = element.nextElementSibling;
            let usedNextSibling = false;
            while (nextSibling) {
              if (nextSibling.tagName.toLowerCase() === tagName) {
                usedNextSibling = true;
                break;
              }
              nextSibling = nextSibling.nextElementSibling;
            }

            const svgTagNames = [
              "svg",
              "path",
              "rect",
              "circle",
              "ellipse",
              "line",
              "polygon",
              "polyline",
              "text",
              "tspan",
            ];
            let tempTagName = tagName;
            if (svgTagNames.includes(tagName)) {
              tempTagName = `*[local-name()='${tagName}']`;
            }
            if (index === 1) {
              if (usedNextSibling) {
                path = `/${tempTagName}[1]${path}`;
              } else {
                path = `/${tempTagName}${path}`;
              }
            } else {
              path = `/${tempTagName}[${index}]${path}`;
            }

            // Check if the current element's parent has an ID
            if (element.parentElement && element.parentElement.id) {
              nearestParentId = element.parentElement.id;
              break; // Stop searching when we find the nearest parent with an ID
            } else if (element.parentElement) {
              otherIdAttributes.forEach((attribute) => {
                const parentAttributeValue =
                  element.parentElement.getAttribute(attribute);
                if (
                  parentAttributeValue &&
                  isUniqueXpath(`//*[@${attribute}='${parentAttributeValue}']`)
                ) {
                  nearestParentAttribute = attribute;
                  nearestParentAttributeValue = parentAttributeValue;
                }
              });
              if (nearestParentAttribute && nearestParentAttributeValue) {
                break;
              }
            }

            element = element.parentElement;
          }

          if (nearestParentId) {
            path = `//*[@id='${nearestParentId}']${path}`;
            return path;
          } else if (nearestParentAttribute && nearestParentAttributeValue) {
            path = `//*[@${nearestParentAttribute}='${nearestParentAttributeValue}']${path}`;
            return path;
          }
        } catch (error) {
          console.error("Error generating XPath with nearest parent ID", {
            error: error.message,
            stack: error.stack,
          });
          return null;
        }
      };

      const getParentElementWithEventOrId = (event, eventType) => {
        let target = event.target;
        const clickableTagNames = [
          "button",
          "a",
          "input",
          "option",
          "details",
          "summary",
          "select",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
        ];

        while (target && target !== document) {
          // Check if the target is a clickable element
          // Check for test attributes and accessibility attributes
          const selectors = getBestSelectors(target, event);
          if (selectors.length > 0) {
            return target;
          } else if (target.getAttribute("id")) {
            return target;
          } else if (
            target.getAttribute(eventType) ||
            target[eventType] ||
            target.getAttribute(`on${eventType}`) ||
            target.getAttribute(`${eventType}`) ||
            target.getAttribute(
              `${eventType.charAt(0).toUpperCase() + eventType.slice(1)}`
            )
          ) {
            return target;
          } else if (clickableTagNames.includes(target.tagName.toLowerCase())) {
            return target;
          }
          target = target.parentNode;
        }
        return event.target;
      };

      const getElement = (target) => {
        return {
          tagName: target.tagName,
          textContent:
            target.textContent?.length > 0 && target.textContent?.length < 200
              ? target.textContent
              : null,
          id: target.id,
          role: target.role,
          name: target.name,
          ariaLabel: target.ariaLabel,
          value: target.value,
          type: target.type,
          checked: target.checked,
          selected: target.selected,
          disabled: target.disabled,
          readonly: target.readonly,
          placeholder: target.placeholder,
          title: target.title,
          href: target.getAttribute("href"),
          src: target.getAttribute("src"),
          alt: target.alt,
        };
      };

      const getXpathsIncluded = (selectors, currentTarget, event) => {
        selectors.push({
          type: "locator",
          value: generateXPathWithNearestParentId(currentTarget),
        });
        selectors.push({
          type: "locator",
          value: getAbsoluteXPath(event.target),
        });
      };

      document.addEventListener("click", (event) => {
        console.log('calling document.addEventListener("click")');
        currentEventSnapshot = document.documentElement.innerHTML;
        const currentTarget = getParentElementWithEventOrId(event, "onclick");
        const selectors = getBestSelectors(currentTarget, event);
        getXpathsIncluded(selectors, currentTarget, event);
        window.saveEventForTest({
          type: "click",
          target: selectors[0].value,
          time: new Date().toISOString(),
          value: {
            clientX: event.clientX,
            clientY: event.clientY,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
          },
          selectors,
          element: getElement(currentTarget),
        });
        prevEventSnapshot = currentEventSnapshot;
      });
      document.addEventListener("dblclick", (event) => {
        currentEventSnapshot = document.documentElement.innerHTML;
        const currentTarget = getParentElementWithEventOrId(
          event,
          "ondblclick"
        );
        const selectors = getBestSelectors(currentTarget, event);
        getXpathsIncluded(selectors, currentTarget, event);
        window.saveEventForTest({
          type: "dblclick",
          target: selectors[0].value,
          time: new Date().toISOString(),
          value: {
            clientX: event.clientX,
            clientY: event.clientY,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
          },
          selectors,
          element: getElement(currentTarget),
        });
      });
      document.addEventListener("contextmenu", (event) => {
        currentEventSnapshot = document.documentElement.innerHTML;
        const currentTarget = getParentElementWithEventOrId(
          event,
          "oncontextmenu"
        );
        const selectors = getBestSelectors(currentTarget, event);
        getXpathsIncluded(selectors, currentTarget, event);
        window.saveEventForTest({
          type: "contextmenu",
          target: selectors[0].value,
          time: new Date().toISOString(),
          value: {
            clientX: event.clientX,
            clientY: event.clientY,
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
          },
          selectors,
          element: getElement(currentTarget),
        });
      });
      document.addEventListener("input", (event) => {
        currentEventSnapshot = document.documentElement.innerHTML;
        const currentTarget = getParentElementWithEventOrId(event, "oninput");
        const selectors = getBestSelectors(currentTarget, event);
        getXpathsIncluded(selectors, currentTarget, event);
        if (event.target && event.target.tagName === "INPUT") {
          window.saveEventForTest({
            type: "input",
            target: selectors[0].value,
            time: new Date().toISOString(),
            value: event.target.value,
            selectors,
            element: getElement(currentTarget),
          });
        }
      });
      document.addEventListener("keypress", (event) => {
        if (
          event.key === "Enter" ||
          event.key === "Tab" ||
          event.key === "Escape" ||
          event.key === "Backspace" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight"
        ) {
          currentEventSnapshot = document.documentElement.innerHTML;
          const currentTarget = getParentElementWithEventOrId(event, "oninput");
          const selectors = getBestSelectors(currentTarget, event);
          getXpathsIncluded(selectors, currentTarget, event);
          window.saveEventForTest({
            type: "keypress",
            key: event.key,
            code: event.code,
            target: selectors[0].value,
            time: new Date().toISOString(),
            value: {
              clientX: event.clientX,
              clientY: event.clientY,
              windowWidth: window.innerWidth,
              windowHeight: window.innerHeight,
            },
            selectors,
            element: getElement(currentTarget),
          });
        }
      });
      // document.addEventListener('change', (event) => {
      //   const currentTarget = getParentElementWithEventOrId(event, 'onchange');
      //   window.saveEventForTest({
      //     type: 'change',
      //     target: generateXPathWithNearestParentId(currentTarget),
      //     time: new Date().toISOString(),
      //     value: event.target.value,
      //     selectors: getBestSelectors(currentTarget),
      //     element: getElement(currentTarget),
      //   });
      // });
      // document.addEventListener('submit', (event) => {
      //   event.preventDefault();
      //   const currentTarget = getParentElementWithEventOrId(event, 'onsubmit');
      //   const formData = new FormData(event.target);
      //   const entries = {};
      //   formData.forEach((value, key) => {
      //     entries[key] = value;
      //   });
      //   window.saveEventForTest({
      //     type: 'submit',
      //     target: generateXPathWithNearestParentId(currentTarget),
      //     time: new Date().toISOString(),
      //     value: entries,
      //     selectors: getBestSelectors(currentTarget),
      //     element: getElement(currentTarget),
      //   });
      // });
      window.addEventListener("popstate", () => {
        window.saveEventForTest({
          type: "popstate-url",
          target: window.location.pathname,
          time: new Date().toISOString(),
          value: window.location.href,
        });
      });

      // Also track URL changes via history API
      const originalPushState = window.history.pushState;
      window.history.pushState = function () {
        originalPushState.apply(this, arguments);
        window.saveEventForTest({
          type: "pushstate-url",
          target: window.location.pathname,
          time: new Date().toISOString(),
          value: window.location.href,
        });
      };

      const originalReplaceState = window.history.replaceState;
      window.history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        window.saveEventForTest({
          type: "replacestate-url",
          target: window.location.pathname,
          time: new Date().toISOString(),
          value: window.location.href,
        });
      };
    });
    console.log("injectEventRecordingScript completed");
  } catch (error) {
    console.error("Error injecting event recording script", {
      error: error.message,
      stack: error.stack,
    });
  }
};

module.exports = {
  injectEventRecordingScript,
};
