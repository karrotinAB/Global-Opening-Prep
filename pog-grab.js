/* pog.artbox.kr 에서 실행되는 매대 데이터 수집 스크립트 (북마클릿이 불러옴) */
(async () => {
  if (window.__pogGrabOn) return;
  window.__pogGrabOn = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- 진행 창 ---------- */
  const box = document.createElement('div');
  box.id = '__pog_grab';
  box.innerHTML = `<style>
#__pog_grab{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px/1.5 'Malgun Gothic',sans-serif;color:#222}
#__pog_grab .c{background:#fff;border-radius:12px;padding:22px 24px;width:600px;max-width:92vw;max-height:86vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)}
#__pog_grab h3{margin:0 0 8px;font-size:17px}
#__pog_grab .bar{height:8px;background:#eee;border-radius:4px;overflow:hidden;margin:10px 0}
#__pog_grab .bar i{display:block;height:100%;width:0;background:#f7931e;transition:width .2s}
#__pog_grab button{border:0;border-radius:6px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer;margin-right:6px}
#__pog_grab .p{background:#f7931e;color:#fff}#__pog_grab .g{background:#eee}
#__pog_grab textarea{width:100%;height:70px;font:11px monospace;margin-top:8px;box-sizing:border-box}
#__pog_grab table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}
#__pog_grab td,#__pog_grab th{border-bottom:1px solid #eee;padding:3px 6px;text-align:left}
#__pog_grab .w{color:#c0392b}
</style><div class="c"><h3>POG 데이터 가져오기</h3><div class="msg">준비 중…</div><div class="bar"><i></i></div><div class="out"></div><div class="act" style="margin-top:14px"></div></div>`;
  document.body.appendChild(box);
  const $msg = box.querySelector('.msg'), $bar = box.querySelector('.bar i'), $out = box.querySelector('.out'), $act = box.querySelector('.act');
  const close = () => { box.remove(); window.__pogGrabOn = false; };
  const setActs = (...btns) => { $act.innerHTML = ''; btns.forEach(([t, cls, fn]) => { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = fn; $act.appendChild(b); }); };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  setActs(['취소', 'g', close]);

  /* ---------- 매대 화면에서 제품·집기 읽기 ---------- */
  function scrapeDoc(doc) {
    const win = doc.defaultView;
    const bgUrl = el => {
      const b = el.style.backgroundImage || win.getComputedStyle(el).backgroundImage || '';
      const m = b.match(/url\(["']?(.*?)["']?\)/);
      return m ? m[1] : '';
    };
    // 화면 요소에 붙은 data-* 값과 부모 요소를 모두 남김 (매대 번호 같은 정보가 어디 있는지 찾기 위해)
    const extra = el => {
      const par = el.parentElement;
      return { data: { ...el.dataset }, cls: el.className || '', parent: par ? `${par.tagName.toLowerCase()}#${par.id || ''}.${(par.className || '').toString().split(' ')[0]}` : '' };
    };
    const items = [...doc.querySelectorAll('div[id^="obj"]')].filter(el => /^obj\d+$/.test(el.id)).map(el => ({
      ...extra(el),
      id: el.id.slice(3),
      code: el.dataset.item || '',
      name: el.getAttribute('alt') || '',
      price: Number(el.dataset.amtk || 0),
      group: el.dataset.groupname || '',
      img: bgUrl(el),
      z: parseInt(win.getComputedStyle(el).zIndex, 10) || 0, // 겹칠 때 앞뒤 (POG 사이트와 같게)
      x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
    }));
    const props = [...doc.querySelectorAll('div[id^="prop"]')].filter(el => /^prop\d+$/.test(el.id)).map(el => ({
      ...extra(el),
      id: el.id.slice(4),
      kind: (el.getAttribute('title') || '').split('#')[0].trim(),
      opt: el.getAttribute('data-propoption') || '', // POG 계산기는 'Y'를 파이프로 봄
      cls: (el.className || '').split(' ')[0],
      color: win.getComputedStyle(el).backgroundColor,
      x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
    }));
    // 배경 무늬 (타공판 구멍 등): 그림 주소·크기(= 구멍 간격)·위치
    const bgOf = cs => {
      const img = cs.backgroundImage;
      if (!img || img === 'none') return null;
      return { img: img.slice(0, 400), size: cs.backgroundSize, pos: cs.backgroundPosition, rep: cs.backgroundRepeat };
    };
    // 배경판: 제품·집기와 같은 판 위에 있는 색(또는 무늬) 있는 div (예: 매대 옆 회색 판, 칸 사이 기둥, 타공판)
    const panels = [];
    const first = doc.querySelector('div[id^="obj"]') || doc.querySelector('div[id^="prop"]');
    const box = first && first.offsetParent;
    if (box) {
      const br = box.getBoundingClientRect();
      for (const el of box.querySelectorAll('div')) {
        if (/^(obj|prop)\d+$/.test(el.id) || el.closest('div[id^="obj"], div[id^="prop"]') || el.querySelector('div[id^="obj"], div[id^="prop"]')) continue;
        const cs = win.getComputedStyle(el), c = cs.backgroundColor, bg = bgOf(cs);
        if (cs.display === 'none' || (!bg && (!c || /rgba\(0, 0, 0, 0\)|transparent|rgb\(255, 255, 255\)/.test(c)))) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 40 || (!bg && r.width > br.width * 0.95)) continue;
        panels.push({ id: el.id || '', cls: (el.className || '').toString().split(' ')[0], color: c, ...(bg ? { bg } : {}),
          x: Math.round(r.left - br.left - box.clientLeft), y: Math.round(r.top - br.top - box.clientTop), w: Math.round(r.width), h: Math.round(r.height) });
        if (panels.length >= 200) break;
      }
    }
    // 판 전체에 깔린 무늬 (타공판이 매대 판 자체의 배경일 때)
    let board = null;
    for (let el = box, k = 0; el && k < 3 && !board; el = el.parentElement, k++) {
      const bg = bgOf(win.getComputedStyle(el));
      if (bg) { const r = el.getBoundingClientRect(), br = box.getBoundingClientRect(); board = { ...bg, x: Math.round(r.left - br.left), y: Math.round(r.top - br.top), w: Math.round(r.width), h: Math.round(r.height) }; }
    }
    // POG 계산기용 (계산기 수집기와 같은 방식): 매대 연 크기(mm 포함)·매대 몸통 위치·POG 사이트 메모·매대 타입
    const gv = id => { const e = doc.getElementById(id); return e ? e.value : ''; };
    const mdcnt = +gv('gv-mdcnt') || 1;
    const suf = [['', ''], ['Two', '2'], ['Three', '3'], ['Four', '4']];
    const bays = suf.slice(0, mdcnt).map(([a, b], i) => ({ no: i + 1, left: +gv('mgLeft' + a), top: +gv('mgTop' + a), w: +gv('gv-md' + b + 'width'), h: +gv('gv-md' + b + 'height'), wmm: +gv('gv-md' + b + 'widthmm'), hmm: +gv('gv-md' + b + 'heightmm') }));
    const r1 = v => Math.round((parseFloat(v) || 0) * 10) / 10;
    let bodies = [];
    try {
      const ref = doc.querySelector('div.item01') || doc.querySelector('div[id^="prop"]');
      if (ref) {
        const rr = ref.getBoundingClientRect(), dx = rr.left - (parseFloat(ref.style.left) || 0), dy = rr.top - (parseFloat(ref.style.top) || 0);
        bodies = [...doc.querySelectorAll('[id^="md-body"]')].map(b => { const r = b.getBoundingClientRect(); return { id: b.id, left: r1(r.left - dx), top: r1(r.top - dy), w: r1(r.width), h: r1(r.height) }; }).filter(b => b.w > 0 && b.h > 0);
      }
    } catch (e) { }
    const memos = [...doc.querySelectorAll('[id^="memo"]')].map(e => ({ text: (e.textContent || '').replace(/\s+/g, ' ').trim(), x: r1(e.style.left), y: r1(e.style.top), w: r1(e.style.width), h: r1(e.style.height) })).filter(m => m.text);
    // 타공판 넓게 찾기: 매대 범위와 겹치는 모든 요소의 배경 무늬(::before·::after 포함)·그림(img·canvas·svg)·작은 구멍 요소
    const look = { bg: [], holes: null, n: 0 };
    try {
      const objs = [...doc.querySelectorAll('div[id^="obj"], div[id^="prop"]')].map(e => e.getBoundingClientRect()).filter(r => r.width);
      if (objs.length && box) {
        const A = { l: Math.min(...objs.map(r => r.left)), t: Math.min(...objs.map(r => r.top)), r: Math.max(...objs.map(r => r.right)), b: Math.max(...objs.map(r => r.bottom)) };
        // 타공판은 제품·집기보다 넓게 깔림 → 매대 몸통(md-body)까지, 그리고 둘레로 넉넉히
        for (const e of doc.querySelectorAll('[id^="md-body"]')) { const r = e.getBoundingClientRect(); if (r.width) { A.l = Math.min(A.l, r.left); A.t = Math.min(A.t, r.top); A.r = Math.max(A.r, r.right); A.b = Math.max(A.b, r.bottom); } }
        const mx = Math.max(80, (A.r - A.l) * 0.3), my = Math.max(80, (A.b - A.t) * 0.3);
        A.l -= mx; A.r += mx; A.t -= my; A.b += my;
        const br = box.getBoundingClientRect(), rel = r => ({ x: Math.round(r.left - br.left - box.clientLeft), y: Math.round(r.top - br.top - box.clientTop), w: Math.round(r.width), h: Math.round(r.height) });
        const smalls = [];
        for (const el of doc.body.querySelectorAll('*')) {
          if (/^(obj|prop)\d+$/.test(el.id) || el.closest('div[id^="obj"], div[id^="prop"], #__pog_grab')) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || r.right < A.l || r.left > A.r || r.bottom < A.t || r.top > A.b) continue;
          look.n++;
          const tag = el.tagName.toLowerCase(), id = el.id || '', cls = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().split(' ')[0];
          for (const ps of [null, '::before', '::after']) {
            const c = win.getComputedStyle(el, ps), bi = c.backgroundImage;
            if (bi && bi !== 'none' && look.bg.length < 30) look.bg.push({ tag, id, cls, ps: ps || '', img: bi.slice(0, 240), size: c.backgroundSize, rep: c.backgroundRepeat, pos: c.backgroundPosition, ...rel(r) });
          }
          if (/^(img|canvas|svg)$/.test(tag) && look.bg.length < 30) look.bg.push({ tag, id, cls, img: (el.currentSrc || el.src || '').toString().slice(0, 240), ...rel(r) });
          if (r.width <= 16 && r.height <= 16 && r.width >= 2 && smalls.length < 5000) smalls.push(r);
        }
        if (smalls.length >= 12) { // 같은 크기의 작은 요소가 줄지어 있으면 구멍으로 봄 → 간격
          const key = r => Math.round(r.width) + 'x' + Math.round(r.height), cnt = {};
          smalls.forEach(r => cnt[key(r)] = (cnt[key(r)] || 0) + 1);
          const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
          const hs = smalls.filter(r => key(r) === top[0]);
          const pitch = vals => { const u = [...new Set(vals.map(v => Math.round(v)))].sort((a, b) => a - b), d = u.slice(1).map((v, i) => v - u[i]).filter(x => x > 1).sort((a, b) => a - b); return d.length ? d[Math.floor(d.length / 2)] : 0; };
          if (hs.length >= 12) look.holes = { n: hs.length, size: top[0], px: pitch(hs.map(r => r.left)), py: pitch(hs.map(r => r.top)), ...rel(hs[0]) };
        }
      }
    } catch (e) { look.err = String(e && e.message || e); }
    if (!board) { // 판 무늬를 못 찾았으면: 구멍 요소 → 넓게 깔린 무늬 순서로
      if (look.holes && look.holes.px) board = { holes: { px: look.holes.px, py: look.holes.py || look.holes.px } };
      else { const big = look.bg.filter(b => !/^url\(.*\/goods\//.test(b.img) && b.w * b.h >= 4000).sort((a, b) => b.w * b.h - a.w * a.h)[0]; if (big) board = { img: big.img, size: big.size, pos: big.pos, rep: big.rep, x: big.x, y: big.y, w: big.w, h: big.h, from: big.tag + (big.cls ? '.' + big.cls : '') + big.ps }; }
    }
    const src = { mdtype: gv('gv-mdtype'), mdcnt, bays, bodies, memos, look };
    return { items, props, panels, board, src };
  }

  /* 숨은 창으로 매대 보기 화면을 열어 다 그려질 때까지 기다린 뒤 읽기.
     expected = 목록 화면의 ITEM 수. 제품이 하나씩 불려오므로 그 수에 닿을 때까지 기다린다. */
  function loadFrame(url, expected, timeoutMs) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-30000px;top:0;width:1800px;height:1400px;border:0;visibility:hidden';
      let done = false;
      const read = () => { try { return scrapeDoc(f.contentDocument); } catch (e) { return { items: [], props: [], error: String(e) }; } };
      const finish = d => { if (done) return; done = true; clearTimeout(timer); f.remove(); resolve(d); };
      const timer = setTimeout(() => {
        const d = read();
        const got = d.items.length;
        finish({ ...d, error: expected && got < expected ? `시간 초과 (${got}/${expected})` : (got || d.props.length ? '' : '시간 초과') });
      }, timeoutMs);
      f.onload = async () => {
        let last = -1, stable = 0;
        while (!done) {
          await sleep(300);
          let n = 0, items = 0;
          try {
            items = f.contentDocument.querySelectorAll('div[id^="obj"]').length;
            n = items + f.contentDocument.querySelectorAll('div[id^="prop"]').length;
          } catch (e) { }
          if (n === last) stable++; else stable = 0;
          last = n;
          if (expected && items >= expected && stable >= 3) break;      // 목록 수만큼 다 왔음
          if (!expected && n > 0 && stable >= 10) break;              // 기대 수를 모르면 3초간 변화 없을 때
          if (n === 0 && stable >= 40) break;                          // 12초 동안 아무것도 없음
          if (expected && items > 0 && items < expected && stable >= 50) break; // 15초간 멈춤 → 있는 만큼
        }
        finish(read());
      };
      f.src = url;
      document.body.appendChild(f);
    });
  }
  const isShort = t => !t.data || t.data.error || (t.itemCount && t.data.items.length < t.itemCount);

  /* ---------- 매대 목록 표 읽기 ---------- */
  const num = v => { const m = String(v ?? '').match(/-?\d+/); return m ? Number(m[0]) : null; };
  function cellVal(td) {
    if (!td) return '';
    const s = td.querySelector('select'); if (s) return (s.selectedOptions[0]?.text || '').trim();
    const i = td.querySelector('input:not([type=checkbox])'); if (i) return i.value.trim();
    return td.textContent.trim();
  }
  function findRows() {
    for (const table of document.querySelectorAll('table')) {
      const trs = [...table.rows];
      const hi = trs.findIndex(tr => /고유번호/.test(tr.textContent) && /매대명/.test(tr.textContent));
      if (hi < 0) continue;
      const heads = [...trs[hi].cells].map(c => c.textContent.replace(/\s+/g, ''));
      const col = n => heads.findIndex(x => x === n);
      const ci = { team: col('팀명'), name: col('매대명'), idx: col('고유번호'), shelf: col('선반'), pipe: col('파이프'), item: col('ITEM'), bays: col('매대수') };
      const out = [];
      for (const tr of trs.slice(hi + 1)) {
        const cells = [...tr.cells];
        const m = cellVal(cells[ci.idx]).match(/\d{4,}/);
        if (!m) continue;
        let url = '';
        const link = tr.querySelector('[onclick*="md.aspx"],a[href*="md.aspx"]');
        if (link) {
          const s = (link.getAttribute('href') || '') + ' ' + (link.getAttribute('onclick') || '');
          const mm = s.match(/md\.aspx\?[^'"\s)]+/);
          if (mm) url = new URL(mm[0].replace(/&amp;/g, '&'), location.href).href;
        }
        const cb = tr.querySelector('input[type=checkbox]');
        out.push({
          mdidx: m[0], teamName: cellVal(cells[ci.team]), mdName: cellVal(cells[ci.name]),
          shelfCount: num(cellVal(cells[ci.shelf])), pipeCount: num(cellVal(cells[ci.pipe])), itemCount: num(cellVal(cells[ci.item])),
          bayCount: ci.bays >= 0 ? num(cellVal(cells[ci.bays])) : null,
          checked: !!(cb && cb.checked), url,
        });
      }
      if (out.length) return out;
    }
    return [];
  }
  function findStore(rows) {
    const s = { code: '', name: '', saup: '00' };
    for (const [k, v] of new URLSearchParams(location.search)) {
      if (/store_?code/i.test(k)) s.code = v;
      if (/store_?name/i.test(k)) s.name = v;
      if (/saup/i.test(k)) s.saup = v;
    }
    const r = rows.find(x => x.url);
    if (r) {
      const u = new URL(r.url).searchParams;
      s.code = s.code || u.get('iv_store_code') || '';
      s.name = s.name || u.get('iv_store_name') || '';
      s.saup = u.get('iv_saup_gubn') || s.saup;
    }
    if (!s.code || !s.name) {
      const m = document.body.innerText.slice(0, 3000).match(/([A-Z][A-Za-z0-9 .&\-]*(?:\([A-Za-z]+\))?)\s*(\d{6})/);
      if (m) { s.name = s.name || m[1].trim(); s.code = s.code || m[2]; }
    }
    if (!s.code) s.code = (prompt('매장코드를 입력해주세요 (예: 825406)', '') || '').trim();
    if (!s.name) s.name = (prompt('매장명을 입력해주세요', '') || '').trim();
    return s;
  }

  /* ---------- 실행 ---------- */
  try {
    const qs = new URLSearchParams(location.search);
    const isMd = /md\.aspx/i.test(location.pathname);
    let store, targets;
    if (isMd) {
      store = { code: qs.get('iv_store_code') || '', name: qs.get('iv_store_name') || '', saup: qs.get('iv_saup_gubn') || '00' };
      targets = [{ mdidx: qs.get('iv_mdidx') || '', teamName: qs.get('iv_teamname') || '', mdName: qs.get('iv_mdname') || '', shelfCount: null, pipeCount: null, itemCount: null, data: scrapeDoc(document) }];
    } else {
      const rows = findRows();
      if (!rows.length) throw new Error('매대 목록 표를 찾지 못했어요. 매장의 매대 목록 화면이나 매대 보기 화면에서 실행해주세요.');
      store = findStore(rows);
      const checked = rows.filter(r => r.checked);
      targets = checked.length ? checked : rows;
    }

    const enc = encodeURIComponent;
    const mdUrl = t => t.url || new URL(`md.aspx?iv_saup_gubn=${enc(store.saup)}&iv_store_code=${enc(store.code)}&iv_store_name=${enc(store.name)}&iv_teamname=${enc(t.teamName)}&iv_mdname=${enc(t.mdName)}&iv_mdidx=${t.mdidx}`, location.href).href;

    const total = targets.length;
    const tick = (n, label) => { $msg.textContent = `${label} ${n} / ${total}`; $bar.style.width = (n / total * 100) + '%'; };
    // 여러 매대를 동시에 열기 (n개씩)
    async function runAll(list, conc, timeoutMs, label) {
      let qi = 0, doneN = total - list.length; tick(doneN, label);
      await Promise.all(Array.from({ length: conc }, async () => {
        while (qi < list.length) {
          const t = list[qi++];
          const d = await loadFrame(mdUrl(t), t.itemCount, timeoutMs);
          if (!t.data || d.items.length >= t.data.items.length) t.data = d; // 더 많이 읽은 쪽을 남김
          doneN++; tick(doneN, label);
        }
      }));
    }
    await runAll(targets.filter(t => !t.data), 3, 60000, '매대 읽는 중…');
    // 실패하거나 덜 읽힌 매대는 하나씩 천천히 다시
    const retry = targets.filter(isShort);
    if (retry.length) { $msg.textContent = `다시 읽는 중… (${retry.length}개)`; await runAll(retry, 1, 120000, `다시 읽는 중 (${retry.length}개)…`); }

    const countKind = (props, re) => props.filter(p => re.test(p.kind)).length;
    const build = () => targets.map(t => {
      const d = t.data || { items: [], props: [] };
      return {
        mdidx: t.mdidx, teamName: t.teamName, mdName: t.mdName, bayCount: t.bayCount ?? null,
        shelfCount: t.shelfCount ?? countKind(d.props, /선반/),
        pipeCount: t.pipeCount ?? countKind(d.props, /파이프/),
        itemCount: t.itemCount ?? d.items.length,
        items: d.items, props: d.props, panels: d.panels || [], board: d.board || null, src: d.src || null, error: d.error || '',
      };
    });
    const show = () => {
      const fixtures = build();
      const json = JSON.stringify({ source: 'pog.artbox.kr', ver: 1, storeCode: store.code, storeName: store.name, saup: store.saup || '00', grabbedAt: new Date().toISOString(), fixtures });
      const warn = targets.filter(isShort);
      $msg.innerHTML = `<b>${esc(store.name)} (${esc(store.code)})</b> · 매대 ${fixtures.length}개 완료` + (warn.length ? ` · <span class="w">확인 필요 ${warn.length}개</span>` : '');
      $bar.style.width = '100%';
      $out.innerHTML = `<table><tr><th>매대명</th><th>제품</th><th>선반</th><th>파이프</th><th></th></tr>${fixtures.map(f => {
        const mis = f.itemCount !== null && f.itemCount !== f.items.length;
        return `<tr><td>${esc(f.mdName)}</td><td>${f.items.length}${mis ? ` <span class="w">(목록 ${f.itemCount})</span>` : ''}</td><td>${f.shelfCount ?? ''}</td><td>${f.pipeCount ?? ''}</td><td class="w">${esc(f.error)}</td></tr>`;
      }).join('')}</table><textarea readonly></textarea>`;
      const ta = $out.querySelector('textarea'); ta.value = json;
      const acts = [['복사하기', 'p', async e => {
        try { await navigator.clipboard.writeText(json); }
        catch { ta.select(); document.execCommand('copy'); }
        e.target.textContent = '복사됨 ✓ 이제 Global POG에 붙여넣으세요';
      }]];
      if (warn.length) acts.push([`확인 필요 ${warn.length}개 다시 읽기`, 'g', async () => {
        setActs(); $out.innerHTML = '';
        await runAll(warn, 1, 180000, `다시 읽는 중 (${warn.length}개)…`);
        show();
      }]);
      acts.push(['닫기', 'g', close]);
      setActs(...acts);
    };
    show();
  } catch (err) {
    $msg.innerHTML = `<span class="w">${esc(err.message || err)}</span>`;
    setActs(['닫기', 'g', close]);
  }
})();
