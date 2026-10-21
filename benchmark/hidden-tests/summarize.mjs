// Turn results/http.json (Vitest) and results/e2e.json (Playwright) into a per-ticket
// table. Tickets come from the test file prefix: t1-… → T1, x-… → X (cross-ticket).
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'results');
const ticketOf = (file) => {
  const m = path.basename(file).match(/^(t\d+|x)-/i);
  return m ? m[1].toUpperCase() : '?';
};
const tally = {};
const bump = (ticket, kind, passed) => {
  tally[ticket] ??= { http: [0, 0], e2e: [0, 0] };
  tally[ticket][kind][1] += 1;
  if (passed) tally[ticket][kind][0] += 1;
};

const read = (name) => {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};

const http = read('http.json');
for (const file of http?.testResults ?? []) {
  for (const t of file.assertionResults) bump(ticketOf(file.name), 'http', t.status === 'passed');
}

const e2e = read('e2e.json');
const walk = (suite, file) => {
  const f = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests) bump(ticketOf(f), 'e2e', t.status === 'expected');
  }
  for (const child of suite.suites ?? []) walk(child, f);
};
for (const suite of e2e?.suites ?? []) walk(suite, suite.file);

const order = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'X'];
const fmt = ([p, n]) => (n ? `${p}/${n}` : '—');
const rows = order
  .filter((t) => tally[t])
  .map((t) => `| ${t} | ${fmt(tally[t].http)} | ${fmt(tally[t].e2e)} |`);
const table = ['| Ticket | HTTP | E2E |', '| --- | --- | --- |', ...rows].join('\n');
console.log(`\nHidden test summary\n\n${table}\n`);
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(tally, null, 2));
fs.writeFileSync(path.join(dir, 'summary.md'), `${table}\n`);
