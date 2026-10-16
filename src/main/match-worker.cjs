// Keep regex evaluation outside the main/renderer threads. Every request has
// independent VM contexts and the same per-expression/batch execution budgets.
const { parentPort } = require('node:worker_threads');
const { Script } = require('node:vm');
const test = new Script('expression.test(text)');
parentPort.on('message', ({ rules, text }) => {
  const matched = [], deadline = Date.now() + 200;
  let timedOut = false;
  for (const rule of rules) {
    if (Date.now() >= deadline) { timedOut = true; break; }
    try {
      if (test.runInNewContext({ expression: new RegExp(rule.pattern, rule.flags), text }, { timeout: Math.min(20, Math.max(1, deadline - Date.now())) })) matched.push(rule.id);
    } catch { timedOut = true; }
  }
  parentPort.postMessage({ matched, timedOut });
});
