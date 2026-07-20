import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';

const config = loadConfig();

const NAVY = '#14284b';
const GOLD = '#f5b400';

// Use real brand assets if present (assets/ascot-logo.png, assets/favicon.png),
// otherwise fall back to an inline SVG recreation of the ASCOT mark.
function dataUri(path, mime) {
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
}

const logoPng = resolve(config.projectRoot, 'assets/ascot-logo.png');
const logoSvgFile = resolve(config.projectRoot, 'assets/ascot-logo.svg');
const svgLogo = `<svg class="logo" viewBox="0 0 300 100" role="img" aria-label="Ascot Wealth Management">
  <g transform="translate(210,4)"><polygon points="0,32 8,14 22,24 32,2 42,24 56,14 64,32" fill="${GOLD}"/><rect x="0" y="33" width="64" height="9" rx="1" fill="${GOLD}"/></g>
  <text x="0" y="66" font-family="'Arial Black','Segoe UI',Arial,sans-serif" font-weight="900" font-size="62" letter-spacing="0" fill="${NAVY}">ASCOT</text>
  <text x="1" y="95" font-family="'Segoe UI',Arial,sans-serif" font-weight="400" font-size="27" letter-spacing="1.5" fill="${NAVY}">Wealth Management</text>
</svg>`;
let logoMarkup = svgLogo;
if (existsSync(logoPng)) {
  logoMarkup = `<img class="logo" src="${dataUri(logoPng, 'image/png')}" alt="Ascot Wealth Management">`;
} else if (existsSync(logoSvgFile)) {
  logoMarkup = readFileSync(logoSvgFile, 'utf8').replace('<svg', '<svg class="logo"');
}

const faviconFile = resolve(config.projectRoot, 'assets/favicon.png');
const svgFavicon =
  `data:image/svg+xml,` +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${NAVY}"/><polygon points="14,42 14,26 25,33 32,18 39,33 50,26 50,42" fill="${GOLD}"/><rect x="14" y="44" width="36" height="6" fill="${GOLD}"/></svg>`
  );
const faviconHref = existsSync(faviconFile) ? dataUri(faviconFile, 'image/png') : svgFavicon;
const data = JSON.parse(readFileSync(resolve(config.projectRoot, config.output.jsonPath), 'utf8'));
const { window, meetings } = data;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const partialBanner = data.partial
  ? `<div class="partial-banner">⚠ <strong>Partial data.</strong> ${data.failedCalendars.length} calendar(s) failed to load: ${data.failedCalendars.map((f) => esc(f.name)).join(', ')}. The counts below are <strong>undercounted</strong> — re-run the report before using them.</div>`
  : '';

// Slim rows embedded for client-side filtering/aggregation.
const rows = meetings.map((m) => ({
  d: (m.start || '').slice(0, 10),
  firm: m.firm || 'Unknown',
  cat: m.category || 'other',
  mod: m.modality || 'unspecified',
  adv: m.advisor || 'unknown',
  rev: !!m.isReview,
  src: m.modalitySource || 'title',
})).filter((r) => r.d);

const firms = [...new Set(rows.map((r) => r.firm))];
const dates = rows.map((r) => r.d).sort();
const minDate = dates[0] || '';
const maxDate = dates[dates.length - 1] || '';
const tz = window.timezone;

