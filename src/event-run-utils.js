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

  // Inject keyboard listener into browser
  await page.addInitScript(() => {
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        console.log("➡ ArrowRight key pressed!");
        window.nextEvent();
      }
    });
  });

  await runEvent(page, events[0]);
};

module.exports = {
  runEvents,
  runEventsForTest,
  runEventsInPresentationMode,
  runEvent,
};
