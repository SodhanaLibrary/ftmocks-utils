const path = require("path");
const fs = require("fs");
const { getMockDir, nameToFolder } = require("./common-utils");

const getLocator = async (page, event) => {
  // Check if the event.target exists on the page before returning it.
  console.log("➡ Getting locator for event", event);
  if (event && event.target && typeof page !== "undefined" && page.locator) {
    let locator = null;
    while (!locator) {
      const selector = event.target.startsWith("/")
        ? `xpath=${event.target}`
        : event.target;
      try {
        const count = await page.locator(selector).count();
        if (count === 1) {
          locator = selector;
        } else {
          for (let i = 0; i < event.selectors.length; i++) {
            const selector = event.selectors[i].value.startsWith("/")
              ? `xpath=${event.selectors[i].value}`
              : event.selectors[i].value;
            const count = await page.locator(selector).count();
            if (count === 1) {
              locator = selector;
            }
          }
        }
      } catch (error) {
        console.error("Error getting locator", error, selector);
      }
      console.log("➡ Waiting for locator", event);
      await page.waitForTimeout(500);
    }
    return locator;
  }
  return event.target;
};

const getSelectorPosition = async (page, selector) => {
  const element = await page.locator(selector).elementHandle();
  const position = await element.boundingBox();
  console.log("position", position);
  return position;
};

const runEvent = async ({
  page,
  event,
  delay = 0,
  screenshots = false,
  screenshotsDir = null,
}) => {
  try {
    console.log("➡ Running event", event);
    const beforeEvent = async () => {
      await page.waitForTimeout(delay);
      if (screenshots) {
        const locator = await getLocator(page, event);
        const position = await getSelectorPosition(page, locator);
        event.screenshotInfo = {
          name: `${event.id}.png`,
          position,
        };
        await page.screenshot({
          path: path.join(screenshotsDir, `${event.id}.png`),
          fullPage: false,
        });
      }
    };
    switch (event.type) {
      case "url":
        await page.goto(event.value);
        break;
      case "click":
        await beforeEvent();
        await page.click(await getLocator(page, event));
        break;
      case "input":
        await beforeEvent();
        await page.fill(await getLocator(page, event), event.value);
        break;
      case "keypress":
        await beforeEvent();
        await page.keyboard.press(await getLocator(page, event), event.key);
        break;
      case "change":
        await beforeEvent();
        await page.select(await getLocator(page, event), event.value);
        break;
      case "url":
        await beforeEvent();
        await page.goto(await getLocator(page, event), event.value);
        break;
      case "dblclick":
        await beforeEvent();
        await page.dblclick(await getLocator(page, event));
        break;
      case "contextmenu":
        await beforeEvent();
        await page.contextmenu(await getLocator(page, event));
        break;
      case "hover":
        await beforeEvent();
        await page.hover(await getLocator(page, event));
        break;
      case "keydown":
        await beforeEvent();
        await page.keyboard.down(await getLocator(page, event), event.key);
        break;
      case "keyup":
        await beforeEvent();
        await page.keyboard.up(await getLocator(page, event), event.key);
        break;
      default:
        return "Unsupported event type";
    }
  } catch (error) {
    console.error("Error running event", {
      error: error.message,
      stack: error.stack,
    });
  }
};

const isValidEvent = (event) => {
  try {
    console.log("➡ Validating event", event);
    switch (event?.type) {
      case "click":
        return true;
      case "input":
        return true;
      case "keypress":
        return true;
      case "change":
        return true;
      case "dblclick":
        return true;
      case "contextmenu":
        return true;
      case "hover":
        return true;
      case "keydown":
        return true;
      case "keyup":
        return true;
      default:
        return false;
    }
  } catch (error) {
    console.error("Error running event", {
      error: error.message,
      stack: error.stack,
    });
  }
  return false;
};

const runEvents = async ({
  page,
  events,
  delay = 1000,
  screenshots = false,
  screenshotsDir = null,
}) => {
  for (const event of events) {
    await runEvent({ page, event, delay, screenshots, screenshotsDir });
  }
};

const runEventsForTest = async (page, ftmocksConifg, testName) => {
  const eventsFile = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    `_events.json`
  );
  const events = JSON.parse(fs.readFileSync(eventsFile, "utf8"));
  await runEvents({
    page,
    events,
    delay: ftmocksConifg.delay || 1000,
    screenshots: false,
  });
};

