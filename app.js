import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDOvpyvRuCnq9YnLnFRqVdc8bryL4q-SFs",
  authDomain: "global-opening-prep.firebaseapp.com",
  projectId: "global-opening-prep",
  storageBucket: "global-opening-prep.firebasestorage.app",
  messagingSenderId: "981145496504",
  appId: "1:981145496504:web:cc191935d21fdbed28fd4d"
};

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);
const st = getStorage(fb);

/* ---------- 공통 ---------- */
const CATS = ['카테고리', '매대타입', '고리타입', '집기', '헤더문구'];
const CANVAS_W = 540, CANVAS_H = 930;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
function modal(content, { wide = false } = {}) {
  const root = $('#modal-root');
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'modal-bg', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal' + (wide ? ' wide' : '') },
      h('button', { class: 'modal-x', onclick: close }, '×'), content));
  root.append(wrap);
  return close;
}
const catName = t => (t || '').replace(/^\d+\s*/, '');
const fmtDate = ts => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '';
};
const displayName = fx => fx.headerName || fx.mdName || '';
const glossaryOf = cat => state.glossary.filter(g => g.cat === cat).sort((a, b) => (a.ko || '').localeCompare(b.ko || '', 'ko'));

const state = {
  user: null, view: 'pog-make',
  pogs: [], managers: [], glossary: [], glCat: CATS[0],
  currentPog: null, fixtures: new Map(), pageEls: new Map(), lockKey: null, unsubPog: null, unsubFx: null,
  viewer: { unsubPog: null, unsubFx: null, pog: null, fixtures: [] },
};

/* ---------- 로그인 ---------- */
onAuthStateChanged(auth, user => {
  state.user = user;
  $('#login').classList.toggle('hidden', !!user);
  $('#app').classList.toggle('hidden', !user);
  if (user) { $('#me-email').textContent = user.email; startListeners(); go(state.view); }
  else stopListeners();
});
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#login-err').textContent = '';
  try { await signInWithEmailAndPassword(auth, $('#login-email').value.trim(), $('#login-pw').value); }
  catch { $('#login-err').textContent = '로그인 실패: 이메일 또는 비밀번호를 확인해주세요.'; }
});
$('#logout').onclick = () => signOut(auth);

/* ---------- 실시간 구독 ---------- */
let unsubs = [];
function startListeners() {
  stopListeners();
  unsubs.push(onSnapshot(query(collection(db, 'pogs'), orderBy('createdAt', 'desc')), s => {
    state.pogs = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPogList(); renderOnlineList();
  }));
  unsubs.push(onSnapshot(query(collection(db, 'managers'), orderBy('name')), s => {
    state.managers = s.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshManagerSelect();
  }));
  unsubs.push(onSnapshot(collection(db, 'glossary'), s => {
    state.glossary = s.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshGlossaryLists(); renderGlossary();
  }));
}
function stopListeners() { unsubs.forEach(u => u()); unsubs = []; closePog(); closeViewer(); }

/* ---------- 메뉴 이동 ---------- */
function go(v) {
  state.view = v;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
}
$$('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));

/* ---------- 저장 (디바운스) ---------- */
const timers = {}; let pending = 0;
function setSaving() {
  const el = $('#ed-saving'); if (!el) return;
  el.textContent = pending > 0 ? '저장 중…' : '저장됨';
}
function queueWrite(key, fn) {
  if (!timers[key]) { pending++; setSaving(); }
  clearTimeout(timers[key]);
  timers[key] = setTimeout(async () => {
    delete timers[key];
    try { await fn(); } catch (e) { toast('저장 실패: ' + e.message); }
    pending--; setSaving();
  }, 500);
}
const saveFx = (pogId, fxId, f, v) => queueWrite(`${fxId}|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId, 'fixtures', fxId), { [f]: v, updatedAt: serverTimestamp(), updatedBy: state.user.email }));
const savePog = (pogId, f, v) => queueWrite(`pog|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId), { [f]: v, updatedAt: serverTimestamp() }));

