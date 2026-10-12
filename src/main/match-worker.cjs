// Regex evaluation stays outside the Electron main/renderer threads. Both the
// individual expression and the entire batch have a bounded execution budget.
const { parentPort, workerData } = require('node:worker_threads');
const { Script } = require('node:vm');
const { rules, text } = workerData;
const test = new Script('expression.test(text)');
const matched = [], deadline = Date.now() + 200;
let timedOut = false;
for (const rule of rules) {
  if (Date.now() >= deadline) { timedOut = true; break; }
  try {
    if (test.runInNewContext({ expression: new RegExp(rule.pattern, rule.flags), text }, { timeout: Math.min(20, Math.max(1, deadline - Date.now())) })) matched.push(rule.id);
  } catch { timedOut = true; }
}
parentPort.postMessage({ matched, timedOut });
parentPort.close();
