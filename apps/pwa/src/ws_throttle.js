(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.wsThrottle = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function createThrottle(waitMs, handler) {
    let timer = null;
    return function trigger() {
      if (timer) {
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        handler();
      }, waitMs);
    };
  }

  return { createThrottle };
});