const runEventsInPresentationMode = async (page, ftmocksConifg, testName) => {
  let currentEventIndex = 1;
  const eventsFile = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    `_events.json`
  );
  const events = JSON.parse(fs.readFileSync(eventsFile, "utf8"));

  // Expose Node function
  await page.exposeFunction("nextEvent", async () => {
    console.log("➡ Next event triggered!");
    if (currentEventIndex === events.length) {
      console.log("➡ No more events to run!");
      return false;
    }
    let result = await runEvent({ page, event: events[currentEventIndex] });
    while (result === "Unsupported event type") {
      currentEventIndex = currentEventIndex + 1;
      result = await runEvent({ page, event: events[currentEventIndex] });
    }
    currentEventIndex = currentEventIndex + 1;
    return true;
  });

  await page.exposeFunction("focusOnBodyForPresentationMode", async () => {
    await page.bringToFront();
  });

  await page.exposeFunction("playwrightPageClose", async () => {
    await page.close();
  });

  // Inject keyboard listener into browser
  await page.addInitScript(() => {
    window.addEventListener("load", async () => {
      console.log("➡ focus on body for presentation mode");
      await window.focusOnBodyForPresentationMode();
      window.focus();
      document.body.focus();
    });
    window.addEventListener("keydown", async (e) => {
      console.log("➡ keydown event triggered!", e);
      if (e.key === "Shift" && !e.repeat) {
        e.preventDefault();
        const result = await window.nextEvent();
        if (!result) {
          console.log("➡ No more events to run!");
          await window.playwrightPageClose();
        }
      }
    });
  });

  await runEvent({ page, event: events[0] });
};

