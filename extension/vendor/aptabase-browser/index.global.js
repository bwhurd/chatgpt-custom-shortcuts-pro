/*! @aptabase/browser v0.1.2 | MIT | https://github.com/aptabase/aptabase-js */
(() => {
  "use strict";

  const isWeb = "document" in globalThis;
  let appKey = "";
  let options = {};

  const getUserAgent = () => globalThis.navigator?.userAgent || "";
  const getLocale = () => globalThis.navigator?.language || "";
  const getOsName = () => {
    const userAgent = getUserAgent();
    if (/Macintosh/i.test(userAgent)) return "macOS";
    if (/Windows/i.test(userAgent)) return "Windows";
    if (/Linux/i.test(userAgent)) return "Linux";
    if (/CrOS/i.test(userAgent)) return "Chrome OS";
    if (/Android/i.test(userAgent)) return "Android";
    if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
    return "Unknown";
  };
  const getPreferredUrl = () => {
    const region = appKey.split("-")[1];
    if (region === "EU") return "https://eu.aptabase.com";
    if (region === "SH") return options.host;
    return "https://us.aptabase.com";
  };
  const isDebug = () => options.isDebug ?? globalThis.process?.env?.NODE_ENV !== "production";
  const buildEvent = (eventName, props) => {
    return {
      timestamp: new Date().toISOString(),
      sessionId: options.sessionId,
      eventName,
      systemProps: {
        isDebug: isDebug(),
        locale: getLocale(),
        osName: getOsName(),
        sdkVersion: "aptabase-js@0.1.2",
        appVersion: options.appVersion || "",
      },
      props,
    };
  };
  const sendEvent = async (payload) => {
    if (isDebug()) {
      console.log("[Aptabase]", payload.eventName, payload.props);
    }
    const baseUrl = getPreferredUrl();
    const response = await fetch(`${baseUrl}/api/v0/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "App-Key": appKey,
      },
      body: JSON.stringify([payload]),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to send event: ${response.status}`);
    }
  };
  const isString = (value) => typeof value === "string" || value instanceof String;
  const isValidKey = (key) => {
    const parts = key.split("-");
    return parts.length === 3 && parts[0] === "A" && ["EU", "US", "SH"].includes(parts[1]);
  };
  const validateKey = (key) => {
    if (!isString(key)) {
      throw new Error("App Key must be a string.");
    }
    if (!isValidKey(key)) {
      throw new Error(`Invalid App Key '${key}'`);
    }
  };
  const getRandomValues = (array) => {
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(array);
      return array;
    }
    for (let index = 0; index < array.length; index += 1) {
      array[index] = Math.floor(Math.random() * 256);
    }
    return array;
  };
  const createSessionId = () => {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (char) => {
      return (char ^ (getRandomValues(new Uint8Array(1))[0] & (15 >> (char / 4)))).toString(16);
    });
  };
  const init = async (key, initOptions = {}) => {
    if (isWeb) {
      const scriptElement = document.querySelector("[aptabase-app-key]");
      if (scriptElement) {
        key = scriptElement.getAttribute("aptabase-app-key") || key;
      }
    }

    validateKey(key);
    appKey = key;

    const extensionInfo = globalThis.chrome?.management?.getSelf
      ? await globalThis.chrome.management.getSelf()
      : null;

    options = {
      ...initOptions,
      isDebug: initOptions?.isDebug ?? extensionInfo?.installType === "development",
      sessionId: createSessionId(),
    };
  };
  const trackEvent = async (eventName, props = {}) => {
    if (!isString(eventName)) {
      throw new Error("Event name must be a string.");
    }
    if (!appKey) {
      throw new Error("Aptabase init must be called before trackEvent.");
    }

    await sendEvent(buildEvent(eventName, props));
  };

  globalThis.aptabase = { init, trackEvent };
})();
