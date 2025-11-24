const path = require("path");
const fs = require("fs");
const { getMockDir, nameToFolder } = require("./common-utils");

const getLocator = async (page, event) => {
  // Check if the event.target exists on the page before returning it.
  if (event && event.target && typeof page !== "undefined" && page.locator) {
    const count = await page.locator(event.target).count();
    if (count === 1) {
      return event.target;
    } else {
      await page.waitForTimeout(1000);
      for (let i = 0; i < event.selectors.length; i++) {
        const count = await page.locator(event.selectors[i].value).count();
        if (count === 1) {
          return event.selectors[i].value;
        }
      }
    }
  }
  return event.target;
};

const runEvent = async (page, event, delay = 0) => {
  try {
    console.log("➡ Running event", event);
    switch (event.type) {
      case "url":
        await page.goto(event.value);
        break;
      case "click":
        await page.waitForTimeout(delay);
        await page.click(await getLocator(page, event));
        break;
      case "input":
        await page.waitForTimeout(delay);
        await page.fill(await getLocator(page, event), event.value);
        break;
      case "keypress":
        await page.waitForTimeout(delay);
        await page.keyboard.press(await getLocator(page, event), event.key);
        break;
      case "change":
        await page.waitForTimeout(delay);
        await page.select(await getLocator(page, event), event.value);
        break;
      case "url":
        await page.waitForTimeout(delay);
        await page.goto(await getLocator(page, event), event.value);
        break;
      case "dblclick":
        await page.waitForTimeout(delay);
        await page.dblclick(await getLocator(page, event));
        break;
      case "contextmenu":
        await page.waitForTimeout(delay);
        await page.contextmenu(await getLocator(page, event));
        break;
      case "hover":
        await page.waitForTimeout(delay);
        await page.hover(await getLocator(page, event));
        break;
      case "keydown":
        await page.waitForTimeout(delay);
        await page.keyboard.down(await getLocator(page, event), event.key);
        break;
      case "keyup":
        await page.waitForTimeout(delay);
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
      case "url":
        return true;
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

const runEvents = async (page, events, delay = 1000) => {
  for (const event of events) {
    await runEvent(page, event, delay);
  }
};

const runEventsForTest = async (page, ftmocksConifg, testName) => {
  const eventsFile = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    `_events.json`
  );
  const events = JSON.parse(fs.readFileSync(eventsFile, "utf8"));
  await runEvents(page, events, ftmocksConifg.delay || 1000);
};

const getSelectorPosition = async (page, selector) => {
  const element = await page.locator(selector).elementHandle();
  const position = await element.boundingBox();
  console.log("position", position);
  return position;
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
      return;
    }
    let result = await runEvent(page, events[currentEventIndex]);
    while (result === "Unsupported event type") {
      currentEventIndex = currentEventIndex + 1;
      result = await runEvent(page, events[currentEventIndex]);
    }
    currentEventIndex = currentEventIndex + 1;
  });

  await page.exposeFunction("focusOnBodyForPresentationMode", async () => {
    await page.bringToFront();
  });

  // Inject keyboard listener into browser
  await page.addInitScript(() => {
    window.addEventListener("load", async () => {
      console.log("➡ focus on body for presentation mode");
      await window.focusOnBodyForPresentationMode();
      window.focus();
      document.body.focus();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        console.log("➡ ArrowRight key pressed!");
        window.nextEvent();
      }
    });
  });

  await runEvent(page, events[0]);
};

const runEventsInTrainingMode = async (page, ftmocksConifg, testName) => {
  let currentEventIndex = 0;
  const eventsFile = path.join(
    getMockDir(ftmocksConifg),
    `test_${nameToFolder(testName)}`,
    `_events.json`
  );
  const events = JSON.parse(fs.readFileSync(eventsFile, "utf8"));

  // Expose Node function
  await page.exposeFunction("getNextEvent", async () => {
    let result = false;
    while (!result) {
      currentEventIndex = currentEventIndex + 1;
      if (currentEventIndex === events.length) {
        console.log("➡ No more events to validate!");
        return;
      }
      result = isValidEvent(events[currentEventIndex]);
    }
    if (events[currentEventIndex]) {
      const selector = await getLocator(page, events[currentEventIndex]);
      const position = await getSelectorPosition(page, selector);
      const element = await page.locator(selector).elementHandle();
      return {
        event: events[currentEventIndex],
        selector,
        position,
        element,
      };
    }
    return null;
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

    function showPopover(eventInfo) {
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
    }

    const initialEventRun = async () => {
      currentEventInfo = await window.getNextEvent();
      if (currentEventInfo) {
        showPopover(currentEventInfo);
      }
    };

    const matchElement = (event, currentEventInfo) => {
      console.log(
        "➡ Matching element!",
        event.target.isEqualNode(currentEventInfo?.element),
        currentEventInfo?.element?.contains(event.target)
      );
      return (
        event.target.isEqualNode(currentEventInfo?.element) ||
        currentEventInfo?.element?.contains(event.target)
      );
    };

    window.addEventListener("load", async () => {
      await initialEventRun();
    });

    window.addEventListener("click", async (event) => {
      console.log(
        "➡ Click event triggered!",
        event.target.isEqualNode(currentEventInfo?.element),
        currentEventInfo?.element?.contains(event.target)
      );
      if (
        currentEventInfo?.event?.type === "click" &&
        matchElement(event, currentEventInfo)
      ) {
        currentEventInfo = await window.getNextEvent();
        if (currentEventInfo) {
          showPopover(currentEventInfo);
        } else {
          hidePopover();
        }
      }
    });
    window.addEventListener("dblclick", async (event) => {
      if (
        currentEventInfo?.event?.type === "dblclick" &&
        matchElement(event, currentEventInfo)
      ) {
        currentEventInfo = await window.getNextEvent();
        if (currentEventInfo) {
          showPopover(currentEventInfo);
        } else {
          hidePopover();
        }
      }
    });
    window.addEventListener("contextmenu", async (event) => {
      if (
        currentEventInfo?.event?.type === "contextmenu" &&
        matchElement(event, currentEventInfo)
      ) {
        currentEventInfo = await window.getNextEvent();
        if (currentEventInfo) {
          showPopover(currentEventInfo);
        } else {
          hidePopover();
        }
      }
    });
    window.addEventListener("input", async (event) => {
      if (
        currentEventInfo?.event?.type === "input" &&
        matchElement(event, currentEventInfo)
      ) {
        currentEventInfo = await window.getNextEvent();
        if (currentEventInfo) {
          showPopover(currentEventInfo);
        }
      }
    });
    window.addEventListener("keypress", async (event) => {
      if (
        currentEventInfo?.event?.type === "keypress" &&
        matchElement(event, currentEventInfo)
      ) {
        currentEventInfo = await window.getNextEvent();
        if (currentEventInfo) {
          showPopover(currentEventInfo);
        }
      }
    });
  });

  await runEvent(page, events[0]);
};

module.exports = {
  runEvents,
  runEventsForTest,
  runEventsInPresentationMode,
  runEventsInTrainingMode,
  runEvent,
};