const runEventsInTrainingMode = async (page, ftmocksConifg, testName) => {
  const executedEvents = [];
  const eventsFile = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    `_events.json`
  );
  const events = JSON.parse(fs.readFileSync(eventsFile, "utf8"));

  // Expose Node function
  await page.exposeFunction("getNextEvent", async () => {
    let result = false;
    let nonExecutedEvents = events.filter(
      (event) => !executedEvents.includes(event?.id)
    );
    let currentEventIndex = -1;
    while (!result) {
      currentEventIndex = currentEventIndex + 1;
      if (currentEventIndex === nonExecutedEvents.length) {
        console.log("➡ No more events to validate!");
        return;
      }
      result = isValidEvent(nonExecutedEvents[currentEventIndex]);
    }
    if (nonExecutedEvents[currentEventIndex]) {
      console.log(
        "➡ Getting locator for event",
        nonExecutedEvents[currentEventIndex]
      );
      const selector = await getLocator(
        page,
        nonExecutedEvents[currentEventIndex]
      );
      const position = await getSelectorPosition(page, selector);
      const element = await page.locator(selector).elementHandle();
      return {
        event: nonExecutedEvents[currentEventIndex],
        selector,
        position,
        element,
      };
    }
    return null;
  });

  await page.exposeFunction("addExecutedEvent", (eventId) => {
    executedEvents.push(eventId);
  });

  await page.exposeFunction("playwrightPageClose", async () => {
    await page.close();
  });

  // Inject keyboard listener into browser
  await page.addInitScript(async () => {
    let currentEventInfo = null;
    // Create and style the popover
    const popover = document.createElement("div");
    popover.id = "ftmocks-popover-training-mode";
    popover.style.position = "absolute";
    popover.style.top = "0";
    popover.style.left = "0";
    popover.style.minWidth = "100px";
    popover.style.height = "58px";
    popover.style.background = "rgba(40,40,40,0.97)";
    popover.style.color = "#fff";
    popover.style.display = "none";
    popover.style.zIndex = "99999";
    popover.style.fontFamily = "sans-serif";
    popover.style.fontSize = "16px";
    popover.style.textAlign = "center";
    popover.style.lineHeight = "1.5";
    popover.style.padding = "16px 24px";
    popover.style.borderRadius = "8px";
    popover.style.boxShadow = "0 2px 12px rgba(0,0,0,0.25)";

    // Success Training Popover
    const successPopover = document.createElement("div");
    successPopover.id = "ftmocks-success-popover-training-mode";
    successPopover.style.position = "fixed";
    successPopover.style.top = "32px";
    successPopover.style.left = "50%";
    successPopover.style.transform = "translateX(-50%)";
    successPopover.style.minWidth = "120px";
    successPopover.style.height = "46px";
    successPopover.style.background = "rgba(60,180,75,0.98)";
    successPopover.style.color = "#fff";
    successPopover.style.display = "none";
    successPopover.style.zIndex = "100000";
    successPopover.style.fontFamily = "sans-serif";
    successPopover.style.fontSize = "16px";
    successPopover.style.textAlign = "center";
    successPopover.style.lineHeight = "1.4";
    successPopover.style.padding = "12px 32px";
    successPopover.style.borderRadius = "8px";
    successPopover.style.boxShadow = "0 2px 12px rgba(0,0,0,0.20)";
    successPopover.textContent = "✅ Training Success!";

    // Utility to show the success popover for a short period
    function showSuccessPopover(message = "✅ Training Success!") {
      successPopover.textContent = message;
      if (!document.getElementById("ftmocks-success-popover-training-mode")) {
        document.body.appendChild(successPopover);
      }
      successPopover.style.display = "block";
      setTimeout(() => {
        successPopover.style.display = "none";
        document
          .getElementById("ftmocks-success-popover-training-mode")
          ?.remove();
        window.playwrightPageClose();
      }, 3000);
    }

    const highlighter = document.createElement("div");
    highlighter.id = "ftmocks-highlighter-training-mode";
    highlighter.style.position = "absolute";
    highlighter.style.top = "0";
    highlighter.style.left = "0";
    highlighter.style.width = "100%";
    highlighter.style.height = "100%";
    highlighter.style.background = "rgba(0,0,0,0.5)";
    highlighter.style.border = "2px solid #3fa9f5";
    highlighter.style.display = "none";
    highlighter.style.pointerEvents = "none";
    highlighter.style.zIndex = "99999";

    function showPopover(eventInfo) {
      console.log("➡ Showing popover", eventInfo);
      window.addExecutedEvent(eventInfo.event.id);
      if (!document.getElementById("ftmocks-popover-training-mode")) {
        document.body.appendChild(popover);
      }
      popover.textContent = eventInfo.event.type;
      popover.style.display = "block";
      popover.style.left =
        eventInfo.position.x + eventInfo.position.width / 2 + "px";
      popover.style.top =
        eventInfo.position.y + eventInfo.position.height + "px";

      // Show highlighter
      if (!document.getElementById("ftmocks-highlighter-training-mode")) {
        document.body.appendChild(highlighter);
      }
      highlighter.style.display = "block";
      highlighter.style.left = eventInfo.position.x + "px";
      highlighter.style.top = eventInfo.position.y + "px";
      highlighter.style.width = eventInfo.position.width + "px";
      highlighter.style.height = eventInfo.position.height + "px";
    }

    function hidePopover() {
      popover.style.display = "none";
      highlighter.style.display = "none";
      document.getElementById("ftmocks-popover-training-mode")?.remove();
      document.getElementById("ftmocks-highlighter-training-mode")?.remove();
      showSuccessPopover("✅ Training Success!");
    }

    const initialEventRun = async () => {
      currentEventInfo = await window.getNextEvent();
      if (currentEventInfo) {
        showPopover(currentEventInfo);
      }
    };

    const showNextEvent = async () => {
      currentEventInfo = await window.getNextEvent();
      if (currentEventInfo) {
        showPopover(currentEventInfo);
      } else {
        hidePopover();
      }
    };

    const matchElement = (event, currentEventInfo) => {
      const inBoudingBox =
        currentEventInfo?.position?.x <= event.clientX &&
        currentEventInfo?.position?.x + currentEventInfo?.position?.width >=
          event.clientX &&
        currentEventInfo?.position?.y <= event.clientY &&
        currentEventInfo?.position?.y + currentEventInfo?.position?.height >=
          event.clientY;
      console.log("➡ In bounding box?", inBoudingBox);
      const matchingElement =
        currentEventInfo?.element?.isEqualNode(event.target) ||
        currentEventInfo?.element?.contains(event.target);
      return inBoudingBox || matchingElement;
    };

    window.addEventListener("load", async () => {
      await initialEventRun();
    });

    window.addEventListener("click", async (event) => {
      if (
        currentEventInfo?.event?.type === "click" &&
        matchElement(event, currentEventInfo)
      ) {
        console.log("➡ Click event triggered!", event);
        showNextEvent();
      }
    });
    window.addEventListener("dblclick", async (event) => {
      if (
        currentEventInfo?.event?.type === "dblclick" &&
        matchElement(event, currentEventInfo)
      ) {
        showNextEvent();
      }
    });
    window.addEventListener("contextmenu", async (event) => {
      if (
        currentEventInfo?.event?.type === "contextmenu" &&
        matchElement(event, currentEventInfo)
      ) {
        showNextEvent();
      }
    });
    window.addEventListener("input", async (event) => {
      if (
        currentEventInfo?.event?.type === "input" &&
        matchElement(event, currentEventInfo)
      ) {
        showNextEvent();
      }
    });
    window.addEventListener("keypress", async (event) => {
      if (
        currentEventInfo?.event?.type === "keypress" &&
        matchElement(event, currentEventInfo)
      ) {
        showNextEvent();
      }
    });
  });

  await runEvent({ page, event: events[0] });
};

const runEventsForScreenshots = async (page, ftmocksConifg, testName) => {
  const eventsFile = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    `_events.json`
  );
  const events = JSON.parse(fs.readFileSync(eventsFile, "utf8"));
  await runEvents({
    page,
    events,
    delay: ftmocksConifg.delay || 1000,
    screenshots: true,
    screenshotsDir: path.join(
      getMockDir(ftmocksConifg),
      `test_${nameToFolder(testName)}`,
      `screenshots`
    ),
  });
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
  await page.waitForTimeout(1000);
  await page.close();
};

module.exports = {
  runEvents,
  runEventsForTest,
  runEventsInPresentationMode,
  runEventsInTrainingMode,
  runEventsForScreenshots,
  runEvent,
};
