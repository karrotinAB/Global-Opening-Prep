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
    const items = [...doc.querySelectorAll('div[id^="obj"]')].filter(el => /^obj\d+$/.test(el.id)).map(el => ({
      id: el.id.slice(3),
      code: el.dataset.item || '',
      name: el.getAttribute('alt') || '',
      price: Number(el.dataset.amtk || 0),
      group: el.dataset.groupname || '',
      img: bgUrl(el),
      x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
    }));
    const props = [...doc.querySelectorAll('div[id^="prop"]')].filter(el => /^prop\d+$/.test(el.id)).map(el => ({
      id: el.id.slice(4),
      kind: (el.getAttribute('title') || '').split('#')[0].trim(),
      cls: (el.className || '').split(' ')[0],
      color: win.getComputedStyle(el).backgroundColor,
      x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight,
    }));
    return { items, props };
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
      const ci = { team: col('팀명'), name: col('매대명'), idx: col('고유번호'), shelf: col('선반'), pipe: col('파이프'), item: col('ITEM') };
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
        mdidx: t.mdidx, teamName: t.teamName, mdName: t.mdName,
        shelfCount: t.shelfCount ?? countKind(d.props, /선반/),
        pipeCount: t.pipeCount ?? countKind(d.props, /파이프/),
        itemCount: t.itemCount ?? d.items.length,
        items: d.items, props: d.props, error: d.error || '',
      };
    });
    const show = () => {
      const fixtures = build();
      const json = JSON.stringify({ source: 'pog.artbox.kr', ver: 1, storeCode: store.code, storeName: store.name, grabbedAt: new Date().toISOString(), fixtures });
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
