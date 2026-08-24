// Build CET-4 dictionary banks from kajweb/dict (Baicizhan official data, JSONL)
const fs = require('fs');
const path = require('path');

const ZIPS = path.join(__dirname, 'zips');
const OUT = path.join(__dirname, 'js');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let all = [];
const SRC = { CET4_1: 'core', CET4_2: 'full', CET4_3: 'exam', CET4luan_1: 'freq' };
for (const f of Object.keys(SRC)) {
  const lines = fs.readFileSync(path.join(ZIPS, f, f + '.json'), 'utf8').split(/\r?\n/).filter(l => l.trim());
  for (const ln of lines) {
    try { const o = JSON.parse(ln); o._src = SRC[f]; all.push(o); } catch (e) { /* skip bad line */ }
  }
}
console.log('total parsed:', all.length);

// dedupe: priority core > full > exam > freq
const order = { core: 0, full: 1, exam: 2, freq: 3 };
all.sort((a, b) => order[a._src] - order[b._src] || a.wordRank - b.wordRank);
const map = new Map();
for (const w of all) if (!map.has(w.headWord)) map.set(w.headWord, w);
console.log('unique words:', map.size);

function buildEntry(w) {
  const c = w.content.word.content;
  const trans = (c.trans || []).map(t => ({ pos: t.pos || '', zh: t.tranCn || '' }));
  const sents = [];
  const re = (c.realExamSentence && c.realExamSentence.sentences) || [];
  for (const s of re) {
    if (s.sContent && s.sCn) sents.push({ en: s.sContent.replace(/^\.+\s*/, ''), zh: s.sCn });
  }
  if (sents.length === 0) {
    const ss = (c.sentence && c.sentence.sentences) || [];
    for (const s of ss) if (s.sContent && s.sCn) sents.push({ en: s.sContent, zh: s.sCn });
  }
  const phrases = ((c.phrase && c.phrase.phrases) || []).slice(0, 5).map(p => ({ p: p.pContent, zh: p.pCn }));
  return {
    w: w.headWord,
    uk: c.ukphone || '',
    us: c.usphone || '',
    trans,
    sents: sents.slice(0, 2),
    phrases,
    src: w._src
  };
}

function bankFromSrc(src, name) {
  const out = []; const seen = new Set();
  for (const w of all) {
    if (w._src === src && !seen.has(w.headWord)) { seen.add(w.headWord); out.push(buildEntry(w)); }
  }
  console.log(name, '->', out.length);
  return out;
}

// Bank order in the site picker:
const banks = [
  ['bank-core.js',  bankFromSrc('core', '核心必背')],
  null, // placeholder replaced below
];

const coreBank   = bankFromSrc('core', '核心必背(CET4_1)');
const fullBank   = bankFromSrc('full', '大纲全词(CET4_2 unique)');
const examRaw    = [];
{
  const seen = new Set();
  for (const w of all) if (w._src === 'exam' && !seen.has(w.headWord)) { seen.add(w.headWord); examRaw.push(w); }
}
const freqBank   = bankFromSrc('freq', '高频乱序(CET4luan)');

// 真题考点词: from CET4_3 book, ordered by its wordRank (these carry real exam MCQs)
const seen3 = new Set(); const examBank = [];
for (const w of all) {
  if (w._src === 'exam' && !seen3.has(w.headWord)) {
    seen3.add(w.headWord);
    const e = buildEntry(w);
    // attach one real exam question when available
    const c = w.content.word.content;
    if (c.exam && c.exam.length) {
      const q = c.exam[0];
      e.exam = {
        q: q.question,
        choices: (q.choices || []).map(ch => ch.choice).filter(Boolean),
        answer: (q.answer && q.answer.rightIndex ? q.answer.rightIndex - 1 : -1),
        explain: (q.answer && q.answer.explain) || ''
      };
      if (e.exam.choices.length < 2) delete e.exam;
    }
    examBank.push(e);
  }
}
console.log('真题考点(exam):', examBank.length, '| with real exam Q:', examBank.filter(e => e.exam).length);

function writeBank(file, id, name, desc, list) {
  const header = `/* ${name} — 数据源: github.com/kajweb/dict (百词斩官方词书导出), 本地生成 */\nwindow.CET_BANKS = window.CET_BANKS || {};\nwindow.CET_BANKS["${id}"] = {\n  id: "${id}",\n  name: "${name}",\n  desc: "${desc}",\n  list: `;
  fs.writeFileSync(path.join(OUT, file), header + JSON.stringify(list) + '\n};\n', 'utf8');
  console.log('wrote js/' + file, (fs.statSync(path.join(OUT, file)).size / 1024 / 1024).toFixed(2) + 'MB');
}

writeBank('bank-core.js',  'core',   '核心必背',   '百词斩四级核心词书 · 1162 词 · 按考频排序，优先背这一本', coreBank);
writeBank('bank-full.js',  'full',   '大纲全词',   '四级大纲词汇表 · ' + fullBank.length + ' 词 · 全量覆盖，查漏补缺用', fullBank);
writeBank('bank-exam.js',  'exam',   '真题考点词', '真题选项词与考点词 · ' + examBank.length + ' 词 · 附真题选择题', examBank);
writeBank('bank-freq.js',  'freq',   '高频速记',   '高频乱序词书 · ' + freqBank.length + ' 词 · 冲刺期快速过', freqBank);
console.log('DONE');
