// Background script — classic non-module script
// Tests if browser API is available here, and listens for messages from popup

console.log('[hello-world] background loaded');
console.log('[hello-world] typeof browser:', typeof browser);
console.log('[hello-world] typeof chrome:', typeof chrome);

var hasBrowser = typeof browser !== 'undefined' && browser && browser.runtime;
var hasChrome  = typeof chrome  !== 'undefined' && chrome  && chrome.runtime;

console.log('[hello-world] hasBrowser:', hasBrowser, '| hasChrome:', hasChrome);

var api = hasBrowser ? browser : (hasChrome ? chrome : null);

// Write result into extension storage so popup can read it (if storage works)
// Also write to a shared localStorage key as a fallback signal
try {
  localStorage.setItem('hw_bg_loaded', JSON.stringify({
    hasBrowser: !!hasBrowser,
    hasChrome:  !!hasChrome,
    ts: Date.now(),
  }));
} catch(e) {}

if (api && api.storage) {
  api.storage.local.set({
    hw_bg_loaded: true,
    hw_hasBrowser: !!hasBrowser,
    hw_hasChrome:  !!hasChrome,
    hw_ts: Date.now(),
  }).then(function() {
    console.log('[hello-world] wrote to storage');
  }).catch(function(e) {
    console.log('[hello-world] storage error:', e);
  });
}

// Listen for messages from popup
if (api && api.runtime && api.runtime.onMessage) {
  api.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('[hello-world] bg got message:', JSON.stringify(message));

    if (message.type === 'ping') {
      sendResponse({
        hasBrowser: hasBrowser,
        hasChrome:  hasChrome,
        runtimeId:  (api.runtime && api.runtime.id) || 'unknown',
      });
    }

    if (message.type === 'openTab') {
      api.tabs.create({ url: api.runtime.getURL('popup.html?tab=1') });
    }

    return true; // keep channel open
  });
}