// Embed data safely (avoid closing the script tag early).
const payload = JSON.stringify({ rows, firms, minDate, maxDate, tz }).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ascot Wealth Management — Meeting Report</title>
<link rel="icon" href="${faviconHref}">
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --card:#fff; --ink:#111827; --muted:#6b7280; --line:#e5e7eb; --accent:${NAVY}; --gold:${GOLD}; }
  @media (prefers-color-scheme: dark){ :root{ --bg:#0b0f17; --card:#141a24; --ink:#e5e7eb; --muted:#9ca3af; --line:#243040; --accent:#5b7fc4; } }
  * { box-sizing:border-box; } body { margin:0; font:15px/1.5 system-ui,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--ink); }
  /* Full-width sticky navbar */
  .brandbar { position:sticky; top:0; z-index:20; width:100%; background:var(--card); border-bottom:1px solid var(--line); box-shadow:0 2px 10px rgba(20,40,75,.06); }
  .brandbar-inner { max-width:1080px; margin:0 auto; padding:14px 32px; display:flex; align-items:center; gap:20px; }
  .brandbar .logo { height:46px; width:auto; display:block; }
  @media (prefers-color-scheme: dark){ .brandbar .logo { filter:brightness(0) invert(1); } }
  .brandbar .divider { width:1px; align-self:stretch; background:var(--line); }
  .brandbar .htitle { font-size:20px; font-weight:700; letter-spacing:-.01em; }
  .brandbar .hsub { color:var(--muted); font-size:13px; margin-top:1px; }
  /* Big outer pane + inner panes */
  .page { padding:28px; }
  .outer-pane { max-width:1080px; margin:0 auto; background:var(--card); border:1px solid var(--line); border-radius:20px; box-shadow:0 12px 40px rgba(20,40,75,.10); padding:22px; }
  @media (prefers-color-scheme: dark){ .outer-pane { background:#0f1420; } }
  .sub { color:var(--muted); margin:0 0 16px 4px; font-size:13px; }
  .panel { background:var(--bg); border:1px solid var(--line); border-radius:14px; padding:16px 18px; margin-bottom:16px; }
  @media (prefers-color-scheme: dark){ .panel { background:#141a24; } }
  .panel h2 { font-size:15px; font-weight:700; margin:0 0 12px; }
  .panel .psub { color:var(--muted); font-size:12px; margin:-8px 0 12px; }
  .pane-row { display:grid; grid-template-columns:2fr 1fr; gap:16px; } @media(max-width:760px){ .pane-row{grid-template-columns:1fr;} }
  .pane-row .panel { margin-bottom:16px; }
  .controls { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-end; }
  .controls label { display:block; font-size:12px; color:var(--muted); margin-bottom:4px; }
  .controls input[type=date] { font:inherit; padding:6px 8px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); }
  .firmbox { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .firmbox label { display:flex; gap:5px; align-items:center; font-size:13px; color:var(--ink); margin:0; cursor:pointer; }
  .quick { display:flex; gap:6px; flex-wrap:wrap; }
  button { font:inherit; font-size:12px; padding:7px 11px; border:1px solid var(--line); border-radius:9px; background:var(--card); color:var(--ink); cursor:pointer; }
  button:hover { border-color:var(--accent); }
  button.primary { background:${NAVY}; color:#fff; border-color:${NAVY}; font-weight:600; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; }
  @media (prefers-color-scheme: dark){ .card { background:#1a2230; } }
  .card.big { border-left:4px solid var(--accent); }
  .card .n { font-size:30px; font-weight:700; } .card .l { color:var(--muted); font-size:13px; margin-top:2px; } .card .p { color:var(--muted); font-size:12px; }
  .bar { height:6px; border-radius:6px; margin-top:10px; background:var(--line); overflow:hidden; } .bar > i { display:block; height:100%; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  @media (prefers-color-scheme: dark){ table { background:#1a2230; } }
  th,td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); font-size:13px; }
  th { color:var(--muted); font-weight:600; background:color-mix(in srgb,var(--card) 85%,var(--line)); }
  td.num,th.num { text-align:right; } td.muted { color:var(--muted); } tr:last-child td { border-bottom:none; }
  .star { color:${GOLD}; }
  .scroll { overflow-x:auto; }
  .partial-banner { background:color-mix(in srgb,#ef4444 14%,var(--card)); border:1px solid color-mix(in srgb,#ef4444 55%,var(--line)); color:var(--ink); border-radius:10px; padding:12px 16px; font-size:14px; margin:0 0 16px; }
  .note { background:color-mix(in srgb,${GOLD} 12%,var(--card)); border:1px solid color-mix(in srgb,${GOLD} 40%,var(--line)); border-radius:10px; padding:12px 14px; font-size:13px; margin:0; }
  .foot { color:var(--muted); font-size:12px; margin-top:6px; }
</style></head>
<body>
<div class="brandbar">
  <div class="brandbar-inner">
    ${logoMarkup}
    <div class="divider"></div>
    <div>
      <div class="htitle">Meeting Report</div>
      <div class="hsub">Review · First · Follow-Up meetings — by advisor, modality & firm</div>
    </div>
  </div>
</div>
<div class="page">
  <div class="outer-pane">
    ${partialBanner}
    <p class="sub" id="subline"></p>

    <div class="panel">
      <div class="controls">
        <div><label for="from">From</label><input type="date" id="from"></div>
        <div><label for="to">To</label><input type="date" id="to"></div>
        <div><label>Firms</label><div class="firmbox" id="firmbox"></div></div>
        <div><label>Quick ranges</label><div class="quick" id="quick"></div></div>
        <div><label>Export</label><button class="primary" id="dlBtn">⬇ Download CSV</button></div>
      </div>
    </div>

    <div class="panel">
      <h2>Headline</h2>
      <div class="grid" id="totals"></div>
    </div>

    <div class="panel">
      <h2>By modality</h2><div class="psub">Across all categories</div>
      <div class="grid" id="modality"></div>
    </div>

    <div class="pane-row">
      <div class="panel"><h2>By category</h2><div class="scroll"><table id="catTable"></table></div></div>
      <div class="panel"><h2>By firm</h2><div class="scroll"><table id="firmTable"></table></div></div>
    </div>

    <div class="panel">
      <h2>Advisor leaderboard</h2><div class="psub">⭐ = most meetings in range</div>
      <div class="scroll"><table id="advTable"></table></div>
    </div>

    <div class="panel">
      <h2>Notes</h2>
      <div class="note" id="note"></div>
    </div>
    <p class="foot">Filtered client-side from results.json · counts = non-cancelled calendar events.</p>
  </div>
</div>

<script>
const DATA = ${payload};
const $ = (id) => document.getElementById(id);
const pct = (n,t) => t ? Math.round(n/t*100) : 0;
const MOD_COLORS = { video:'#10b981', face_to_face:'#0ea5e9', telephone:'#f59e0b', unspecified:'#94a3b8' };
const MOD_LABEL = { video:'Video', face_to_face:'Face-to-face', telephone:'Telephone', unspecified:'Unspecified' };

function selectedFirms() {
  return [...document.querySelectorAll('#firmbox input:checked')].map((c) => c.value);
}

function compute() {
  const from = $('from').value, to = $('to').value;
  const firms = selectedFirms();
  const rows = DATA.rows.filter((r) => r.d >= from && r.d <= to && firms.includes(r.firm));

  const cats = ['review','first','follow_up'];
  const cat = Object.fromEntries(cats.map((c)=>[c,{total:0,video:0,face_to_face:0,telephone:0,unspecified:0}]));
  const mod = {video:0,face_to_face:0,telephone:0,unspecified:0};
  const firmT = {}; const src = {title:0,location:0,conference:0,none:0}; const adv = {};
  let reviewTotal = 0;

  for (const r of rows) {
    if (mod[r.mod] === undefined) r.mod = 'unspecified';
    mod[r.mod]++;
    if (cat[r.cat]) { cat[r.cat].total++; cat[r.cat][r.mod]++; }
    if (r.rev) reviewTotal++;
    firmT[r.firm] = (firmT[r.firm]||0)+1;
    src[r.src] = (src[r.src]||0)+1;
    if (!adv[r.adv]) adv[r.adv] = {advisor:r.adv,total:0,review:0,first:0,follow_up:0,video:0,face_to_face:0,telephone:0,unspecified:0};
    const a = adv[r.adv]; a.total++; if (cat[r.cat]) a[r.cat]++; a[r.mod]++;
  }
  const total = rows.length;
  const modTotal = mod.video+mod.face_to_face+mod.telephone+mod.unspecified;
  const advisors = Object.values(adv).sort((x,y)=>y.total-x.total);
  return { from, to, firms, total, reviewTotal, cat, mod, modTotal, firmT, src, advisors };
}

function render() {
  const R = compute();
  $('subline').innerHTML = R.from + ' → ' + R.to + ' · ' + DATA.tz + ' · Firms: ' + (R.firms.join(', ')||'none') + ' · <strong>live data</strong>';

  $('totals').innerHTML =
    card(R.total,'Total meetings held',true) +
    card(R.cat.review.total,'Review meetings',true) +
    card(R.cat.first.total,'First meetings') +
    card(R.cat.follow_up.total,'Follow-up meetings');

  $('modality').innerHTML = ['video','face_to_face','telephone','unspecified'].map((m)=>
    '<div class="card"><div class="n">'+R.mod[m]+'</div><div class="l">'+MOD_LABEL[m]+'</div>'+
    '<div class="p">'+pct(R.mod[m],R.modTotal)+'% of total</div>'+
    '<div class="bar"><i style="width:'+pct(R.mod[m],R.modTotal)+'%;background:'+MOD_COLORS[m]+'"></i></div></div>').join('');

  $('catTable').innerHTML = '<thead><tr><th>Category</th><th class="num">Total</th><th class="num">Video</th><th class="num">F2F</th><th class="num">Tel</th><th class="num">Unspec.</th></tr></thead><tbody>'+
    ['review','first','follow_up'].map((c)=>{const b=R.cat[c];return '<tr><td>'+c.replace('_',' ')+'</td><td class="num"><strong>'+b.total+'</strong></td><td class="num">'+b.video+'</td><td class="num">'+b.face_to_face+'</td><td class="num">'+b.telephone+'</td><td class="num muted">'+b.unspecified+'</td></tr>';}).join('')+'</tbody>';

  $('firmTable').innerHTML = '<thead><tr><th>Firm</th><th class="num">Total</th></tr></thead><tbody>'+
    Object.entries(R.firmT).sort((a,b)=>b[1]-a[1]).map(([f,n])=>'<tr><td>'+f+'</td><td class="num">'+n+'</td></tr>').join('')+'</tbody>';

  $('advTable').innerHTML = '<thead><tr><th>Advisor</th><th class="num">Total</th><th class="num">Review</th><th class="num">First</th><th class="num">Follow-up</th><th class="num">Video</th><th class="num">F2F</th><th class="num">Tel</th></tr></thead><tbody>'+
    R.advisors.map((a,i)=>'<tr><td>'+(i===0?'⭐ ':'')+a.advisor+'</td><td class="num"><strong>'+a.total+'</strong></td><td class="num">'+a.review+'</td><td class="num">'+a.first+'</td><td class="num">'+a.follow_up+'</td><td class="num">'+a.video+'</td><td class="num">'+a.face_to_face+'</td><td class="num">'+a.telephone+'</td></tr>').join('')+'</tbody>';

  const unknown = (R.advisors.find((a)=>a.advisor==='unknown')||{}).total||0;
  $('note').innerHTML = '<strong>How modality was determined:</strong> title='+R.src.title+', location field='+R.src.location+', conferencing link='+R.src.conference+', undetermined='+R.src.none+'. Where the title had no modality it was inferred from the event location. '+R.mod.unspecified+' meeting(s) remain unspecified. '+unknown+' event(s) had no readable advisor ("unknown").';
}

function card(n,l,big){ return '<div class="card'+(big?' big':'')+'"><div class="n">'+n+'</div><div class="l">'+l+'</div></div>'; }

function setRange(from,to){ $('from').value=from; $('to').value=to; render(); }

// Init controls
$('from').min=DATA.minDate; $('from').max=DATA.maxDate; $('from').value=DATA.minDate;
$('to').min=DATA.minDate; $('to').max=DATA.maxDate; $('to').value=DATA.maxDate;
$('firmbox').innerHTML = DATA.firms.map((f)=>'<label><input type="checkbox" value="'+f+'" checked> '+f+'</label>').join('');

// Quick fiscal-year buttons derived from the data range
(function(){
  const years = new Set();
  for (const r of DATA.rows){ const y=+r.d.slice(0,4), m=+r.d.slice(5,7); years.add(m>=7?y:y-1); }
  const btns = [...years].sort().map((y)=>'<button data-s="'+y+'-07-01" data-e="'+(y+1)+'-06-30">FY '+y+'/'+((y+1)%100)+'</button>').join('');
  $('quick').innerHTML = btns + '<button data-s="'+DATA.minDate+'" data-e="'+DATA.maxDate+'">All</button>';
  $('quick').addEventListener('click',(e)=>{ if(e.target.dataset.s) setRange(e.target.dataset.s, e.target.dataset.e); });
})();

function downloadCsv() {
  const R = compute();
  const head = 'advisor,total,review,first,follow_up,video,face_to_face,telephone,unspecified';
  const body = R.advisors.map((a) => [a.advisor,a.total,a.review,a.first,a.follow_up,a.video,a.face_to_face,a.telephone,a.unspecified].join(','));
  const summary = [
    '# Ascot Wealth Management — Meeting Report',
    '# period,' + R.from + ' to ' + R.to,
    '# firms,' + R.firms.join(' / '),
    '# total_meetings,' + R.total,
    '# review_total,' + R.cat.review.total,
    '# modality,video=' + R.mod.video + ',f2f=' + R.mod.face_to_face + ',tel=' + R.mod.telephone + ',unspecified=' + R.mod.unspecified,
    '',
  ];
  const csv = summary.concat(head, body).join('\\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ascot_meetings_' + R.from + '_to_' + R.to + '.csv'; a.click();
  URL.revokeObjectURL(url);
}
$('dlBtn').addEventListener('click', downloadCsv);

document.querySelector('.controls').addEventListener('input', render);
render();
</script>
</body></html>`;

const outDir = resolve(config.projectRoot, 'out');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'report.html');
writeFileSync(outPath, html);
console.log(outPath);
