import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DateTime } from 'luxon';
import { loadConfig } from './config.js';
import { fetchGoogleCalendar } from './fetchGoogleCalendar.js';
import { resolveAdvisors } from './resolveAdvisors.js';
import { classifyAll } from './classify.js';
import { aggregate } from './aggregate.js';

function parseArgs(argv) {
  const args = { window: 365 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--start') args.start = argv[++i];
    else if (a === '--end') args.end = argv[++i];
    else if (a === '--window') args.window = Number(argv[++i]);
  }
  return args;
}

// Default = the most recently COMPLETED fiscal year.
// Override with --start YYYY-MM-DD and either --end YYYY-MM-DD (exclusive) or --window <days>.
function resolveWindow(args, config) {
  const zone = config.timezone;
  const fyMonth = config.fiscalYearStartMonth || 7;
  let start;
  if (args.start) {
    start = DateTime.fromISO(args.start, { zone }).startOf('day');
  } else {
    const now = DateTime.now().setZone(zone);
    const currentFyStartYear = now.month >= fyMonth ? now.year : now.year - 1;
    start = DateTime.fromObject({ year: currentFyStartYear - 1, month: fyMonth, day: 1 }, { zone });
  }
  const end = args.end
    ? DateTime.fromISO(args.end, { zone }).startOf('day')
    : start.plus({ days: args.window });
  return { start: start.toJSDate(), end: end.toJSDate(), startDt: start, endDt: end };
}

function pct(n, total) {
  return total ? `${Math.round((n / total) * 100)}%` : '0%';
}

function printSummary(report, window, config) {
  const o = report.overall;
  console.log('\n=====================================================');
  console.log('  MEETING REPORT');
  console.log(`  ${window.startDt.toISODate()} -> ${window.endDt.minus({ days: 1 }).toISODate()}  (${window.startDt.zoneName})`);
  console.log(`  Firms: ${[...new Set(config.calendars.map((c) => c.firm))].join(', ')}`);
  console.log('=====================================================');
  console.log(`  Total meetings held (non-cancelled): ${report.grandTotal}`);
  console.log(`  Excluded as non-meetings/noise:      ${report.excludedNoise}`);
  console.log('  ---------------------------------------------------');
  console.log('  BY MODALITY (all categories):');
  console.log(`    Video:        ${o.video}  (${pct(o.video, o.total)})`);
  console.log(`    Face-to-face: ${o.face_to_face}  (${pct(o.face_to_face, o.total)})`);
  console.log(`    Telephone:    ${o.telephone}  (${pct(o.telephone, o.total)})`);
  console.log(`    Unspecified:  ${o.unspecified}  (${pct(o.unspecified, o.total)})`);
  const ms = report.modalitySource;
  console.log(`    (source: title=${ms.title}, location=${ms.location}, conference=${ms.conference}, none=${ms.none})`);
  console.log('  ---------------------------------------------------');
  console.log('  BY CATEGORY (total | video / f2f / tel / unspecified):');
  for (const [cat, b] of Object.entries(report.byCategory)) {
    console.log(`    ${cat.padEnd(10)} ${String(b.total).padStart(4)} | ${b.video}/${b.face_to_face}/${b.telephone}/${b.unspecified}`);
  }
  console.log('  ---------------------------------------------------');
  console.log('  >>> REVIEW MEETINGS TOTAL: ' + report.reviewTotal + ' <<<');
  console.log('  ---------------------------------------------------');
  console.log('  BY FIRM:');
  for (const [firm, b] of Object.entries(report.byFirm)) {
    console.log(`    ${firm.padEnd(10)} ${b.total}`);
  }
  console.log('  ---------------------------------------------------');
  if (report.topAdvisor) {
    console.log(`  Top advisor overall: ${report.topAdvisor.advisor} (${report.topAdvisor.total})`);
  }
  if (report.topReviewAdvisor) {
    console.log(`  Top review advisor:  ${report.topReviewAdvisor.advisor} (${report.topReviewAdvisor.review} reviews)`);
  }
  console.log('  Advisor leaderboard (total | review/first/followup):');
  for (const a of report.advisors) {
    console.log(`    ${a.advisor.padEnd(38)} ${String(a.total).padStart(4)} | ${a.review}/${a.first}/${a.follow_up}`);
  }
  console.log('=====================================================\n');
}