/* ---------- 매대 그리기 ---------- */
function buildCanvas(fx, W, H, onItem) {
  const items = fx.items || [], props = fx.props || [];
  const wrap = h('div', { class: 'cv', style: `width:${W}px;height:${H}px` });
  const objs = [...props, ...items];
  if (!objs.length) { wrap.append(h('div', { class: 'cv-empty' }, '매대 데이터 없음')); return wrap; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objs) {
    x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
    x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + Math.max(o.h || 0, 4));
  }
  const pad = 8, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
  const sc = Math.min(W / bw, H / bh);
  const inner = h('div', { class: 'cv-in', style: `width:${bw}px;height:${bh}px;left:${(W - bw * sc) / 2}px;transform:scale(${sc})` });
  for (const p of props) {
    const color = p.color && !/rgba\(0, 0, 0, 0\)|transparent/.test(p.color) ? p.color : '#7d7d7d';
    inner.append(h('div', { class: 'cv-prop', title: p.kind || '',
      style: `left:${p.x - x0 + pad}px;top:${p.y - y0 + pad}px;width:${p.w}px;height:${Math.max(p.h || 0, 4)}px;background:${color}` }));
  }
  for (const it of items) {
    const el = h('div', { class: 'cv-item' + (onItem ? ' click' : ''), 'data-code': it.code, title: `[${it.code}] ${it.name}`,
      style: `left:${it.x - x0 + pad}px;top:${it.y - y0 + pad}px;width:${it.w}px;height:${it.h}px` },
      it.img ? h('img', { src: it.img, alt: '', referrerpolicy: 'no-referrer' }) : h('span', {}, it.name));
    if (onItem) el.onclick = () => onItem(it, fx);
    inner.append(el);
  }
  wrap.append(inner);
  return wrap;
}

/* ---------- POG 페이지 (A4 한 장 = 매대 하나) ---------- */
function buildPage(fx, pog, { editable, onItem }) {
  const pid = pog.id;
  const field = (f, el) => {
    el.dataset.f = f; el.classList.add('f');
    if (!editable) el.disabled = true;
    else {
      const fn = () => saveFx(pid, fx.id, f, el.value);
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', fn);
    }
    return el;
  };
  const box = (label, ...c) => h('div', { class: 'sbox' }, h('div', { class: 'sbox-l' }, label), h('div', { class: 'sbox-c' }, ...c));

  const page = h('div', { class: 'page' },
    h('div', { class: 'ph' },
      field('headerName', h('input', { class: 'ph-name', placeholder: fx.mdName || '매대명' })),
      h('div', { class: 'ph-cat' }, catName(fx.teamName))),
    h('div', { class: 'pb' },
      h('div', { class: 'pcanvas' }, buildCanvas(fx, CANVAS_W, CANVAS_H, onItem)),
      h('div', { class: 'pside' },
        box('매대 타입', field('fixtureType', h('input', { list: 'dl-fixtureType', placeholder: '예: 벽매대1000' }))),
        box('고리타입/갯수', h('div', { class: 'hook-row' },
          field('hookType', h('select', { class: 'hook-sel' })),
          h('span', { class: 'x' }, '×'),
          field('hookCount', h('input', { type: 'number', min: 0, class: 'hook-cnt', placeholder: '0' })))),
        box('선반/파이프여부', field('shelfPipe', h('input', { placeholder: '예: 선반 3 / 파이프 12' }))),
        box('이외집기(8코드포함)', field('otherFixtures', h('textarea', { rows: 6, placeholder: '예: 아크릴선반 8' }))))),
    h('div', { class: 'pf1' }, 'POG 담당자 ', h('span', { class: 'pf-mgr' })),
    h('div', { class: 'pf2' }, h('span', { class: 'pf-branch' })));

  const extra = h('div', { class: 'page-extra' },
    h('div', { class: 'pe-title' }, h('b', { class: 'pe-name' }), h('span', { class: 'mut' }, ` · POG 원본: ${fx.mdName || ''} · 제품 ${(fx.items || []).length}개`)),
    field('memo', h('textarea', { rows: 3, placeholder: '메모 (선택)' })),
    h('div', { class: 'photos' }));
  if (editable) {
    const up = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
    up.onchange = async () => { await uploadPhotos(pid, fx.id, [...up.files]); up.value = ''; };
    extra.append(h('button', { class: 'btn small no-print', onclick: () => up.click() }, '+ 사진 첨부'), up);
  }
  const block = h('div', { class: 'page-block', 'data-id': fx.id }, page, extra);
  block._editable = editable;
  return block;
}

