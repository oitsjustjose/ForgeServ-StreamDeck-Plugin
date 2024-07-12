/// <reference path="libs/js/action.js" />
/// <reference path="libs/js/stream-deck.js" />

const myAction = new Action('net.forgeserv.api.action');

const UNSET = -1;
const preferencesByCtx = {};

let overrideIndicesByCtx = {};
// Storage of the current program loop's timeout for on kill
let processTimeoutIdsByCtx = {};
// Storage of the current timeout when _temporarily_ setting the index to something else.
let rerenderTimeoutIdsByCtx = {};
// The current dataset -- used to prevent refetching all the time where possible.
let dataCache = [];

/**
 * Grabs the current API data, caches it, and then sets a timeout to infinitely repeat.
 * @param {string} context The required Action contextId
 * @returns {null}
 */
const process = async (context) => {
  const resp = await fetch('https://api.forgeserv.net');
  if (resp.status != 200) return;

  dataCache = await resp.json();
  rerender(context);

  processTimeoutIdsByCtx[context] = setTimeout(() => process(context), 1000 * preferencesByCtx[context].refreshFrequency);
};

/**
 * Parses each int value in the provided object
 * @param {Object} settings 
  * @param {string} context The action's context
 */
const onSettingsUpdated = (settings, context) => {
  const newPrefs = {
    serverIdx: safeParseInt(settings.serverIdx),
    resetTimeout: safeParseFloat(settings.resetTimeout),
    refreshFrequency: safeParseFloat(settings.refreshFrequency),
  };

  preferencesByCtx[context] = newPrefs;
  console.log(preferencesByCtx);
};

/**
 * Re-renders the Stream Deck's button with new info
 * @param {string} context The action's context
 * @returns {null}
 */
const rerender = context => {
  const usedIndex = overrideIndicesByCtx[context] > UNSET ? overrideIndicesByCtx[context] : clamp(preferencesByCtx[context].serverIdx);
  const server = dataCache[usedIndex];
  if (!server) return;

  $SD.setFeedback(context, {
    title: server.name,
    value: parseInt(server.online) === 0 ? "Empty" : `${server.online} of ${server.max}`,
    icon: `data:image/png;base64,${server.icon}`,
  });
};

/**
 * Clamps a given index to be no less than 0 and no more than dataCache.length
 * @param {Number} index 
 */
const clamp = index => {
  return index > dataCache.length - 1 ? dataCache.length - 1 : index < 0 ? 0 : index;
};

/**
 * Returns 0 if the value is evaluated as NaN, the parsed value otherwise
 * @param {Number} value 
 * @returns {Number}
 */
const safeParseInt = value => {
  const tmp = parseInt(value);
  if (Number.isNaN(tmp)) return 0;
  return tmp;
};

/**
 * Returns 0.0 if the value is evaluated as NaN, the parsed value otherwise
 * @param {Number} value 
 * @returns {Number}
 */
const safeParseFloat = value => {
  const tmp = parseFloat(value);
  if (Number.isNaN(tmp)) return 0.0;
  return tmp;
};

// BEGIN REGION: EVENT HANDLERS

myAction.onWillAppear(({ context, payload }) => {
  overrideIndicesByCtx[context] = UNSET;
  processTimeoutIdsByCtx[context] = UNSET;
  rerenderTimeoutIdsByCtx[context] = UNSET;

  onSettingsUpdated(payload.settings, context);
  process(context);
});

myAction.onWillDisappear(({ context }) => {
  processTimeoutIdsByCtx[context] > UNSET && clearTimeout(processTimeoutIdsByCtx[context]);
  rerenderTimeoutIdsByCtx[context] > UNSET && clearTimeout(rerenderTimeoutIdsByCtx[context]);
});

myAction.onSendToPlugin(({ payload, context }) => {
  onSettingsUpdated(payload.value, context);
  rerender(context);
});

myAction.onDialRotate(({ payload, context }) => {
  if (!payload || !payload.ticks) return;

  // It makes sense from a user perspective to start scrolling from where you are _now_
  if (overrideIndicesByCtx[context] === UNSET) {
    overrideIndicesByCtx[context] = preferencesByCtx[context].serverIdx;
  }

  overrideIndicesByCtx[context] = clamp(overrideIndicesByCtx[context] + payload.ticks);
  rerender(context);

  if (rerenderTimeoutIdsByCtx > UNSET) {
    // Don't back-queue additional "reprocesses"
    clearTimeout(rerenderTimeoutIdsByCtx);
  }

  rerenderTimeoutIdsByCtx[context] = setTimeout(() => {
    overrideIndicesByCtx[context] = UNSET;
    rerenderTimeoutIdsByCtx[context] = UNSET;
    rerender(context);
  }, 1000 * preferencesByCtx[context].resetTimeout);
});

// END REGION: EVENT HANDLERS