function toCsv(report, window) {
  const lines = ['section,key,a,b,c,d,e'];
  lines.push(`window,start,${window.startDt.toISODate()},,,,`);
  lines.push(`window,end,${window.endDt.minus({ days: 1 }).toISODate()},,,,`);
  lines.push(`totals,meetings_held,${report.grandTotal},,,,`);
  lines.push(`totals,review_total,${report.reviewTotal},,,,`);
  lines.push(`totals,excluded_noise,${report.excludedNoise},,,,`);
  const o = report.overall;
  lines.push(`modality,overall,video=${o.video},f2f=${o.face_to_face},tel=${o.telephone},unspecified=${o.unspecified},`);
  for (const [cat, b] of Object.entries(report.byCategory)) {
    lines.push(`category,${cat},total=${b.total},video=${b.video},f2f=${b.face_to_face},tel=${b.telephone},unspecified=${b.unspecified}`);
  }
  for (const [firm, b] of Object.entries(report.byFirm)) {
    lines.push(`firm,${firm},total=${b.total},,,,`);
  }
  lines.push('advisor,name,total,review,first,follow_up,');
  for (const a of report.advisors) {
    lines.push(`advisor,${a.advisor},${a.total},${a.review},${a.first},${a.follow_up},`);
  }
  return lines.join('\n');
}

function advisorCsv(report) {
  const lines = ['advisor,total,review,first,follow_up,video,face_to_face,telephone,unspecified'];
  for (const a of report.advisors) {
    lines.push([a.advisor, a.total, a.review, a.first, a.follow_up, a.video, a.face_to_face, a.telephone, a.unspecified].join(','));
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const config = loadConfig();
  const window = resolveWindow(args, config);

  console.log(`[run] window ${window.startDt.toISODate()} -> ${window.endDt.toISODate()}  calendars=${config.calendars.length}`);

  const { records: raw, failed } = await fetchGoogleCalendar(config, window.start, window.end);
  console.log(`[run] fetched ${raw.length} non-cancelled events`);

  const res = resolveAdvisors(raw, config);
  console.log(`[run] resolved ${res.resolved} name-only advisors; ${res.distinctAdvisors} distinct advisors`);

  const { meetings, noise } = classifyAll(raw, config);
  const report = aggregate(meetings, noise.length);

  printSummary(report, window, config);

  const partial = failed.length > 0;
  if (partial) {
    console.error('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    console.error(`  WARNING: PARTIAL DATA — ${failed.length} calendar(s) failed to load.`);
    console.error(`  Missing: ${failed.map((f) => f.name).join(', ')}`);
    console.error('  The counts above are UNDERCOUNTED. Re-run before using them.');
    console.error('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
  }

  const outJson = {
    window: { start: window.startDt.toISO(), end: window.endDt.toISO(), timezone: config.timezone },
    partial,
    failedCalendars: failed,
    report,
    meetings,
    noiseSample: noise.slice(0, 50).map((n) => ({ calendar: n.calendarName, title: n.title })),
  };
  writeFileSync(resolve(config.projectRoot, config.output.jsonPath), JSON.stringify(outJson, null, 2));
  writeFileSync(resolve(config.projectRoot, config.output.csvPath), toCsv(report, window));
  const advisorPath = config.output.advisorCsvPath || 'results-by-advisor.csv';
  writeFileSync(resolve(config.projectRoot, advisorPath), advisorCsv(report));
  console.log(`[run] wrote ${config.output.jsonPath}, ${config.output.csvPath}, ${advisorPath}`);

  // Non-zero exit so an incomplete run can never look like a success to a
  // scheduler or a script that checks the exit code.
  if (partial) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