function fillHookSelect(sel, v) {
  if (sel === document.activeElement) return;
  const opts = glossaryOf('고리타입').map(g => g.ko);
  if (v && !opts.includes(v)) opts.push(v);
  const sig = opts.join('\u0001');
  if (sel.dataset.sig !== sig) {
    sel.innerHTML = '';
    sel.append(h('option', { value: '' }, ''), ...opts.map(o => h('option', { value: o }, o)));
    sel.dataset.sig = sig;
  }
  sel.value = v || '';
}

function syncPage(block, fx, pog) {
  $$('[data-f]', block).forEach(el => {
    const v = fx[el.dataset.f] ?? '';
    if (el.tagName === 'SELECT') fillHookSelect(el, v);
    else if (el !== document.activeElement && el.value !== String(v)) el.value = v;
  });
  $('.pf-mgr', block).textContent = pog.manager || '';
  $('.pf-branch', block).textContent = pog.branchName || '';
  $('.pe-name', block).textContent = displayName(fx);
  renderPhotos(block, pog.id, fx);
  const empty = !(fx.memo || '').trim() && !(fx.photos || []).length;
  $('.page-extra', block).classList.toggle('empty', empty);
}

function renderPhotos(block, pogId, fx) {
  const box = $('.photos', block); box.innerHTML = '';
  for (const p of fx.photos || []) {
    const fig = h('figure', {}, h('a', { href: p.url, target: '_blank' }, h('img', { src: p.url, alt: '' })));
    if (block._editable) fig.append(h('button', { class: 'ph-del no-print', title: '삭제', onclick: () => removePhoto(pogId, fx.id, p) }, '×'));
    box.append(fig);
  }
}

async function resizeImage(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = h('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  } catch { return file; }
}
async function uploadPhotos(pogId, fxId, files) {
  if (!files.length) return;
  toast('사진 올리는 중…');
  try {
    for (const f of files) {
      const blob = await resizeImage(f);
      const path = `pogs/${pogId}/${fxId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
      await uploadBytes(sRef(st, path), blob, { contentType: blob.type || 'image/jpeg' });
      const url = await getDownloadURL(sRef(st, path));
      await updateDoc(doc(db, 'pogs', pogId, 'fixtures', fxId), { photos: arrayUnion({ url, path, name: f.name }) });
    }
    toast('사진 첨부 완료');
  } catch (e) { toast('사진 업로드 실패: ' + e.message); }
}
async function removePhoto(pogId, fxId, p) {
  if (!confirm('이 사진을 삭제할까요?')) return;
  try { await deleteObject(sRef(st, p.path)); } catch { /* 파일이 이미 없으면 무시 */ }
  await updateDoc(doc(db, 'pogs', pogId, 'fixtures', fxId), { photos: arrayRemove(p) });
}

/* ---------- 2.1 POG 목록 ---------- */
$('#pog-search').addEventListener('input', renderPogList);
function pogListItem(p, active, onClick) {
  return h('div', { class: 'pitem' + (active ? ' on' : ''), onclick: onClick },
    h('div', { class: 'pi-top' }, h('b', {}, p.branchName || p.storeName || '(이름 없음)'),
      h('span', { class: 'badge ' + (p.status === 'final' ? 'final' : 'draft') }, p.status === 'final' ? '최종' : '작성 중')),
    h('div', { class: 'pi-sub' }, `${p.storeName || ''} ${p.storeCode ? '· ' + p.storeCode : ''}`),
    h('div', { class: 'pi-sub' }, `매대 ${p.fixtureCount || 0}개 · ${fmtDate(p.createdAt)}${p.manager ? ' · ' + p.manager : ''}`));
}
function renderPogList() {
  const q = $('#pog-search').value.trim().toLowerCase();
  const list = $('#pog-list'); list.innerHTML = '';
  const rows = state.pogs.filter(p => !q || [p.storeName, p.branchName, p.storeCode, p.manager].join(' ').toLowerCase().includes(q));
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, 'POG가 없어요.'));
  rows.forEach(p => list.append(pogListItem(p, state.currentPog?.id === p.id, () => openPog(p.id))));
}

/* ---------- 2.1 편집기 ---------- */
function closePog() {
  state.unsubPog?.(); state.unsubFx?.();
  state.unsubPog = state.unsubFx = null;
  state.currentPog = null; state.fixtures = new Map(); state.pageEls = new Map(); state.lockKey = null;
  $('#editor-body')?.classList.add('hidden'); $('#editor-empty')?.classList.remove('hidden');
}
function openPog(id) {
  closePog();
  $('#editor-empty').classList.add('hidden'); $('#editor-body').classList.remove('hidden');
  $('#ed-pages').innerHTML = '<div class="mut pad">불러오는 중…</div>';
  state.currentPog = { id };
  renderPogList();
  state.unsubPog = onSnapshot(doc(db, 'pogs', id), d => {
    if (!d.exists()) { closePog(); renderPogList(); return; }
    state.currentPog = { id: d.id, ...d.data() };
    applyPogDoc();
  });
  state.unsubFx = onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => {
    const ids = new Set();
    s.docs.forEach(d => { ids.add(d.id); state.fixtures.set(d.id, { id: d.id, ...d.data() }); });
    [...state.fixtures.keys()].forEach(k => { if (!ids.has(k)) state.fixtures.delete(k); });
    renderEditorPages();
  });
}
function applyPogDoc() {
  const p = state.currentPog;
  $('#ed-title').textContent = `${p.storeName || ''} ${p.storeCode ? '(' + p.storeCode + ')' : ''}`;
  const br = $('#ed-branch'); if (br !== document.activeElement) br.value = p.branchName || '';
  refreshManagerSelect();
  const final = p.status === 'final';
  $('#ed-status').textContent = final ? '최종' : '작성 중';
  $('#ed-status').className = 'badge ' + (final ? 'final' : 'draft');
  $('#ed-final').textContent = final ? '잠금 해제 (다시 수정)' : '최종 POG 내보내기';
  $('#ed-final').classList.toggle('primary', !final);
  br.disabled = final; $('#ed-manager').disabled = final;
  const key = final ? 'ro' : 'rw';
  if (state.lockKey !== key) {
    state.lockKey = key;
    state.pageEls.forEach(el => el.remove()); state.pageEls = new Map();
  }
  renderEditorPages();
}
function renderEditorPages() {
  const pog = state.currentPog;
  if (!pog || pog.status === undefined) return; // 문서 본체가 아직 안 왔으면 대기
  const wrap = $('#ed-pages');
  wrap.querySelector(':scope > .pad')?.remove();
  for (const [id, el] of state.pageEls) if (!state.fixtures.has(id)) { el.remove(); state.pageEls.delete(id); }
  const order = [...state.fixtures.values()].sort((a, b) => a.order - b.order);
  order.forEach((fx, i) => {
    let el = state.pageEls.get(fx.id);
    if (!el) { el = buildPage(fx, pog, { editable: pog.status !== 'final' }); state.pageEls.set(fx.id, el); }
    syncPage(el, fx, pog);
    if (wrap.children[i] !== el) wrap.insertBefore(el, wrap.children[i] || null);
  });
}

$('#ed-branch').addEventListener('input', e => {
  const p = state.currentPog; if (!p) return;
  p.branchName = e.target.value; savePog(p.id, 'branchName', e.target.value);
  state.pageEls.forEach(el => $('.pf-branch', el).textContent = e.target.value);
});
function refreshManagerSelect() {
  const sel = $('#ed-manager'); if (!sel) return;
  const cur = state.currentPog?.manager || '';
  const names = state.managers.map(m => m.name);
  if (cur && !names.includes(cur)) names.push(cur);
  sel.innerHTML = '';
  sel.append(h('option', { value: '' }, '선택'), ...names.map(n => h('option', { value: n }, n)), h('option', { value: '__new' }, '+ 새 담당자 추가'));
  sel.value = cur;
}
$('#ed-manager').addEventListener('change', async e => {
  const p = state.currentPog; if (!p) return;
  let v = e.target.value;
  if (v === '__new') {
    const name = (prompt('새 담당자 이름') || '').trim();
    if (!name) { e.target.value = p.manager || ''; return; }
    if (!state.managers.some(m => m.name === name)) await addDoc(collection(db, 'managers'), { name, createdAt: serverTimestamp() });
    v = name;
  }
  p.manager = v;
  await updateDoc(doc(db, 'pogs', p.id), { manager: v, updatedAt: serverTimestamp() });
});
$('#ed-final').onclick = async () => {
  const p = state.currentPog; if (!p) return;
  if (p.status === 'final') {
    if (!confirm('잠금을 풀고 다시 수정할 수 있게 할까요? 온라인 POG 목록에서는 빠져요.')) return;
    await updateDoc(doc(db, 'pogs', p.id), { status: 'draft', updatedAt: serverTimestamp() });
    return;
  }
  const miss = [];
  if (!p.branchName) miss.push('지점명');
  if (!p.manager) miss.push('담당자');
  const noName = [...state.fixtures.values()].filter(f => !f.headerName).length;
  if (noName) miss.push(`매대명 미입력 ${noName}개 (POG 원본 이름으로 표시돼요)`);
  const msg = (miss.length ? '확인 필요: ' + miss.join(', ') + '\n\n' : '') + '최종 POG로 내보낼까요? 내보내면 수정이 잠기고 온라인 POG와 번역 화면에서 쓸 수 있어요.';
  if (!confirm(msg)) return;
  await updateDoc(doc(db, 'pogs', p.id), { status: 'final', finalizedAt: serverTimestamp(), finalizedBy: state.user.email, updatedAt: serverTimestamp() });
  toast('최종 POG로 내보냈어요');
};
$('#ed-delete').onclick = async () => {
  const p = state.currentPog; if (!p) return;
  if (!confirm(`'${p.branchName || p.storeName}' POG를 삭제할까요? 되돌릴 수 없어요.`)) return;
  const fxs = await getDocs(collection(db, 'pogs', p.id, 'fixtures'));
  for (const d of fxs.docs) for (const ph of d.data().photos || []) { try { await deleteObject(sRef(st, ph.path)); } catch { } }
  let b = writeBatch(db), n = 0;
  for (const d of fxs.docs) { b.delete(d.ref); if (++n >= 400) { await b.commit(); b = writeBatch(db); n = 0; } }
  await b.commit();
  await deleteDoc(doc(db, 'pogs', p.id));
  closePog(); renderPogList(); toast('삭제했어요');
};
$('#ed-pdf').onclick = () => printPages($('#ed-pages'), state.currentPog);

/* ---------- PDF (인쇄) ---------- */
function printPages(container, pog) {
  const imgs = $$('img', container).filter(i => !i.complete);
  const old = document.title;
  document.title = `POG_${pog?.branchName || pog?.storeName || ''}_${fmtDate(new Date())}`.replace(/[\\/:*?"<>|]/g, '');
  const done = () => { document.title = old; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  if (imgs.length) toast('이미지 불러오는 중…');
  Promise.all(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 8000); })))
    .then(() => window.print());
}

/* ---------- 새 POG 가져오기 ---------- */
$('#btn-import').onclick = openImport;
function openImport() {
  const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  const bm = `javascript:(function(){var s=document.createElement('script');s.charset='utf-8';s.src='${base}pog-grab.js?v='+Date.now();document.body.appendChild(s);})();`;
  const link = h('a', { class: 'bm-link', href: bm, onclick: e => { e.preventDefault(); toast('이 버튼을 북마크바로 끌어다 놓으세요'); } }, '📥 POG 가져오기');
  const ta = h('textarea', { class: 'import-ta', placeholder: '여기에 붙여넣기 (Ctrl+V)' });
  const go = h('button', { class: 'btn primary' }, '가져오기');
  const close = modal(h('div', {},
    h('h3', {}, '새 POG 가져오기'),
    h('ol', { class: 'steps' },
      h('li', {}, '처음 한 번만: 아래 버튼을 브라우저 북마크바로 끌어다 놓으세요. ', link),
      h('li', {}, 'POG 사이트에서 매장의 매대 목록 화면을 열고 북마크를 누르세요. 체크한 매대만 가져오고, 아무것도 체크 안 하면 전체를 가져와요. (매대 보기 화면에서 누르면 그 매대 하나만)'),
      h('li', {}, '다 모이면 뜨는 창에서 \'복사하기\'를 누르고, 아래 칸에 붙여넣으세요.')),
    ta, h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '가져오는 중…';
    const ok = await doImport(ta.value);
    if (ok) close(); else { go.disabled = false; go.textContent = '가져오기'; }
  };
}
async function doImport(text) {
  let data;
  try { data = JSON.parse(text.trim()); } catch { toast('붙여넣은 내용이 올바르지 않아요'); return false; }
  if (!data || data.source !== 'pog.artbox.kr' || !Array.isArray(data.fixtures) || !data.fixtures.length) {
    toast('POG 데이터가 아니에요'); return false;
  }
  try {
    const ref = await addDoc(collection(db, 'pogs'), {
      storeCode: data.storeCode || '', storeName: data.storeName || '',
      branchName: '', manager: '', status: 'draft', fixtureCount: data.fixtures.length,
      grabbedAt: data.grabbedAt || '', createdAt: serverTimestamp(), createdBy: state.user.email, updatedAt: serverTimestamp(),
    });
    let b = writeBatch(db), n = 0;
    for (const [i, f] of data.fixtures.entries()) {
      const shelf = f.shelfCount ?? 0, pipe = f.pipeCount ?? 0;
      b.set(doc(db, 'pogs', ref.id, 'fixtures', String(f.mdidx || 'fx' + i)), {
        order: i, mdidx: String(f.mdidx || ''), teamName: f.teamName || '', mdName: f.mdName || '',
        shelfCount: shelf, pipeCount: pipe, itemCount: f.itemCount ?? (f.items || []).length,
        items: f.items || [], props: f.props || [],
        headerName: '', fixtureType: '', hookType: '', hookCount: '',
        shelfPipe: [shelf ? `선반 ${shelf}` : '', pipe ? `파이프 ${pipe}` : ''].filter(Boolean).join(' / '),
        otherFixtures: '', memo: '', photos: [],
      });
      if (++n >= 400) { await b.commit(); b = writeBatch(db); n = 0; }
    }
    await b.commit();
    toast(`매대 ${data.fixtures.length}개를 가져왔어요`);
    openPog(ref.id);
    return true;
  } catch (e) { toast('가져오기 실패: ' + e.message); return false; }
}

/* ---------- 2.3 온라인 POG ---------- */
$('#on-search').addEventListener('input', renderOnlineList);
function renderOnlineList() {
  const q = $('#on-search').value.trim().toLowerCase();
  const list = $('#on-list'); list.innerHTML = '';
  const rows = state.pogs.filter(p => p.status === 'final' && (!q || [p.storeName, p.branchName, p.storeCode, p.manager].join(' ').toLowerCase().includes(q)));
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, '최종 POG가 없어요.'));
  rows.forEach(p => list.append(pogListItem(p, state.viewer.pog?.id === p.id, () => openViewer(p.id))));
}
function closeViewer() {
  const v = state.viewer; v.unsubPog?.(); v.unsubFx?.();
  v.unsubPog = v.unsubFx = null; v.pog = null; v.fixtures = [];
  $('#viewer-body')?.classList.add('hidden'); $('#viewer-empty')?.classList.remove('hidden');
}
function openViewer(id) {
  closeViewer();
  const v = state.viewer;
  v.pog = { id };
  $('#viewer-empty').classList.add('hidden'); $('#viewer-body').classList.remove('hidden');
  $('#vw-pages').innerHTML = '<div class="mut pad">불러오는 중…</div>';
  renderOnlineList();
  v.unsubPog = onSnapshot(doc(db, 'pogs', id), d => { if (!d.exists()) { closeViewer(); return; } v.pog = { id: d.id, ...d.data() }; renderViewer(); });
  v.unsubFx = onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => { v.fixtures = s.docs.map(d => ({ id: d.id, ...d.data() })); renderViewer(); });
}
function renderViewer() {
  const v = state.viewer; if (!v.pog?.status) return;
  $('#vw-title').textContent = `${v.pog.branchName || v.pog.storeName || ''} · 최종 ${fmtDate(v.pog.finalizedAt)}${v.pog.manager ? ' · ' + v.pog.manager : ''}`;
  const wrap = $('#vw-pages'); wrap.innerHTML = '';
  v.fixtures.forEach(fx => { const el = buildPage(fx, v.pog, { editable: false, onItem: showItem }); syncPage(el, fx, v.pog); wrap.append(el); });
}
$('#vw-pdf').onclick = () => printPages($('#vw-pages'), state.viewer.pog);
function showItem(it, fx) {
  modal(h('div', { class: 'item-pop' },
    h('div', { class: 'ip-img' }, it.img ? h('img', { src: it.img, alt: '', referrerpolicy: 'no-referrer' }) : null),
    h('div', { class: 'ip-info' },
      h('h3', {}, it.name),
      h('table', {},
        h('tr', {}, h('th', {}, '제품코드'), h('td', {}, it.code)),
        h('tr', {}, h('th', {}, '가격'), h('td', {}, it.price ? '₩' + Number(it.price).toLocaleString() : '-')),
        h('tr', {}, h('th', {}, '바코드'), h('td', { class: 'mut' }, '제품 DB 연결 후 표시')),
        h('tr', {}, h('th', {}, '매대'), h('td', {}, displayName(fx))),
        h('tr', {}, h('th', {}, '진열 그룹'), h('td', {}, it.group || '-'))))));
}

/* ---------- 3. 용어 사전 ---------- */
let glDirty = false;
function refreshGlossaryLists() {
  const dl = $('#dl-fixtureType'); dl.innerHTML = '';
  glossaryOf('매대타입').forEach(g => dl.append(h('option', { value: g.ko })));
  $$('select.hook-sel').forEach(sel => fillHookSelect(sel, sel.value));
}
function renderGlossary() {
  const body = $('#gl-body');
  if (body.contains(document.activeElement)) { glDirty = true; return; }
  glDirty = false;
  const tabs = $('#gl-tabs'); tabs.innerHTML = '';
  CATS.forEach(c => tabs.append(h('button', { class: c === state.glCat ? 'on' : '', onclick: () => { state.glCat = c; renderGlossary(); } },
    `${c} `, h('span', { class: 'cnt' }, glossaryOf(c).length))));
  body.innerHTML = '';
  const rows = glossaryOf(state.glCat);
  if (!rows.length) body.append(h('tr', {}, h('td', { colspan: 3, class: 'mut pad' }, '등록된 단어가 없어요.')));
  rows.forEach(g => {
    const inp = (f) => {
      const el = h('input', { value: g[f] || '' });
      el.addEventListener('change', () => updateDoc(doc(db, 'glossary', g.id), { [f]: el.value.trim(), updatedAt: serverTimestamp() }));
      return el;
    };
    body.append(h('tr', {}, h('td', {}, inp('ko')), h('td', {}, inp('en')),
      h('td', { class: 'tc' }, h('button', { class: 'btn ghost danger small', onclick: async () => {
        if (confirm(`'${g.ko}'를 삭제할까요?`)) await deleteDoc(doc(db, 'glossary', g.id));
      } }, '삭제'))));
  });
}
$('#gl-body').addEventListener('focusout', () => setTimeout(() => { if (glDirty) renderGlossary(); }, 50));
$('#gl-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, ko = f.ko.value.trim(), en = f.en.value.trim();
  if (!ko) return;
  if (glossaryOf(state.glCat).some(g => g.ko === ko)) { toast('이미 있는 단어예요'); return; }
  await addDoc(collection(db, 'glossary'), { cat: state.glCat, ko, en, createdAt: serverTimestamp() });
  f.reset(); f.ko.focus();
});
renderGlossary();
