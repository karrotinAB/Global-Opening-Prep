import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, limit,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, getDocs, FieldPath
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
// 헤더 매대명은 사전에 두지 않음: 매번 달라서 도면 번역(VMD 도면)에서 가져옴. 팀명은 가져온 POG에서 자동으로 채움
const CATS = ['카테고리', '매대타입', '고리타입', '선반/파이프', '집기', '팀명'];
// 계정 레벨. roles/{이메일} 문서가 없으면 'finder' (제품 찾기만)
const LEVELS = { admin: '관리자', pog: 'POG팀', vmd: 'VMD팀', global: '글로벌사업부', buyer: '바이어', finder: '제품 찾기만', editor: '편집 (예전 레벨)' };
const ASSIGNABLE = ['admin', 'pog', 'vmd', 'global', 'buyer', 'finder']; // editor는 예전 레벨: 그대로 동작하지만 새로 고를 수는 없음
// 레벨마다 볼 수 있는 화면(views)과 편집할 수 있는 부분(edit). 진짜 차단은 firestore.rules / storage.rules가 함
const STAFF_VIEWS = ['home', 'stores', 'drawing', 'pog-home', 'pog-make', 'pog-trans', 'pog-online', 'glossary', 'finder'];
const ALL_EDIT = ['stores', 'drawing', 'drawing-trans', 'pog-make', 'pog-trans', 'glossary'];
const ACCESS = {
  admin: { views: [...STAFF_VIEWS, 'accounts'], edit: ALL_EDIT },
  pog: { views: STAFF_VIEWS, edit: ['pog-make'] },
  vmd: { views: STAFF_VIEWS, edit: ['drawing'] },
  global: { views: STAFF_VIEWS, edit: ['stores', 'drawing-trans', 'pog-trans', 'glossary'] },
  buyer: { views: ['home', 'drawing', 'pog-home', 'pog-online', 'finder'], edit: [] }, // 최종본만 (규칙에서도 막음)
  finder: { views: ['finder'], edit: [] },
  editor: { views: STAFF_VIEWS, edit: ALL_EDIT },
};
const access = () => ACCESS[state.level] || ACCESS.finder;
const canSee = v => access().views.includes(v);
const canEdit = area => access().edit.includes(area);
const isStaff = () => canSee('glossary'); // 내부 직원 (초안 POG·용어 사전을 볼 수 있음)
function applyAccess() {
  $$('[data-view], [data-go]').forEach(el => el.classList.toggle('hidden', !canSee(el.dataset.view || el.dataset.go)));
  $$('[data-edit]').forEach(el => el.classList.toggle('hidden', !canEdit(el.dataset.edit)));
  $('#subnav').classList.toggle('hidden', !canSee('pog-make'));
  $$('[data-staff]').forEach(el => el.classList.toggle('hidden', !isStaff()));
}
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
  return d && !isNaN(d) ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '';
};
// POG 원본 이름. 칸이 여러 개인 매대는 '(1/2)'처럼 몇 번째 칸인지 붙임
const origName = fx => (fx.mdName || '') + (fx.bayCount > 1 ? ` (${fx.bayNo}/${fx.bayCount})` : '');
const displayName = fx => fx.kind === 'free' ? (fx.headerName || '추가 페이지') : (fx.headerName || origName(fx));
const glossaryOf = cat => state.glossary.filter(g => g.cat === cat).sort((a, b) => (a.ko || '').localeCompare(b.ko || '', 'ko'));

const state = {
  user: null, level: null, view: 'home', roles: [], glLang: '', stores: [], dwMap: new Map(),
  pogs: [], managers: [], glossary: [], glCat: CATS[0],
  currentPog: null, fixtures: new Map(), pageEls: new Map(), lockKey: null, unsubPog: null, unsubFx: null,
  viewer: { unsubPog: null, unsubFx: null, pog: null, fixtures: [] },
};

let edThumbs, vwThumbs, trThumbs; // 아래 썸네일 함수가 정의된 뒤 만들어짐

/* ---------- 로그인 ---------- */
let unsubRole = null;
onAuthStateChanged(auth, user => {
  state.user = user;
  unsubRole?.(); unsubRole = null;
  stopListeners(); setLevel(null);
  $('#login').classList.toggle('hidden', !!user);
  $('#app').classList.toggle('hidden', !user);
  if (!user) return;
  $('#me-email').textContent = user.email;
  // 내 레벨을 읽고, 관리자가 바꾸면 바로 반영
  unsubRole = onSnapshot(doc(db, 'roles', user.email.toLowerCase()),
    d => {
      const lv = d.data()?.level;
      if (!d.exists()) console.warn(`roles/${user.email.toLowerCase()} 문서가 없어서 '제품 찾기만'으로 동작해요`);
      else if (!LEVELS[lv]) console.warn(`roles/${user.email.toLowerCase()}의 level 값 '${lv}'을 알 수 없어서 '제품 찾기만'으로 동작해요`);
      setLevel(LEVELS[lv] ? lv : 'finder');
    },
    e => {
      setLevel('finder');
      alert(`계정 레벨을 읽지 못해서 '제품 찾기만'으로 열었어요.\n(${e.code || e.message})\n\nFirebase 콘솔 → Firestore Database → 규칙 탭에 firestore.rules 내용이 게시돼 있는지 확인해주세요.`);
    });
});
function setLevel(lv) {
  if (lv === state.level) return;
  state.level = lv;
  document.body.dataset.level = lv || '';
  $('#me-level').textContent = lv ? LEVELS[lv] : '';
  if (!lv) return;
  applyAccess();
  stopListeners(); startListeners();
  go(state.view);
}
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
  // 바이어·매장 계정은 최종 POG만 읽을 수 있음 (규칙도 같음). 정렬은 여기서 (색인 없이)
  const pq = isStaff() ? query(collection(db, 'pogs'), orderBy('createdAt', 'desc')) : query(collection(db, 'pogs'), where('status', '==', 'final'));
  unsubs.push(onSnapshot(pq, s => {
    state.pogs = s.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderPogList(); renderOnlineList(); renderTrList(); scheduleTeamSync();
  }, e => toast('POG 목록을 읽지 못했어요: ' + e.code)));
  if (state.level === 'admin') unsubs.push(onSnapshot(collection(db, 'roles'), s => {
    state.roles = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAccounts();
  }));
  if (!isStaff()) return; // 바이어·매장 계정: 사전·담당자는 필요 없음
  unsubs.push(onSnapshot(collection(db, 'stores'), s => {
    state.stores = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    renderStores(); renderDwList(); if (tr.pog) subTrDw();
  }, e => toast('매장 목록을 읽지 못했어요: ' + e.code)));
  unsubs.push(onSnapshot(collection(db, 'drawings'), s => {
    state.dwMap = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderStores(); renderDwList();
  }, () => { }));
  unsubs.push(onSnapshot(query(collection(db, 'managers'), orderBy('name')), s => {
    state.managers = s.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshManagerSelect();
  }));
  unsubs.push(onSnapshot(collection(db, 'glossary'), s => {
    state.glossary = s.docs.map(d => ({ id: d.id, ...d.data() }));
    glLoaded = true;
    refreshGlossaryLists(); renderGlossary(); scheduleTeamSync(); renderTr();
  }));
}
function stopListeners() { unsubs.forEach(u => u()); unsubs = []; closePog(); closeViewer(); closeTr(); closeDw(); }

/* ---------- 메뉴 이동 ---------- */
function go(v) {
  if (!$('#v-' + v)) v = 'home';
  if (!canSee(v)) v = canSee('home') ? 'home' : 'finder';
  state.view = v;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v || (!!b.dataset.group && v.startsWith(b.dataset.group))));
  $('#subnav').classList.toggle('on', v.startsWith('pog-') && v !== 'pog-home');
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  window.scrollTo(0, 0);
}
$$('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));
$$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
$('#btn-accounts').onclick = () => go('accounts');

/* ---------- 저장 (디바운스) ---------- */
const timers = {}; let pending = 0;
function setSaving() {
  for (const el of [$('#ed-saving'), $('#tr-saving'), $('#dw-saving')]) if (el) el.textContent = pending > 0 ? '저장 중…' : '저장됨';
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
const pendingKey = key => !!timers[key];
const saveFx = (pogId, fxId, f, v) => queueWrite(`${fxId}|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId, 'fixtures', fxId), { [f]: v, updatedAt: serverTimestamp(), updatedBy: state.user.email }));
const savePog = (pogId, f, v) => queueWrite(`${pogId}|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId), { [f]: v, updatedAt: serverTimestamp() }));

/* ---------- 매대 그리기 ---------- */
// 겹친 제품의 앞뒤: POG 사이트 값(it.z), POG 만들기에서 '맨 앞으로/맨 뒤로' 한 값(fx.itemZ)이 우선
const itemZ = (fx, it) => 1000 + (fx.itemZ?.[it.id] ?? it.z ?? 0);
function applyItemZ(block, fx) {
  const byId = new Map((fx.items || []).map(it => [String(it.id), it]));
  block.querySelectorAll('.page .cv-item').forEach(el => { const it = byId.get(el.dataset.id); if (it) el.style.zIndex = itemZ(fx, it); });
}
function buildCanvas(fx, W, H, onItem, { lazy = false } = {}) {
  const items = fx.items || [];
  const wrap = h('div', { class: 'cv', style: `width:${W}px;height:${H}px` });
  // 가로 범위 = 매대(선반·파이프·넓은 판) 폭 + 제품이 삐져나온 만큼만. 여러 칸에 걸친 긴 집기는 이 범위에서 자른다
  const core = objs => { const ws = objs.map(o => o.w).sort((a, b) => a - b), med = ws[Math.floor(ws.length / 2)]; return objs.filter(o => o.w <= med * 1.6); };
  const frameAll = [...(fx.props || []), ...(fx.panels || []).filter(p => p.w >= 40)];
  let wx0 = -Infinity, wx1 = Infinity;
  if (frameAll.length) {
    const c = core(frameAll);
    wx0 = Math.min(...c.map(o => o.x), ...items.map(i => i.x));
    wx1 = Math.max(...c.map(o => o.x + o.w), ...items.map(i => i.x + i.w));
  }
  const clip = o => { const a = Math.max(o.x, wx0), b = Math.min(o.x + o.w, wx1); return b > a ? { ...o, x: a, w: b - a } : null; };
  const props = (fx.props || []).map(clip).filter(Boolean), panels = (fx.panels || []).map(clip).filter(Boolean);
  const objs = [...panels, ...props, ...items];
  if (!objs.length) { wrap.append(h('div', { class: 'cv-empty' }, '매대 데이터 없음')); return wrap; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of objs) {
    x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y);
    x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + Math.max(o.h || 0, 4));
  }
  const pad = 8, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
  const sc = Math.min(W / bw, H / bh);
  const inner = h('div', { class: 'cv-in', style: `width:${bw}px;height:${bh}px;left:${(W - bw * sc) / 2}px;transform:scale(${sc})` });
  // 매대 뒤 회색 바탕: 선반·파이프·배경판의 가로 범위 × 전체 높이 (붙인 매대는 매대마다 따로)
  const groups = new Map();
  for (const o of [...props, ...panels.filter(p => p.w >= 40)]) { const g = o._g || 0; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(o); }
  for (const frame of groups.values()) {
    const c = core(frame), fx0 = Math.min(...c.map(o => o.x)), fx1 = Math.max(...c.map(o => o.x + o.w));
    inner.append(h('div', { class: 'cv-back', style: `left:${fx0 - x0 + pad}px;top:${pad}px;width:${fx1 - fx0}px;height:${y1 - y0}px` }));
  }
  for (const p of panels) {
    const color = p.color && !/rgba\(0, 0, 0, 0\)|transparent/.test(p.color) ? p.color : '#cfcfcf';
    inner.append(h('div', { class: 'cv-panel', style: `left:${p.x - x0 + pad}px;top:${p.y - y0 + pad}px;width:${p.w}px;height:${p.h}px;background:${color}` }));
  }
  for (const p of props) {
    const color = p.color && !/rgba\(0, 0, 0, 0\)|transparent/.test(p.color) ? p.color : '#7d7d7d';
    inner.append(h('div', { class: 'cv-prop', title: p.kind || '',
      style: `left:${p.x - x0 + pad}px;top:${p.y - y0 + pad}px;width:${p.w}px;height:${Math.max(p.h || 0, 4)}px;background:${color}` }));
  }
  for (const it of items) {
    const el = h('div', { class: 'cv-item' + (onItem ? ' click' : ''), 'data-code': it.code, 'data-id': it.id, title: `[${it.code}] ${it.name}`,
      style: `left:${it.x - x0 + pad}px;top:${it.y - y0 + pad}px;width:${it.w}px;height:${it.h}px;z-index:${itemZ(fx, it)}` },
      it.img ? h('img', { src: it.img, alt: '', referrerpolicy: 'no-referrer', loading: lazy ? 'lazy' : null }) : h('span', {}, it.name));
    if (onItem) el.onclick = () => onItem(it, fx);
    inner.append(el);
  }
  wrap.append(inner);
  return wrap;
}

/* ---------- 표지 (매장명 + POG) ---------- */
// 제목을 따로 안 적으면 지점명에서 끝의 '점'을 뺀 이름 (Keruen City점 → Keruen City)
const autoCoverTitle = pog => (pog.branchName || pog.storeName || '').trim().replace(/\s*점$/, '');
// 페이지 왼쪽 아래 매장명: 지점명, 없으면 POG 사이트의 매장명
const footStore = pog => pog.branchName || pog.storeName || '';
const coverTitle = pog => pog.coverTitle || autoCoverTitle(pog);
function buildCover(pog, { editable, L = LABELS_KO }) {
  const title = h('input', { class: 'f cover-title' });
  if (!editable) title.disabled = true;
  else title.addEventListener('input', () => savePog(pog.id, 'coverTitle', title.value));
  const page = h('div', { class: 'page cover' },
    h('div', { class: 'ph' }),
    h('div', { class: 'cover-gap' }),
    h('div', { class: 'cover-body' }, title, h('div', { class: 'cover-pog' }, 'POG')),
    h('div', { class: 'pf1' }, L.mgr + ' ', h('span', { class: 'pf-mgr' })),
    h('div', { class: 'pf2' }, h('span', { class: 'pf-branch' })));
  return h('div', { class: 'page-block cover-block', 'data-id': '__cover' }, page);
}
function syncCover(block, pog) {
  const t = $('.cover-title', block);
  t.placeholder = autoCoverTitle(pog) || '매장명';
  if (t !== document.activeElement && t.value !== (pog.coverTitle || '')) t.value = pog.coverTitle || '';
  $('.pf-mgr', block).textContent = pog.manager || '';
  $('.pf-branch', block).textContent = footStore(pog);
}

/* ---------- 슬라이드 목록 (PPT처럼 왼쪽 썸네일) ---------- */
function makeThumbs(box, scroller, onActive) {
  const els = new Map();
  let active = null;
  const setActive = id => {
    els.forEach((t, k) => {
      const on = k === id;
      if (on && !t.classList.contains('on')) { // 썸네일 목록만 움직임 (페이지 화면은 그대로)
        const a = t.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (a.top < b.top) box.scrollTop += a.top - b.top;
        else if (a.bottom > b.bottom) box.scrollTop += a.bottom - b.bottom;
      }
      t.classList.toggle('on', on);
    });
    if (id !== active) { active = id; onActive?.(id); }
  };
  // 스크롤하면 지금 보고 있는 페이지를 표시
  let raf = 0;
  scroller.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const top = scroller.getBoundingClientRect().top + 120;
      let cur = els.keys().next().value;
      for (const [id, t] of els) if (t._block?.getBoundingClientRect().top <= top) cur = id;
      setActive(cur);
    });
  });
  return {
    clear() { els.clear(); box.innerHTML = ''; active = null; },
    setActive,
    // entries: [{ id, block, name, fx }]  fx가 없으면 표지
    sync(entries) {
      const ids = new Set(entries.map(e => e.id));
      for (const [id, t] of els) if (!ids.has(id)) { t.remove(); els.delete(id); }
      entries.forEach((e, i) => {
        let t = els.get(e.id);
        if (!t) {
          const body = e.fx && e.fx.kind !== 'free' ? buildCanvas(e.fx, 116, 150, null, { lazy: true }) : h('div', { class: 'th-cover' });
          t = h('div', { class: 'thumb', title: e.name },
            h('div', { class: 'th-no' }),
            h('div', { class: 'th-page' }, h('div', { class: 'th-head' }, h('span', { class: 'th-name' })), h('div', { class: 'th-body' }, body)));
          t.onclick = () => { t._block?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActive(e.id); };
          els.set(e.id, t);
        }
        t._block = e.block;
        t.title = e.name;
        const sig = e.fx ? itemSig(e.fx) : '';
        if (e.fx && e.fx.kind !== 'free' && t._sig !== undefined && t._sig !== sig) $('.th-body', t).replaceChildren(buildCanvas(e.fx, 116, 150, null, { lazy: true }));
        t._sig = sig;
        $('.th-no', t).textContent = i + 1;
        t.classList.toggle('need', !!e.need); t.dataset.need = e.need || '';
        $('.th-name', t).textContent = e.fx ? e.name : '';
        if (!e.fx || e.fx.kind === 'free') { const c = $('.th-cover', t); c.innerHTML = ''; c.append(h('b', {}, e.name), e.fx ? h('small', {}, '추가 페이지') : h('b', {}, 'POG')); }
        if (box.children[i] !== t) box.insertBefore(t, box.children[i] || null);
      });
      if (!box.querySelector('.thumb.on') && entries[0]) setActive(entries[0].id);
    },
  };
}
// 제품·집기가 바뀌었는지 (바뀌면 그림을 다시 그림): 개수 + 코드·위치를 짧게 줄인 값
const itemSig = fx => {
  const str = [...(fx.items || []).map(i => `${i.code}@${i.x},${i.y},${i.w},${i.h}`), ...(fx.props || []).map(p => `${p.x},${p.y},${p.w}`), ...(fx.panels || []).map(p => `${p.x},${p.y},${p.w},${p.h}`)].join('|');
  let hh = 0; for (let i = 0; i < str.length; i++) hh = (hh * 31 + str.charCodeAt(i)) | 0;
  return `${(fx.items || []).length}:${(fx.props || []).length}:${hh}`;
};
/* 매대 붙이기: 얇은 매대(스페이스월 등) 두 개를 한 페이지에. 붙인 쪽 fixture.merged = [id…], 붙여진 쪽 .mergedInto = id.
   붙여진 페이지는 따로 안 나오고, 붙인 페이지 그림 오른쪽에 나란히 그린다 (입력칸·번역은 붙인 페이지 것) */
function combineFx(host, kids) {
  const ext = f => { const xs = [...(f.props || []), ...(f.panels || []), ...(f.items || [])]; return xs.length ? [Math.min(...xs.map(o => o.x)), Math.max(...xs.map(o => o.x + o.w))] : [0, 0]; };
  let right = ext(host)[1];
  const out = { ...host, items: [...(host.items || [])], props: [...(host.props || [])], panels: [...(host.panels || [])], _kids: kids.map(k => k.id) };
  kids.forEach((k, gi) => {
    const [l, r] = ext(k), dx = right + 40 - l, sh = o => ({ ...o, x: o.x + dx, _g: gi + 1 });
    out.items.push(...(k.items || []).map(sh)); out.props.push(...(k.props || []).map(sh)); out.panels.push(...(k.panels || []).map(sh));
    right = r + dx;
  });
  return out;
}
function composeFx(list) {
  const byId = new Map(list.map(f => [f.id, f]));
  return list.filter(f => !(f.mergedInto && byId.has(f.mergedInto))).map(f => {
    const kids = (f.merged || []).map(id => byId.get(id)).filter(k => k && k.mergedInto === f.id);
    return kids.length ? combineFx(f, kids) : f;
  });
}
async function mergeNext(pogId, host, kid) {
  const b = writeBatch(db), ids = [kid.id, ...(kid.merged || [])];
  b.update(doc(db, 'pogs', pogId, 'fixtures', host.id), { merged: [...(host.merged || []), ...ids], updatedAt: serverTimestamp() });
  ids.forEach(id => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { mergedInto: host.id }));
  if ((kid.merged || []).length) b.update(doc(db, 'pogs', pogId, 'fixtures', kid.id), { merged: [] });
  await b.commit();
  toast(`'${displayName(kid)}'을(를) 이 페이지에 붙였어요`);
}
async function unmerge(pogId, host, kidId) {
  const b = writeBatch(db);
  b.update(doc(db, 'pogs', pogId, 'fixtures', host.id), { merged: (host.merged || []).filter(x => x !== kidId), updatedAt: serverTimestamp() });
  b.update(doc(db, 'pogs', pogId, 'fixtures', kidId), { mergedInto: '' });
  await b.commit();
}

const slideEntries = (cover, pog, fixtures, blockOf) => [
  { id: '__cover', block: cover, name: coverTitle(pog) || '표지' },
  ...fixtures.map(fx => ({ id: fx.id, block: blockOf(fx), name: displayName(fx), fx })),
];
edThumbs = makeThumbs($('#ed-thumbs'), $('#ed-pages'), id => { state.edActive = id; renderSidePanel(); });
vwThumbs = makeThumbs($('#vw-thumbs'), $('#vw-pages'));
trThumbs = makeThumbs($('#tr-thumbs'), $('#tr-pages'), id => { tr.active = id; renderTrSide(true); });
$$('.list-toggle').forEach(b => b.onclick = () => b.closest('.split').classList.toggle('list-off'));

/* ---------- POG 페이지 (A4 한 장 = 매대 하나) ---------- */
function buildPage(fx, pog, { editable, onItem, L = LABELS_KO }) {
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

  if (fx.kind === 'free') return buildFreePage(fx, pog, { editable, field, L });
  const page = h('div', { class: 'page' },
    h('div', { class: 'ph' },
      field('headerName', h('input', { class: 'ph-name', placeholder: origName(fx) || '매대명',
        onclick: e => { if (editable && !e.target.value) openHeaderPicker(pog, fx); } })), // 비어 있으면 누를 때 도면이 뜸
      editable ? h('button', { class: 'ph-dw no-print', type: 'button', title: '도면에서 매대를 골라 헤더에 넣어요', onclick: () => openHeaderPicker(pog, fx) }, '📐 도면에서 고르기') : null,
      h('div', { class: 'ph-cat' }, fx._cat ?? catName(fx.teamName))),
    h('div', { class: 'pb' },
      h('div', { class: 'pcanvas' }, buildCanvas(fx, CANVAS_W, CANVAS_H, onItem)),
      h('div', { class: 'pside' },
        box(L.type, field('fixtureType', h('input', { list: 'dl-fixtureType', placeholder: '예: 벽매대1000' }))),
        box(L.hook, h('div', { class: 'hook-row' },
          field('hookType', h('select', { class: 'hook-sel' })),
          h('span', { class: 'x' }, '×'),
          field('hookCount', h('input', { type: 'number', min: 0, class: 'hook-cnt', placeholder: '0' })))),
        box(L.sp, h('div', { class: 'sp-list' })),
        box(L.other, h('div', { class: 'ex-list' }), field('otherFixtures', h('textarea', { rows: 2, class: 'ex-memo', placeholder: editable ? '기타 메모 (선택)' : '' }))))),
    h('div', { class: 'pf1' }, L.mgr + ' ', h('span', { class: 'pf-mgr' })),
    h('div', { class: 'pf2' }, h('span', { class: 'pf-branch' })));

  const block = finishBlock(fx, pog, page, editable);
  block._extras = structuredClone(fx.extras || []);
  renderExtras(block);
  block._sp = spRows(fx); renderSp(block);
  return block;
}

/* 이외집기: 사전 '집기'에서 고르고 × 수량 (여러 줄). fixture.extras = [{ id, name, qty }]
   사전에 없는 이름을 직접 쓰면 2.2 번역에서 빨간 ! 로 표시됨 */
/* 선반/파이프여부: 고리타입처럼 [선반 ▾] × [수량] 줄들. fixture.sp = [{ id, name, qty }]
   가져올 때 POG 사이트 선반·파이프 수로 자동으로 채움. 예전 글자(shelfPipe '선반 3 / 파이프 12')만 있으면 읽어서 줄로 바꿈.
   저장할 때 shelfPipe 글자도 같이 맞춰 둠 */
const SP_DEFAULT = ['선반', '파이프'];
const autoSp = (sh, pi) => [...(sh ? [{ id: 'p0', name: '선반', qty: sh }] : []), ...(pi ? [{ id: 'p1', name: '파이프', qty: pi }] : [])];
function spRows(fx) {
  if (Array.isArray(fx.sp)) return structuredClone(fx.sp);
  const t = (fx.shelfPipe || '').trim();
  if (!t) return autoSp(fx.shelfCount, fx.pipeCount);
  const rows = []; let m, i = 0; const re = /([^\d\/,·]+?)\s*(\d+)/g;
  while ((m = re.exec(t))) rows.push({ id: 'p' + i++, name: m[1].trim(), qty: Number(m[2]) });
  return rows.length ? rows : [{ id: 'p0', name: t, qty: '' }];
}
const spText = rows => rows.filter(r => (r.name || '').trim()).map(r => `${r.name}${r.qty !== '' && r.qty != null ? ' ' + r.qty : ''}`).join(' / ');
function renderSp(block) {
  const box = block.querySelector('.page .sp-list'); if (!box) return;
  const ed = block._editable, list = block._sp;
  const save = () => { saveFx(block._pog, block._fx, 'sp', structuredClone(list)); saveFx(block._pog, block._fx, 'shelfPipe', spText(list)); };
  const opts = cur => [...new Set([...SP_DEFAULT, ...glossaryOf('선반/파이프').map(g => g.ko), ...(cur ? [cur] : [])])];
  box.replaceChildren(...list.map(x => {
    const sel = h('select', { class: 'f sp-sel', disabled: !ed }, h('option', { value: '' }, ''), ...opts(x.name).map(o => h('option', { value: o }, o)));
    sel.value = x.name || '';
    const qty = h('input', { class: 'f ex-qty', type: 'number', min: 0, placeholder: '0', disabled: !ed });
    qty.value = x.qty ?? '';
    sel.addEventListener('change', () => { x.name = sel.value; save(); });
    qty.addEventListener('input', () => { x.qty = qty.value === '' ? '' : Number(qty.value); save(); });
    return h('div', { class: 'ex-row' }, sel, h('span', { class: 'x' }, '×'), qty,
      ed ? h('button', { class: 'ex-del no-print', title: '삭제', onclick: () => { block._sp = list.filter(y => y !== x); save(); renderSp(block); } }, '×') : null);
  }), ...(ed ? [h('button', { class: 'ex-add no-print', onclick: () => { list.push({ id: uid(), name: '', qty: '' }); save(); renderSp(block); } }, '+ 추가')] : []));
  roFill(block);
}
function renderExtras(block) {
  const box = block.querySelector('.page .ex-list'); if (!box) return;
  const ed = block._editable, list = block._extras;
  const save = () => saveFx(block._pog, block._fx, 'extras', structuredClone(list));
  box.replaceChildren(...list.map(x => {
    const name = h('input', { class: 'f ex-name', list: 'dl-extras', placeholder: '집기 고르기', disabled: !ed });
    const qty = h('input', { class: 'f ex-qty', type: 'number', min: 0, placeholder: '0', disabled: !ed });
    name.value = x.name || ''; qty.value = x.qty ?? '';
    if (x.color) name.style.color = x.color;
    const col = ed ? h('input', { type: 'color', class: 'ex-color no-print', title: '글자 색', value: x.color || '#000000' }) : null;
    col?.addEventListener('input', () => { x.color = col.value; name.style.color = col.value; save(); });
    name.addEventListener('input', () => { x.name = name.value; save(); });
    qty.addEventListener('input', () => { x.qty = qty.value === '' ? '' : Number(qty.value); save(); });
    return h('div', { class: 'ex-row' }, col, name, h('span', { class: 'x' }, '×'), qty,
      ed ? h('button', { class: 'ex-del no-print', title: '삭제', onclick: () => { block._extras = list.filter(y => y !== x); save(); renderExtras(block); } }, '×') : null);
  }), ...(ed ? [h('button', { class: 'ex-add no-print', onclick: () => { list.push({ id: uid(), name: '', qty: '' }); save(); renderExtras(block); block.querySelector('.page .ex-row:last-of-type .ex-name')?.focus(); } }, '+ 집기 추가')] : []));
  roFill(block);
}
// 페이지 블록 마무리: 메모 층(네모·글상자·화살표·사진)과 편집 막대를 붙임
function finishBlock(fx, pog, page, editable) {
  const block = h('div', { class: 'page-block', 'data-id': fx.id });
  block._editable = editable;
  block._pog = pog.id; block._fx = fx.id;
  block._notes = structuredClone(fx.notes || []);
  block._sel = null;
  page.append(h('div', { class: 'anno' + (editable ? ' edit' : '') }));
  block._itemSig = itemSig(fx);
  if (editable) block._bar = buildNoteBar(block); // 오른쪽 패널에 붙여서 보여줌
  block.append(page);
  if (editable) page.addEventListener('pointerdown', e => {
    setEdActive(fx.id);
    if (e.target.closest('.nt, .nh')) return;
    selectNote(block, null);
    const item = e.target.closest('.cv-item');
    selectItem(block, item ? item.dataset.id : null);
  });
  renderNotes(block);
  return block;
}

/* ---------- 추가 페이지 (POG 없이 사진·글·메모만) ---------- */
function buildFreePage(fx, pog, { editable, field, L = LABELS_KO }) {
  const page = h('div', { class: 'page free' },
    h('div', { class: 'ph' }, field('headerName', h('input', { class: 'ph-name', placeholder: '제목 (예: 3단 각고리 참고사진)' }))),
    h('div', { class: 'pb free-body' }),
    h('div', { class: 'pf1' }, L.mgr + ' ', h('span', { class: 'pf-mgr' })),
    h('div', { class: 'pf2' }, h('span', { class: 'pf-branch' })));
  return finishBlock(fx, pog, page, editable);
}
const sortedFx = () => [...state.fixtures.values()].sort((a, b) => a.order - b.order);
async function addFreePage(pogId, afterOrder) {
  const list = sortedFx(), next = list.find(f => f.order > afterOrder);
  const order = next ? (afterOrder + next.order) / 2 : afterOrder + 1; // 사이에 끼워 넣기
  const id = 'free_' + Date.now().toString(36);
  try {
    await setDoc(doc(db, 'pogs', pogId, 'fixtures', id), {
      kind: 'free', order, headerName: '', notes: [], items: [], props: [], memo: '', photos: [],
      teamName: '', mdName: '', createdAt: serverTimestamp(), createdBy: me(),
    });
    toast('빈 페이지를 추가했어요');
    setTimeout(() => { state.pageEls.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setEdActive(id); }, 300);
  } catch (e) { toast('추가 실패: ' + e.message); }
}
async function moveFreePage(pogId, fxId, dir) {
  const list = sortedFx(), i = list.findIndex(f => f.id === fxId), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const b = writeBatch(db);
  b.update(doc(db, 'pogs', pogId, 'fixtures', list[i].id), { order: list[j].order });
  b.update(doc(db, 'pogs', pogId, 'fixtures', list[j].id), { order: list[i].order });
  await b.commit();
}
async function deleteFreePage(pogId, fx) {
  if (!confirm(`'${displayName(fx)}' 페이지를 삭제할까요?`)) return;
  for (const n of fx.notes || []) if (n.path) { try { await deleteObject(sRef(st, n.path)); } catch { } }
  await deleteDoc(doc(db, 'pogs', pogId, 'fixtures', fx.id));
}

/* ---------- 메모: 네모 박스 · 글상자 · 화살표 · 사진 ----------
   fixture.notes = [{ id, t:'box'|'text'|'arrow'|'img', ... }]  좌표는 A4 페이지 안의 px
   글상자 글자(text)는 2.2 번역에서 id로 언어별 번역을 붙임 */
const NOTE_COLORS = ['#e60012', '#f7931e', '#ffd400', '#2e9e5b', '#00a0e9', '#7b4fd6', '#222222', '#ffffff'];
const uid = () => Math.random().toString(36).slice(2, 9);
const rgba = (hex, a) => { const n = parseInt((hex || '#000000').slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const NOTE_NEW = {
  box: () => ({ t: 'box', x: 120, y: 320, w: 240, h: 120, color: '#e60012', fill: false, alpha: 0.3, bw: 3 }),
  text: () => ({ t: 'text', x: 150, y: 360, w: 170, h: 30, text: '메모', bg: '#ffd400', color: '#222222', border: '', fs: 14 }),
  arrow: () => ({ t: 'arrow', x1: 220, y1: 330, x2: 360, y2: 420, color: '#2e9e5b', bw: 3 }),
};
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
let noteSaveBlock = null; // Delete 키로 지울 때 쓰는, 지금 선택된 메모가 있는 페이지

function saveNotes(block) { saveFx(block._pog, block._fx, 'notes', structuredClone(block._notes)); }
function selectNote(block, id) {
  if (id) setEdActive(block._fx);
  if (block._sel === id) return;
  block._sel = id; noteSaveBlock = id ? block : null;
  renderNotes(block); renderNoteBar(block);
}
function renderNotes(block) {
  const layer = $('.anno', block); if (!layer) return;
  layer.innerHTML = '';
  const ed = block._editable;
  for (const n of block._notes) {
    const sel = ed && n.id === block._sel;
    if (n.t === 'arrow') {
      const svg = svgEl('svg', { class: 'nt-svg' }), mid = 'm' + uid();
      const mk = svgEl('marker', { id: mid, viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' });
      mk.append(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: n.color }));
      const defs = svgEl('defs'); defs.append(mk); svg.append(defs);
      svg.append(svgEl('line', { x1: n.x1, y1: n.y1, x2: n.x2, y2: n.y2, stroke: n.color, 'stroke-width': n.bw || 3, 'marker-end': `url(#${mid})`, 'stroke-linecap': 'round' }));
      if (ed) {
        const hit = svgEl('line', { x1: n.x1, y1: n.y1, x2: n.x2, y2: n.y2, class: 'nt nt-hit' + (sel ? ' sel' : ''), 'data-id': n.id });
        hit.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'move'));
        svg.append(hit);
      }
      layer.append(svg);
      if (sel) for (const k of ['1', '2']) {
        const hd = h('div', { class: 'nh nh-pt', style: `left:${n['x' + k]}px;top:${n['y' + k]}px` });
        hd.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'p' + k));
        layer.append(hd);
      }
      continue;
    }
    const st = `left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;`;
    let el;
    if (n.t === 'box') el = h('div', { class: 'nt nt-box', style: st + `border:${n.bw || 3}px solid ${n.color};background:${n.fill ? rgba(n.color, n.alpha ?? 0.3) : 'transparent'}` });
    else if (n.t === 'text') el = h('div', { class: 'nt nt-text', style: st + `background:${n.bg || 'transparent'};color:${n.color || '#222'};border:${n.border ? '2px solid ' + n.border : '0'}` },
      h('div', { class: 'nt-tx', style: `font-size:${n.fs || 14}px` }, n.text || '')); // 글은 안쪽 칸에 (모서리 점이 잘리지 않게)
    else if (n.t === 'img') el = h('div', { class: 'nt nt-img', style: st }, h('img', { src: n.url, alt: '', draggable: 'false' }));
    else continue;
    el.dataset.id = n.id;
    if (sel) el.classList.add('sel');
    if (ed) {
      el.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'move'));
      if (n.t === 'text') el.addEventListener('dblclick', () => block._bar?.querySelector('.nb-text')?.focus());
      if (sel) for (const c of ['nw', 'ne', 'sw', 'se']) { const hd = h('div', { class: 'nh nh-' + c }); hd.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'r-' + c)); el.append(hd); }
    }
    layer.append(el);
    if (n.t === 'text') fitText(el.querySelector('.nt-tx'), n.fs || 14);
  }
}
// 글상자: 상자 크기는 그대로 두고, 글이 넘치면 글자를 줄여서 맞춤 (화면에 보일 때만 잴 수 있음)
function fitText(el, fs) {
  if (!el.isConnected || !el.clientHeight) return;
  let f = fs;
  while (f > 7 && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) { f -= 1; el.style.fontSize = f + 'px'; }
}
function startNoteDrag(e, block, n, mode) {
  e.preventDefault(); e.stopPropagation();
  if ($('#ed-side')?.contains(document.activeElement)) document.activeElement.blur(); // 패널에서 글 쓰던 중이면 끝내고 이 페이지로
  selectNote(block, n.id);
  const sx = e.clientX, sy = e.clientY, o = { ...n };
  let moved = false;
  block._dragging = true;
  const mv = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    if (mode === 'move' && n.t === 'arrow') { n.x1 = o.x1 + dx; n.y1 = o.y1 + dy; n.x2 = o.x2 + dx; n.y2 = o.y2 + dy; }
    else if (mode === 'move') { n.x = Math.round(o.x + dx); n.y = Math.round(o.y + dy); }
    else if (mode.startsWith('r-')) { // 네 모서리: 반대쪽 모서리는 그대로
      const c = mode.slice(2), west = c.includes('w'), north = c.includes('n');
      let w = Math.max(16, Math.round(west ? o.w - dx : o.w + dx));
      let hh = Math.max(16, Math.round(north ? o.h - dy : o.h + dy));
      if (n.t === 'img') hh = Math.max(16, Math.round(w * o.h / o.w)); // 사진은 비율 유지
      n.w = w; n.h = hh;
      n.x = west ? o.x + o.w - w : o.x;
      n.y = north ? o.y + o.h - hh : o.y;
    }
    else { n['x' + mode[1]] = o['x' + mode[1]] + dx; n['y' + mode[1]] = o['y' + mode[1]] + dy; }
    renderNotes(block);
  };
  const up = () => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
    block._dragging = false;
    if (moved) saveNotes(block);
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function addNote(block, n) {
  n.id = uid();
  block._notes.push(n);
  saveNotes(block); selectNote(block, n.id);
}
function removeNote(block, id) {
  const n = block._notes.find(x => x.id === id); if (!n) return;
  block._notes = block._notes.filter(x => x.id !== id);
  if (n.path) deleteObject(sRef(st, n.path)).catch(() => { });
  block._sel = null; noteSaveBlock = null;
  saveNotes(block); renderNotes(block); renderNoteBar(block);
}
async function addImageNote(block, file) {
  toast('사진 올리는 중…');
  try {
    const blob = await resizeImage(file, 1400);
    const bmp = await createImageBitmap(blob);
    const path = `pogs/${block._pog}/${block._fx}/notes/${Date.now()}_${uid()}.jpg`;
    await uploadBytes(sRef(st, path), blob, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(sRef(st, path));
    const w = 240, hh = Math.round(w * bmp.height / bmp.width);
    addNote(block, { t: 'img', x: 140, y: 300, w, h: hh, url, path });
  } catch (e) { toast('사진 올리기 실패: ' + e.message); }
}

// 편집 막대: 추가 버튼 + 선택한 메모의 색·채우기·글 등
function buildNoteBar(block) {
  const file = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
  file.onchange = () => { if (file.files[0]) addImageNote(block, file.files[0]); file.value = ''; };
  return h('div', { class: 'nbar no-print' },
    h('div', { class: 'nb-add' }, h('span', { class: 'mut' }, '메모 추가'),
      h('button', { class: 'btn small', onclick: () => addNote(block, NOTE_NEW.box()) }, '▭ 네모'),
      h('button', { class: 'btn small', onclick: () => addNote(block, NOTE_NEW.text()) }, '✎ 글상자'),
      h('button', { class: 'btn small', onclick: () => addNote(block, NOTE_NEW.arrow()) }, '↗ 화살표'),
      h('button', { class: 'btn small', onclick: () => file.click() }, '🖼 사진'), file),
    h('div', { class: 'nb-props' }));
}
function swatches(cur, onPick, { none = false } = {}) {
  return h('span', { class: 'sw-row' },
    none ? h('button', { class: 'sw sw-none' + (!cur ? ' on' : ''), title: '없음', onclick: () => onPick('') }, '×') : null,
    ...NOTE_COLORS.map(c => h('button', { class: 'sw' + (cur === c ? ' on' : ''), style: `background:${c}`, title: c, onclick: () => onPick(c) })),
    h('input', { type: 'color', class: 'sw-pick', value: cur || '#000000', title: '다른 색', onchange: e => onPick(e.target.value) }));
}
function renderNoteBar(block) {
  const box = block._bar?.querySelector('.nb-props'); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return; // 글 쓰는 중
  box.innerHTML = '';
  const n = block._notes.find(x => x.id === block._sel);
  if (!n) { box.append(h('span', { class: 'mut' }, '메모를 누르면 색·채우기를 바꿀 수 있어요. 끌어서 옮기고, 모서리로 크기를 바꿔요.')); return; }
  const set = (patch) => { Object.assign(n, patch); saveNotes(block); renderNotes(block); renderNoteBar(block); };
  const lab = t => h('span', { class: 'nb-l' }, t);
  const sel = (v, opts, on) => { const s = h('select', { class: 'nb-sel' }, ...opts.map(([k, t]) => h('option', { value: k }, t))); s.value = String(v); s.onchange = () => on(s.value); return s; };
  if (n.t === 'box') box.append(
    lab('색'), swatches(n.color, c => set({ color: c || n.color })),
    h('label', { class: 'nb-chk' }, h('input', { type: 'checkbox', checked: !!n.fill, onchange: e => set({ fill: e.target.checked }) }), ' 채우기'),
    n.fill ? sel(n.alpha ?? 0.3, [['0.25', '연하게'], ['0.5', '중간'], ['1', '진하게']], v => set({ alpha: Number(v) })) : null,
    lab('굵기'), sel(n.bw || 3, [['1', '1'], ['2', '2'], ['3', '3'], ['5', '5']], v => set({ bw: Number(v) })));
  if (n.t === 'text') {
    const ta = h('textarea', { class: 'nb-text', rows: 2 });
    ta.value = n.text || '';
    ta.addEventListener('input', () => {
      n.text = ta.value; renderNotes(block); // 상자 크기는 그대로 (넘치면 글자가 작아짐)
      saveNotes(block);
    });
    box.append(ta,
      lab('배경'), swatches(n.bg, c => set({ bg: c }), { none: true }),
      lab('글자'), swatches(n.color, c => set({ color: c || '#222222' })),
      lab('테두리'), swatches(n.border, c => set({ border: c }), { none: true }),
      lab('크기'), sel(n.fs || 14, [['10', '10'], ['12', '12'], ['14', '14'], ['18', '18'], ['24', '24'], ['32', '32']], v => set({ fs: Number(v) })));
  }
  if (n.t === 'arrow') box.append(lab('색'), swatches(n.color, c => set({ color: c || n.color })),
    lab('굵기'), sel(n.bw || 3, [['2', '2'], ['3', '3'], ['5', '5'], ['8', '8']], v => set({ bw: Number(v) })));
  if (n.t === 'img') box.append(h('span', { class: 'mut' }, '모서리를 끌면 비율을 유지하며 크기가 바뀌어요.'));
  if (n.t === 'text') box.append(h('span', { class: 'mut nb-tip' }, '네 모서리 점을 끌어 상자 크기를 바꿔요. 글이 넘치면 글자가 자동으로 작아져요.'));
  box.append(h('span', { class: 'nb-sp' }),
    n.t !== 'img' ? h('button', { class: 'btn small ghost', onclick: () => { const c = structuredClone(n); delete c.id; if (c.t === 'arrow') { c.x1 += 20; c.y1 += 20; c.x2 += 20; c.y2 += 20; } else { c.x += 20; c.y += 20; } addNote(block, c); } }, '복제') : null,
    h('button', { class: 'btn small ghost danger', onclick: () => removeNote(block, n.id) }, '삭제'));
}
document.addEventListener('keydown', e => {
  const b = noteSaveBlock; if (!b || !b._sel || !b.isConnected) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeNote(b, b._sel); }
  if (e.key === 'Escape') selectNote(b, null);
});

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
  $('.pf-branch', block).textContent = footStore(pog);
  if (!pendingKey(`${fx.id}|itemZ`)) applyItemZ(block, fx);
  const spBox = block.querySelector('.page .sp-list'), spNow = spRows(fx);
  if (spBox && !spBox.contains(document.activeElement) && !pendingKey(`${fx.id}|sp`) && JSON.stringify(spNow) !== JSON.stringify(block._sp)) {
    block._sp = spNow; renderSp(block);
  }
  const exBox = block.querySelector('.page .ex-list');
  if (exBox && !exBox.contains(document.activeElement) && !pendingKey(`${fx.id}|extras`) && JSON.stringify(fx.extras || []) !== JSON.stringify(block._extras)) {
    block._extras = structuredClone(fx.extras || []); renderExtras(block);
  }
  const typing = !!block._bar && block._bar.querySelector('.nb-text') === document.activeElement;
  if (!block._dragging && !typing && !pendingKey(`${fx.id}|notes`) && JSON.stringify(fx.notes || []) !== JSON.stringify(block._notes)) {
    block._notes = structuredClone(fx.notes || []);
    if (!block._notes.some(n => n.id === block._sel)) block._sel = null;
    renderNotes(block); renderNoteBar(block);
  }
  roFill(block);
}
// 보기 전용 페이지(최종·번역·온라인 POG·PDF): 오른쪽 칸 값을 글자로 바꿔 보여줌. 긴 글은 줄바꿈, 수량 0·빈칸은 비워 둠 (× 도 숨김)
function roFill(block) {
  if (block._editable) return;
  $$('.page .pside .f', block).forEach(el => {
    if (el.tagName === 'TEXTAREA') return;
    const qty = el.type === 'number';
    let v = el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent || el.value || '') : el.value;
    if (qty && (v === '' || Number(v) === 0)) v = '';
    let t = el._ro;
    if (!t) { t = el._ro = h('div', { class: 'ro-v' + (qty ? ' q' : '') }); el.after(t); el.classList.add('ro-hide'); }
    t.textContent = v; t.style.color = el.style.color || '';
    const x = el.previousElementSibling?.classList.contains('x') ? el.previousElementSibling : null;
    if (x) x.style.display = v ? '' : 'none';
  });
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
  state.currentPog = null; state.fixtures = new Map(); state.pageEls = new Map(); state.lockKey = null; state.coverEl = null; state.edActive = null;
  $('#ed-side')?.replaceChildren();
  edThumbs.clear();
  $('#editor-body')?.classList.add('hidden'); $('#editor-empty')?.classList.remove('hidden');
  $('#v-pog-make .split')?.classList.remove('list-off');
}
function openPog(id) {
  closePog();
  $('#editor-empty').classList.add('hidden'); $('#editor-body').classList.remove('hidden');
  $('#v-pog-make .split').classList.add('list-off'); // 페이지를 넓게 보도록 목록은 접어둠
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
  refreshManagerSelect();
  const final = p.status === 'final';
  const editable = !final && canEdit('pog-make'); // POG팀·관리자만 편집, 나머지는 보기
  state.edEditable = editable;
  $('#ed-status').textContent = final ? '최종' : canEdit('pog-make') ? '작성 중' : '작성 중 · 보기 전용';
  $('#ed-status').className = 'badge ' + (final ? 'final' : canEdit('pog-make') ? 'draft' : 'ro');
  $('#ed-final').textContent = final ? '잠금 해제 (다시 수정)' : '최종 POG 내보내기';
  $('#ed-final').classList.toggle('primary', !final);
  $('#ed-manager').disabled = !editable;
  const key = editable ? 'rw' : 'ro';
  if (state.lockKey !== key) {
    state.lockKey = key;
    state.pageEls.forEach(el => el.remove()); state.pageEls = new Map();
    state.coverEl?.remove(); state.coverEl = null;
  }
  renderEditorPages();
}
function renderEditorPages() {
  const pog = state.currentPog;
  if (!pog || pog.status === undefined) return; // 문서 본체가 아직 안 왔으면 대기
  const wrap = $('#ed-pages');
  wrap.querySelector(':scope > .pad')?.remove();
  if (!state.coverEl) state.coverEl = buildCover(pog, { editable: state.edEditable });
  syncCover(state.coverEl, pog);
  if (wrap.firstElementChild !== state.coverEl) wrap.prepend(state.coverEl);
  const order = composeFx([...state.fixtures.values()].sort((a, b) => a.order - b.order));
  const shown = new Set(order.map(f => f.id));
  for (const [id, el] of state.pageEls) if (!shown.has(id)) { el.remove(); state.pageEls.delete(id); }
  state.edComposed = new Map(order.map(f => [f.id, f]));
  order.forEach((fx, i) => {
    let el = state.pageEls.get(fx.id);
    if (el && el._itemSig !== itemSig(fx)) { el.remove(); el = null; }
    if (!el) { el = buildPage(fx, pog, { editable: state.edEditable }); state.pageEls.set(fx.id, el); }
    syncPage(el, fx, pog);
    if (wrap.children[i + 1] !== el) wrap.insertBefore(el, wrap.children[i + 1] || null); // 0번은 표지
  });
  edThumbs.sync(slideEntries(state.coverEl, pog, order, fx => state.pageEls.get(fx.id)));
  renderSidePanel();
}

// 제품 선택 (앞뒤 순서 바꾸기용)
function selectItem(block, id) {
  if ((block._selItem || null) === (id || null)) return;
  block._selItem = id || null;
  block.querySelectorAll('.cv-item.isel').forEach(el => el.classList.remove('isel'));
  if (id) block.querySelector(`.page .cv-item[data-id="${CSS.escape(id)}"]`)?.classList.add('isel');
  renderSidePanel();
}
function moveItemZ(pogId, fx, id, dir) {
  const zs = (fx.items || []).map(it => fx.itemZ?.[it.id] ?? it.z ?? 0);
  const map = { ...(fx.itemZ || {}), [id]: dir > 0 ? Math.max(...zs) + 1 : Math.min(...zs) - 1 };
  fx.itemZ = map; // 바로 보이게
  const block = state.pageEls.get(fx.id); if (block) applyItemZ(block, fx);
  saveFx(pogId, fx.id, 'itemZ', map);
}

/* ---------- 오른쪽 편집 패널: 지금 보고 있는 페이지의 메모 도구·메모·사진·페이지 버튼 ---------- */
function setEdActive(id) {
  if (state.edActive === id) return;
  state.edActive = id;
  edThumbs.setActive(id);
  renderSidePanel();
}
function renderSidePanel() {
  const box = $('#ed-side'), pog = state.currentPog;
  if (!box || !pog?.status) return;
  const a = document.activeElement;
  if (box.contains(a) && /TEXTAREA|INPUT|SELECT/.test(a.tagName)) return; // 입력 중이면 그대로 둠
  const id = state.edActive || '__cover', ed = state.edEditable;
  const sec = (title, ...kids) => h('section', { class: 'se-sec' }, h('h4', {}, title), ...kids);
  const btn = (t, fn, cls = '') => h('button', { class: 'btn small ' + cls, onclick: fn }, t);
  const nodes = [];
  if (id === '__cover') {
    nodes.push(h('div', { class: 'se-head' }, h('b', {}, '표지'), h('span', { class: 'mut' }, '매장명은 표지 가운데에서 바로 고칠 수 있어요')));
    if (ed) nodes.push(sec('페이지', h('div', { class: 'se-btns' }, btn('+ 표지 뒤에 빈 페이지 추가', () => addFreePage(pog.id, (sortedFx()[0]?.order ?? 0) - 1)))));
  } else {
    const fx = state.fixtures.get(id), block = state.pageEls.get(id);
    if (!fx || !block) { box.replaceChildren(); return; }
    const free = fx.kind === 'free', out = (fx.outsideItems || []).length;
    nodes.push(h('div', { class: 'se-head' }, h('b', {}, displayName(fx)),
      h('span', { class: 'mut' }, free ? '추가 페이지' : `POG 원본: ${origName(fx)} · 제품 ${(fx.items || []).length}개`)));
    if (out) nodes.push(h('div', { class: 'se-warn' }, `매대 밖이라 뺀 제품 ${out}개`,
      ed ? btn('되살리기', () => restoreOutside(pog.id, fx), 'ghost') : null));
    const view = state.edComposed?.get(id) || fx; // 붙인 매대까지 합친 것
    const selIt = block._selItem && (view.items || []).find(it => String(it.id) === block._selItem);
    if (ed && selIt) nodes.push(sec('선택한 제품', h('div', { class: 'se-item' }, selIt.img ? h('img', { src: selIt.img, alt: '', referrerpolicy: 'no-referrer' }) : null,
      h('div', {}, h('b', {}, selIt.name), h('div', { class: 'mut' }, selIt.code))),
      h('div', { class: 'se-btns' }, btn('맨 앞으로', () => moveItemZ(pog.id, view, selIt.id, 1)), btn('맨 뒤로', () => moveItemZ(pog.id, view, selIt.id, -1)),
        btn('선택 해제', () => selectItem(block, null), 'ghost')),
      h('p', { class: 'se-help' }, '겹친 제품 중 어느 것이 앞에 보일지만 바꿔요. 위치는 그대로예요.')));
    if (ed && block._bar) nodes.push(sec('메모 넣기', block._bar));
    if (ed && !free) {
      const list = [...state.edComposed.values()], i = list.findIndex(f => f.id === id), next = list.slice(i + 1).find(f => f.kind !== 'free');
      const kids = (fx.merged || []).map(k => state.fixtures.get(k)).filter(Boolean);
      nodes.push(sec('매대 붙이기', h('p', { class: 'se-help' }, '얇은 매대 두 개를 한 페이지에 나란히 넣어요. 붙인 매대 페이지는 따로 안 나와요.'),
        ...kids.map(k => h('div', { class: 'se-kid' }, h('span', {}, '붙인 매대: ', h('b', {}, displayName(k))), btn('떼어내기', () => unmerge(pog.id, fx, k.id), 'ghost'))),
        next ? h('div', { class: 'se-btns' }, btn(`⇣ 다음 매대 '${displayName(next)}' 붙이기`, () => mergeNext(pog.id, fx, state.fixtures.get(next.id)))) : null));
    }
    if (ed) nodes.push(sec('페이지', h('div', { class: 'se-btns' },
      free ? btn('▲ 위로', () => moveFreePage(pog.id, fx.id, -1), 'ghost') : null,
      free ? btn('▼ 아래로', () => moveFreePage(pog.id, fx.id, 1), 'ghost') : null,
      free ? null : btn('↻ 이 매대만 다시 가져오기', () => openRegrab(fx), 'ghost'),
      btn('+ 이 뒤에 빈 페이지 추가', () => addFreePage(pog.id, fx.order), 'ghost'),
      free ? btn('페이지 삭제', () => deleteFreePage(pog.id, fx), 'ghost danger') : null)));
  }
  if (!ed) nodes.push(h('p', { class: 'se-help' }, pog.status === 'final' ? '최종 POG라 잠겨 있어요.' : '보기 전용이에요.'));
  box.replaceChildren(...nodes);
}
// 매대 밖이라 뺀 제품을 이 페이지에 다시 넣기
async function restoreOutside(pogId, fx) {
  const out = fx.outsideItems || [];
  if (!out.length || !confirm(`매대 밖이라 뺀 제품 ${out.length}개를 이 페이지에 되살릴까요?`)) return;
  const items = [...(fx.items || []), ...out];
  await updateDoc(doc(db, 'pogs', pogId, 'fixtures', fx.id), { items, outsideItems: [], itemCount: items.length, updatedAt: serverTimestamp(), updatedBy: me() });
  toast(`${out.length}개를 되살렸어요`);
}

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
  if (!p.manager) miss.push('담당자');
  const noName = [...state.fixtures.values()].filter(f => f.kind !== 'free' && !f.mergedInto && !f.headerName).length;
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
  for (const d of fxs.docs) for (const ph of [...(d.data().photos || []), ...(d.data().notes || []).filter(n => n.path)]) { try { await deleteObject(sRef(st, ph.path)); } catch { } }
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
    ta,
    h('label', { class: 'imp-opt' }, h('input', { type: 'checkbox', id: 'imp-drop', checked: true }),
      ' 매대 밖에 놓인 제품은 빼고 가져오기 ', h('span', { class: 'mut' }, '(매대 옆으로 완전히 벗어난 제품. 뺀 제품은 보관되고 오른쪽 패널에서 되살릴 수 있어요)')),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '가져오는 중…';
    const ok = await doImport(ta.value, { dropOutside: $('#imp-drop').checked });
    if (ok) close(); else { go.disabled = false; go.textContent = '가져오기'; }
  };
}
/* POG 사이트의 매대 한 줄에 칸(매대)이 좌우로 여러 개 있으면 칸마다 나눈다.
   칸 기준: 선반·파이프와 넓은 배경판(panels, 예: 옆의 회색 판). 가로 범위가 **반 이상 겹치는 것끼리** 한 칸.
   맞닿기만 한 것은 다른 칸이다 (예전엔 맞닿아도 합쳐서, 칸 3개가 붙어 있는 매대가 한 페이지로 뭉쳤음).
   여러 칸에 걸친 긴 집기는 칸을 정하는 데 쓰지 않고, 가운데 위치로 한 칸에 넣는다.
   expected = 목록의 '매대수' (집기로 못 나눌 때만 제품 사이 빈 곳으로 나누는 데 씀) */
function clusterX(objs) {
  if (!objs.length) return [];
  const ws = objs.map(o => o.w).sort((a, b) => a - b), med = ws[Math.floor(ws.length / 2)];
  const iv = objs.filter(o => o.w <= med * 1.6).map(o => [o.x, o.x + o.w]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of iv) {
    const last = out[out.length - 1];
    if (last && Math.min(last[1], b) - Math.max(last[0], a) > 0.5 * Math.min(b - a, last[1] - last[0])) { last[1] = Math.max(last[1], b); continue; }
    out.push([a, b]);
  }
  return out;
}
function splitBays(items, props, expected, panels = []) {
  const base = [...props, ...panels.filter(p => p.w >= 40)].filter(o => o.w > 0);
  let bays = clusterX(base);
  // 집기로 못 나누면 제품 위치로 (칸 사이가 40px 이상 비어 있을 때만)
  if (bays.length < 2 && expected > 1 && items.length) {
    const iv = items.filter(o => o.w > 0).map(o => [o.x, o.x + o.w]).sort((a, b) => a[0] - b[0]), merged = [];
    for (const x of iv) { const last = merged[merged.length - 1]; if (last && x[0] - last[1] < 40) last[1] = Math.max(last[1], x[1]); else merged.push([...x]); }
    if (merged.length > 1) bays = merged;
  }
  if (bays.length < 2) return [{ items, props, panels }];
  const at = o => {
    const cx = o.x + (o.w || 0) / 2;
    let best = 0, bd = Infinity;
    bays.forEach(([a, b], i) => { const d = cx < a ? a - cx : cx > b ? cx - b : 0; if (d < bd) { bd = d; best = i; } });
    return best;
  };
  let groups = bays.map(() => ({ items: [], props: [], panels: [] }));
  items.forEach(o => groups[at(o)].items.push(o));
  props.forEach(o => groups[at(o)].props.push(o));
  panels.forEach(o => groups[at(o)].panels.push(o));
  // 제품이 하나도 없는 좁은 조각(옆에 붙은 작은 집기 등)은 옆 칸에 합침
  const maxW = Math.max(...bays.map(([a, b]) => b - a));
  for (let i = groups.length - 1; i >= 0 && groups.length > 1; i--) {
    if (groups[i].items.length || bays[i][1] - bays[i][0] >= maxW * 0.4) continue;
    const j = i > 0 ? i - 1 : 1;
    groups[j].props.push(...groups[i].props); groups[j].panels.push(...groups[i].panels);
    groups.splice(i, 1); bays.splice(i, 1);
  }
  return groups;
}

/* 매대 밖에 놓인 제품 골라내기 (POG 사이트에서 매대 옆에 빼둔 제품 등)
   매대 전체(모든 선반·파이프)의 가로 범위에서 **완전히 벗어난** 제품만 밖으로 본다.
   위아래는 보지 않는다: 파이프에 거는 제품은 집기보다 한참 아래로 내려오고, 쌓아 진열하면 위로 올라감.
   (처음엔 아래쪽도 봤는데, 실제 거는화일 매대에서 24개 중 14개를 잘못 뺐음)
   배경판(panels, 예: 옆의 회색 판)도 매대로 본다. 집기가 없거나 전부 밖으로 판정되면 그대로 둔다. */
function splitOutside(items, props, panels = []) {
  const ps = [...props, ...panels.filter(p => p.w >= 40)].filter(p => p.w > 0); // 회색 배경판 위 제품은 매대 안
  if (!ps.length || !items.length) return { inside: items, outside: [] };
  const left = Math.min(...ps.map(p => p.x)) - 10, right = Math.max(...ps.map(p => p.x + p.w)) + 10;
  const out = o => o.x + (o.w || 0) < left || o.x > right;
  const outside = items.filter(out);
  if (outside.length === items.length) return { inside: items, outside: [] };
  return { inside: items.filter(o => !out(o)), outside };
}

// 북마클릿이 읽은 매대 한 줄 → POG 페이지 목록 (칸 나누기·매대 밖 제품 빼기). 처음 가져오기·다시 가져오기에서 같이 씀
const autoShelfPipe = (sh, pi) => [sh ? `선반 ${sh}` : '', pi ? `파이프 ${pi}` : ''].filter(Boolean).join(' / ');
function pagesFromGrab(f, i, dropOutside) {
  const panels = f.panels || [];
  const { inside, outside } = dropOutside ? splitOutside(f.items || [], f.props || [], panels) : { inside: f.items || [], outside: [] };
  const bays = splitBays(inside, f.props || [], f.bayCount ?? null, panels);
  const shelf = f.shelfCount ?? 0, pipe = f.pipeCount ?? 0;
  const kinds = (f.props || []).some(p => /선반|파이프/.test(p.kind || ''));
  const base = String(f.mdidx || 'fx' + i);
  const pages = bays.map((bay, k) => {
    const count = (re, total) => bays.length === 1 ? total
      : kinds ? bay.props.filter(p => re.test(p.kind || '')).length : Math.round(total / bays.length);
    const sh = count(/선반/, shelf), pi = count(/파이프/, pipe);
    return {
      id: bays.length > 1 ? `${base}-${k + 1}` : base,
      mdidx: String(f.mdidx || ''), bayNo: k + 1, bayCount: bays.length,
      teamName: f.teamName || '', mdName: f.mdName || '',
      shelfCount: sh, pipeCount: pi,
      itemCount: bays.length > 1 ? bay.items.length : (f.itemCount ?? bay.items.length),
      items: bay.items, props: bay.props, panels: bay.panels || [],
      outsideItems: k === 0 ? outside : [], // 뺀 제품은 첫 칸에 보관 (화면엔 안 그림)
      shelfPipe: autoShelfPipe(sh, pi), sp: autoSp(sh, pi),
    };
  });
  return { pages, outN: outside.length };
}

async function doImport(text, { dropOutside = true } = {}) {
  let data;
  try { data = JSON.parse(text.trim()); } catch { toast('붙여넣은 내용이 올바르지 않아요'); return false; }
  if (!data || data.source !== 'pog.artbox.kr' || !Array.isArray(data.fixtures) || !data.fixtures.length) {
    toast('POG 데이터가 아니에요'); return false;
  }
  let ref = null;
  try {
    // 매대 줄마다 칸을 나눠서 페이지 목록 만들기
    const pages = [];
    let splitN = 0, outN = 0;
    const empty = f => !(f.items || []).length && !(f.props || []).length && !(f.panels || []).length;
    const skipped = data.fixtures.filter(empty);
    for (const [i, f] of data.fixtures.entries()) {
      if (empty(f)) continue; // 제품·집기가 하나도 없는 줄 (목록의 '★1차POG/리스트 전달완료★' 같은 표시 줄)
      const r = pagesFromGrab(f, i, dropOutside);
      pages.push(...r.pages); outN += r.outN; if (r.pages.length > 1) splitN++;
    }
    ref = await addDoc(collection(db, 'pogs'), {
      storeCode: data.storeCode || '', storeName: data.storeName || '',
      branchName: '', manager: '', status: 'draft', fixtureCount: pages.length,
      teams: [...new Set(pages.map(pg => catName(pg.teamName)).filter(Boolean))], // 사전 '팀명' 자동 추가용
      grabbedAt: data.grabbedAt || '', createdAt: serverTimestamp(), createdBy: state.user.email, updatedAt: serverTimestamp(),
    });
    let b = writeBatch(db), n = 0;
    for (const [i, { id, ...pg }] of pages.entries()) {
      b.set(doc(db, 'pogs', ref.id, 'fixtures', id), {
        order: i, ...pg,
        headerName: '', fixtureType: '', hookType: '', hookCount: '',
        otherFixtures: '', memo: '', photos: [],
      });
      if (++n >= 400) { await b.commit(); b = writeBatch(db); n = 0; }
    }
    await b.commit();
    toast(`매대 ${pages.length}개를 가져왔어요` + (splitN ? ` · 칸이 여러 개인 매대 ${splitN}개는 칸마다 나눴어요` : '') + (outN ? ` · 매대 밖 제품 ${outN}개는 뺐어요` : '')
      + (skipped.length ? ` · 빈 줄 ${skipped.length}개(${skipped.map(f => f.mdName).join(', ').slice(0, 40)})는 건너뛰었어요` : ''));
    openPog(ref.id);
    return true;
  } catch (e) {
    if (ref) { try { await deleteDoc(ref); } catch { } } // 반쯤 만들어진 POG는 지움
    if (e.code === 'permission-denied') {
      alert('저장 권한이 없어요 (Missing or insufficient permissions).\n\n' +
        'Firebase 콘솔 → Firestore Database → 규칙 탭에서 firestore.rules 내용이 게시돼 있는지 확인해주세요.\n' +
        '(처음 만들 때 고른 기본 규칙이 남아 있거나, 테스트 모드 기간이 끝나면 이 오류가 나요.)');
    } else toast('가져오기 실패: ' + e.message);
    return false;
  }
}

/* ---------- 고리·집기 수량 엑셀: 페이지마다 넣은 고리타입×갯수, 이외집기×수량을 제품코드와 함께 합계 ---------- */
async function exportCounts(pog, fixtures) {
  if (!pog) return;
  try {
    const X = await loadXLSX();
    const pages = composeFx([...fixtures].sort((a, b) => a.order - b.order));
    const codeOf = (cat, name) => state.glossary.find(g => g.cat === cat && norm(g.ko) === norm(name))?.code || '';
    const detail = [], sum = new Map();
    pages.forEach((f, i) => {
      if (f.kind === 'free') return;
      const no = i + 2; // 1번은 표지
      const add = (kind, cat, name, qty) => {
        name = (name || '').trim(); if (!name) return;
        const q = Number(qty) || 0, code = codeOf(cat, name);
        detail.push([no, displayName(f), kind, code, name, q]);
        const k = kind + '|' + norm(name), r = sum.get(k) || { kind, code, name, qty: 0, pages: [] };
        r.qty += q; if (!r.pages.includes(no)) r.pages.push(no); sum.set(k, r);
      };
      add('고리', '고리타입', f.hookType, f.hookCount);
      (f.extras || []).forEach(x => add('집기', '집기', x.name, x.qty));
    });
    if (!detail.length) { toast('입력된 고리·집기가 없어요'); return; }
    const total = [...sum.values()].sort((a, b) => a.kind.localeCompare(b.kind, 'ko') || a.name.localeCompare(b.name, 'ko'));
    const ws1 = X.utils.aoa_to_sheet([['구분', '제품코드', '이름', '합계 수량', '들어간 페이지'],
      ...total.map(r => [r.kind, r.code || '(사전에 코드 없음)', r.name, r.qty, r.pages.join(', ')])]);
    ws1['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 28 }, { wch: 10 }, { wch: 30 }];
    const ws2 = X.utils.aoa_to_sheet([['페이지', '매대명', '구분', '제품코드', '이름', '수량'], ...detail]);
    ws2['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 6 }, { wch: 14 }, { wch: 28 }, { wch: 8 }];
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, ws1, '합계'); X.utils.book_append_sheet(wb, ws2, '페이지별');
    X.writeFile(wb, `고리집기수량_${footStore(pog)}_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`.replace(/[\\/:*?"<>|]/g, ''));
    const noCode = total.filter(r => !r.code).length;
    toast('엑셀을 저장했어요' + (noCode ? ` · 사전에 제품코드가 없는 것 ${noCode}개` : ''));
  } catch (e) { toast(e.message); }
}
$('#ed-counts').onclick = () => exportCounts(state.currentPog, [...state.fixtures.values()]);
$('#vw-counts').onclick = () => exportCounts(state.viewer.pog, state.viewer.fixtures);

/* ---------- POG 사이트에서 다시 가져오기 (POG팀이 일부 매대만 고쳤을 때) ----------
   고유번호(mdidx)로 이 POG의 페이지를 찾아 제품·집기 모양만 최신으로 바꾼다.
   매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로. 선반/파이프 칸은 손대지 않았을 때만 새 값으로.
   칸 수가 늘면 페이지를 그 뒤에 추가, 줄면 남는 페이지를 지움(미리보기에서 알려줌). 처음 보는 매대는 맨 뒤에 추가. */
function openRegrab(hintFx) {
  const pog = state.currentPog; if (!pog) return;
  if (!state.edEditable) { toast(pog.status === 'final' ? '최종 POG예요. 잠금 해제한 뒤 다시 가져올 수 있어요' : '편집 권한이 없어요'); return; }
  const ta = h('textarea', { class: 'import-ta', placeholder: '여기에 붙여넣기 (Ctrl+V)' });
  const drop = h('input', { type: 'checkbox', checked: true });
  const go = h('button', { class: 'btn primary' }, '미리보기');
  const close = modal(h('div', {},
    h('h3', {}, 'POG 사이트에서 다시 가져오기'),
    h('p', { class: 'mut' }, '이미 입력한 매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로 두고, 제품과 집기만 최신으로 바꿔요.'),
    h('ol', { class: 'steps' },
      h('li', {}, hintFx ? `POG 사이트에서 '${hintFx.mdName}' 매대 보기 화면을 열고 북마크(📥 POG 가져오기)를 누르세요.`
        : 'POG 사이트에서 고친 매대의 보기 화면을 열고 북마크(📥 POG 가져오기)를 누르세요. 여러 개면 매대 목록에서 체크하고 누르세요.'),
      h('li', {}, "'복사하기'를 누르고 아래 칸에 붙여넣으세요.")),
    ta, h('label', { class: 'imp-opt' }, drop, ' 매대 밖에 놓인 제품은 빼기'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = () => {
    let data;
    try { data = JSON.parse(ta.value.trim()); } catch { toast('붙여넣은 내용이 올바르지 않아요'); return; }
    if (!data || data.source !== 'pog.artbox.kr' || !Array.isArray(data.fixtures) || !data.fixtures.length) { toast('POG 데이터가 아니에요'); return; }
    close(); showRegrabPreview(pog, planRegrab(pog, data, drop.checked));
  };
}
const countDiff = (a, b) => { const m = new Map(); b.forEach(x => m.set(x, (m.get(x) || 0) + 1)); let n = 0; a.forEach(x => { const c = m.get(x) || 0; if (c) m.set(x, c - 1); else n++; }); return n; };
function planRegrab(pog, data, dropOutside) {
  const all = sortedFx();
  const plan = { rows: [], updates: [], creates: [], deletes: [], adds: [], warn: '' };
  if (data.storeCode && pog.storeCode && String(data.storeCode) !== String(pog.storeCode))
    plan.warn = `매장이 달라요. 붙여넣은 데이터: ${data.storeName} (${data.storeCode}) / 이 POG: ${pog.storeName} (${pog.storeCode})`;
  data.fixtures.forEach((f, i) => {
    if (!(f.items || []).length && !(f.props || []).length && !(f.panels || []).length) return; // 빈 줄
    const { pages } = pagesFromGrab(f, i, dropOutside);
    const old = all.filter(x => x.kind !== 'free' && x.mdidx === String(f.mdidx)).sort((a, b) => (a.bayNo || 1) - (b.bayNo || 1));
    if (!old.length) { plan.adds.push(...pages); plan.rows.push({ name: f.mdName, text: `새 매대 · 페이지 ${pages.length}장을 맨 뒤에 추가` }); return; }
    const oc = old.flatMap(x => (x.items || []).map(it => it.code)), nc = pages.flatMap(p => p.items.map(it => it.code));
    const add = countDiff(nc, oc), del = countDiff(oc, nc);
    let text = `제품 ${oc.length} → ${nc.length}` + (add || del ? ` (추가 ${add} · 빠짐 ${del})` : ' (같은 제품, 위치만 새로)');
    if (old.length !== pages.length) text += ` · 칸 ${old.length} → ${pages.length}`;
    plan.rows.push({ name: f.mdName, text });
    pages.forEach((pg, k) => old[k] ? plan.updates.push({ o: old[k], pg }) : plan.creates.push({ after: old[old.length - 1], pg }));
    old.slice(pages.length).forEach(o => plan.deletes.push(o));
  });
  return plan;
}
function showRegrabPreview(pog, plan) {
  const nothing = !plan.updates.length && !plan.creates.length && !plan.adds.length && !plan.deletes.length;
  const go = h('button', { class: 'btn primary', disabled: nothing }, '적용하기');
  const close = modal(h('div', {},
    h('h3', {}, '다시 가져오기 미리보기'),
    plan.warn ? h('p', { class: 'err' }, plan.warn) : null,
    h('ul', { class: 'imp-sum' }, ...plan.rows.map(r => h('li', {}, h('b', {}, r.name), ` · ${r.text}`))),
    plan.deletes.length ? h('p', { class: 'err' }, `칸이 줄어서 페이지 ${plan.deletes.length}장(${plan.deletes.map(displayName).join(', ')})을 지워요. 그 페이지의 입력 내용·메모도 함께 지워져요.`) : null,
    h('p', { class: 'mut' }, '매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로예요. 메모 상자 위치가 새 제품과 안 맞으면 옮겨주세요.'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '적용 중…';
    try { await applyRegrab(pog, plan); close(); }
    catch (e) { toast('다시 가져오기 실패: ' + e.message); go.disabled = false; go.textContent = '적용하기'; }
  };
}
async function applyRegrab(pog, plan) {
  const all = sortedFx(), ids = new Set(all.map(x => x.id));
  const freeId = id => { let v = id; while (ids.has(v)) v = `${id}_${Date.now().toString(36)}`; ids.add(v); return v; };
  const blank = { headerName: '', fixtureType: '', hookType: '', hookCount: '', otherFixtures: '', memo: '', photos: [], notes: [] };
  let b = writeBatch(db), n = 0;
  const flush = async () => { if (n) { await b.commit(); b = writeBatch(db); n = 0; } };
  const put = async (fn) => { fn(); if (++n >= 400) await flush(); };
  for (const { o, pg } of plan.updates) {
    const keep = new Set(pg.items.map(it => String(it.id)));
    const patch = {
      items: pg.items, props: pg.props, panels: pg.panels, outsideItems: pg.outsideItems,
      mdName: pg.mdName, teamName: pg.teamName, bayNo: pg.bayNo, bayCount: pg.bayCount,
      itemCount: pg.itemCount, shelfCount: pg.shelfCount, pipeCount: pg.pipeCount,
      itemZ: Object.fromEntries(Object.entries(o.itemZ || {}).filter(([k]) => keep.has(k))),
      regrabbedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: me(),
    };
    // 선반/파이프: 손대지 않았을 때만 새 수로
    if (JSON.stringify(spRows(o)) === JSON.stringify(autoSp(o.shelfCount, o.pipeCount)) || !spRows(o).length) { patch.shelfPipe = pg.shelfPipe; patch.sp = pg.sp; }
    await put(() => b.update(doc(db, 'pogs', pog.id, 'fixtures', o.id), patch));
  }
  // 칸이 늘어난 매대: 그 매대 마지막 페이지 바로 뒤에 끼워 넣기
  const lastOrder = new Map();
  for (const { after, pg } of plan.creates) {
    const prev = lastOrder.get(after.id) ?? after.order;
    const next = all.find(x => x.order > prev && x.id !== after.id);
    const order = next ? (prev + next.order) / 2 : prev + 1;
    lastOrder.set(after.id, order);
    const { id, ...rest } = pg;
    await put(() => b.set(doc(db, 'pogs', pog.id, 'fixtures', freeId(id)), { order, ...rest, ...blank }));
  }
  let end = Math.max(0, ...all.map(x => x.order));
  for (const pg of plan.adds) {
    const { id, ...rest } = pg;
    await put(() => b.set(doc(db, 'pogs', pog.id, 'fixtures', freeId(id)), { order: ++end, ...rest, ...blank }));
  }
  for (const o of plan.deletes) {
    for (const ph of [...(o.photos || []), ...(o.notes || []).filter(x => x.path)]) { try { await deleteObject(sRef(st, ph.path)); } catch { } }
    await put(() => b.delete(doc(db, 'pogs', pog.id, 'fixtures', o.id)));
  }
  await flush();
  const total = plan.updates.length + plan.creates.length + plan.adds.length;
  await updateDoc(doc(db, 'pogs', pog.id), { fixtureCount: all.length + plan.creates.length + plan.adds.length - plan.deletes.length, updatedAt: serverTimestamp() });
  toast(`페이지 ${total}장을 최신으로 바꿨어요` + (plan.deletes.length ? ` · ${plan.deletes.length}장 삭제` : ''));
}
$('#ed-regrab').onclick = () => openRegrab(null);

/* ---------- 2.2 POG 번역 ----------
   AI 번역 없음: 용어 사전에서 찾아 자동으로 채우고(통째 → 낱말 단위), 못 찾은 것만 사람이 입력.
   저장: pogs/{id}/translations/{언어}
     fx:  { fxId: { 항목: 사람이 고친 번역 } }   (__labels = 페이지 고정 문구, __pog = 표지·매장명)
     out: '온라인 POG에 반영'을 누른 순간의 최종 번역 (사전 자동 + 사람이 고친 것). 바이어는 사전을 못 읽으므로 이걸로 보여줌 */
const LABELS_KO = { type: '매대 타입', hook: '고리타입/갯수', sp: '선반/파이프여부', other: '이외집기(8코드포함)', mgr: 'POG 담당자' };
const LABELS_EN = { type: 'Fixture Type', hook: 'Hook Type / Qty', sp: 'Shelf / Pipe', other: 'Other Fixtures (incl. 8-code)', mgr: 'POG Manager' };
const trOf = (g, lang) => lang === 'English' ? (g.en || '') : (g.tr?.[lang] || '');
const hasKo = t => /[가-힣]/.test(t || '');
function findWord(ko, lang, cats) {
  const n = norm(ko); if (!n) return '';
  const pool = state.glossary.filter(g => norm(g.ko) === n && trOf(g, lang));
  if (!pool.length) return '';
  const rank = g => { const i = (cats || []).indexOf(g.cat); return i < 0 ? 99 : i; };
  pool.sort((a, b) => rank(a) - rank(b));
  return trOf(pool[0], lang);
}
// 사전으로 번역: 통째로 있으면 그것, 없으면 '/'·','·줄바꿈 등으로 나눠 낱말마다 (띄어쓰기는 긴 것부터 맞춰봄)
function autoTranslate(text, lang, cats) {
  const t = (text || '').trim();
  if (!t || !hasKo(t)) return { text: t, missing: [] };
  const whole = findWord(t, lang, cats); if (whole) return { text: whole, missing: [] };
  const missing = [];
  const word = w => {
    if (!hasKo(w)) return w;
    const f = findWord(w, lang, cats); if (f) return f;
    const m = w.match(/^(.*[가-힣])(\d+\S*)$/); // '선반3' → '선반' + '3'
    if (m) { const f2 = findWord(m[1], lang, cats); if (f2) return `${f2} ${m[2]}`; }
    missing.push(w); return w;
  };
  const out = t.split(/(\s*[\/,·+&()\[\]×xX\n]\s*)/).map((seg, i) => {
    if (i % 2 || !hasKo(seg)) return seg;
    const s2 = seg.trim(), hit = findWord(s2, lang, cats);
    if (hit) return seg.replace(s2, hit);
    const ws = s2.split(/\s+/), res = [];
    for (let a = 0; a < ws.length;) {
      let b = ws.length, got = '';
      for (; b > a + 1; b--) { got = findWord(ws.slice(a, b).join(' '), lang, cats); if (got) break; }
      if (!got) { b = a + 1; got = word(ws[a]); }
      res.push(got); a = b;
    }
    return seg.replace(s2, res.join(' '));
  }).join('');
  return { text: out, missing: [...new Set(missing)] };
}
// 비슷한 단어 (사전에 넣기 전에 확인용): 같음 / 포함 / 두 글자씩 겹치는 정도
function similarWords(ko) {
  const n = norm(ko), bi = x => { const a = []; for (let i = 0; i < x.length - 1; i++) a.push(x.slice(i, i + 2)); return a; }, A = bi(n);
  return state.glossary.map(g => {
    const m = norm(g.ko); let sc = 0;
    if (!m) return { g, sc };
    if (m === n) sc = 1;
    else if (m.length >= 2 && n.length >= 2 && (m.includes(n) || n.includes(m))) sc = 0.8;
    else { const B = bi(m), inter = A.filter(x => B.includes(x)).length; sc = A.length + B.length ? 2 * inter / (A.length + B.length) : 0; }
    return { g, sc };
  }).filter(x => x.sc >= 0.4).sort((a, b) => b.sc - a.sc).slice(0, 6);
}
// 페이지 하나에서 번역할 항목들. dict = 사전 분류에서 고르는 칸(그 분류에 없는 값이면 '직접 입력'), addCat = 사전에 넣을 때 기본 분류
function trFields(fx) {
  const notes = (fx.notes || []).filter(n => n.t === 'text' && (n.text || '').trim())
    .map((n, i) => ({ key: 'n_' + n.id, label: `글상자 ${i + 1}`, ko: n.text, addCat: '카테고리' }));
  if (fx.kind === 'free') return [{ key: 'headerName', label: '제목', ko: fx.headerName, addCat: '카테고리' }, ...notes].filter(r => (r.ko || '').trim());
  return [
    { key: 'cat', label: '카테고리(팀명)', ko: catName(fx.teamName), cats: ['팀명'], dict: '팀명' },
    { key: 'headerName', label: '매대명', ko: fx.headerName || origName(fx), cats: ['카테고리'], addCat: '카테고리',
      dw: fx.headerName && fx.drawingRef?.ko ? fx.drawingRef : null,
      hint: !fx.headerName ? 'POG 원본 이름이에요 (매대명을 아직 안 넣음)' : fx.drawingRef ? '도면 매대와 연결됨 · 영문은 도면 번역에서 가져와요' : '' },
    { key: 'fixtureType', label: LABELS_KO.type, ko: fx.fixtureType, cats: ['매대타입'], dict: '매대타입' },
    { key: 'hookType', label: '고리타입', ko: fx.hookType, cats: ['고리타입'], dict: '고리타입' },
    ...spRows(fx).filter(x => (x.name || '').trim()).map((x, i) => ({ key: 's_' + x.id, label: `선반/파이프 ${i + 1}`, ko: x.name, cats: ['선반/파이프', '집기'], dict: '선반/파이프', qty: x.qty })),
    ...(fx.extras || []).filter(x => (x.name || '').trim()).map((x, i) => ({ key: 'x_' + x.id, label: `이외집기 ${i + 1}`, ko: x.name, cats: ['집기'], dict: '집기', qty: x.qty })),
    { key: 'otherFixtures', label: LABELS_KO.other + ' (메모)', ko: fx.otherFixtures, cats: ['집기'], addCat: '집기' },
    ...notes,
  ].filter(r => (r.ko || '').trim());
}
function trState(r, saved, lang) {
  let a = autoTranslate(r.ko, lang, r.cats);
  if (r.dw) { // 도면에서 고른 매대명: 도면 번역 + 그 뒤에 POG팀이 붙인 글자(예: ' 1')
    const en = dwEnglish(r.dw, lang), suffix = (r.ko || '').startsWith(r.dw.ko) ? r.ko.slice(r.dw.ko.length) : null;
    if (en && suffix !== null) a = { text: en + suffix, missing: [] };
    else if (!en) a = { ...a, missing: a.missing.length ? a.missing : [], dwMissing: true };
  }
  const custom = r.dict ? !state.glossary.some(g => g.cat === r.dict && norm(g.ko) === norm(r.ko)) : !!r.custom;
  const need = !saved && (a.missing.length > 0 || custom); // 빨간 ! : 사전에 없는 말이 있거나 직접 입력한 값인데, 아직 번역을 안 넣음
  if (a.dwMissing && !saved) return { a, custom: false, need: true, value: a.missing.length ? '' : a.text, status: 'missing', dwMissing: true };
  return { a, custom, need, value: saved || (a.missing.length ? '' : a.text), status: saved ? 'saved' : a.missing.length ? 'missing' : 'auto' };
}

// 번역 값(o: { key: 글 })으로 매대 글자를 바꾼 사본
function applyTr(fx, o) {
  if (!o) return fx;
  return { ...fx, ...Object.fromEntries(['headerName', 'fixtureType', 'hookType', 'shelfPipe', 'otherFixtures'].filter(k => o[k]).map(k => [k, o[k]])),
    _cat: o.cat || undefined, notes: (fx.notes || []).map(n => o['n_' + n.id] ? { ...n, text: o['n_' + n.id] } : n),
    extras: (fx.extras || []).map(x => o['x_' + x.id] ? { ...x, name: o['x_' + x.id] } : x),
    sp: spRows(fx).map(x => o['s_' + x.id] ? { ...x, name: o['s_' + x.id] } : x) };
}
const tr = { pog: null, fixtures: [], lang: 'English', doc: {}, unsubs: [], dirty: false, active: '__cover', blocks: new Map() };
$('#tr-search').addEventListener('input', renderTrList);
function renderTrList() {
  const list = $('#tr-list'); if (!list) return;
  const q = $('#tr-search').value.trim().toLowerCase();
  list.innerHTML = '';
  const rows = state.pogs.filter(p => p.status === 'final' && (!q || [p.storeName, p.branchName, p.storeCode, p.manager].join(' ').toLowerCase().includes(q)));
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, '최종 POG가 없어요.'));
  rows.forEach(p => list.append(pogListItem(p, tr.pog?.id === p.id, () => openTr(p.id))));
}
function closeTr() {
  tr.unsubs.forEach(u => u()); tr.unsubs = []; tr.unsubDoc?.(); tr.unsubDw?.(); tr.unsubDoc = tr.unsubDw = null; tr.dwKey = null; tr.pog = null; tr.fixtures = []; tr.doc = {}; tr.active = '__cover'; tr.blocks = new Map();
  trThumbs?.clear(); $('#tr-pages')?.replaceChildren(); $('#tr-side')?.replaceChildren();
  $('#tr-body')?.classList.add('hidden'); $('#tr-empty')?.classList.remove('hidden');
  $('#v-pog-trans .split')?.classList.remove('list-off');
}
function trLangs() { return ['English', ...glLangs()]; }
function openTr(id) {
  closeTr();
  tr.pog = { id };
  $('#tr-empty').classList.add('hidden'); $('#tr-body').classList.remove('hidden');
  $('#v-pog-trans .split').classList.add('list-off');
  $('#tr-pages').replaceChildren(h('div', { class: 'mut pad' }, '불러오는 중…'));
  renderTrList();
  tr.unsubs.push(onSnapshot(doc(db, 'pogs', id), d => { if (!d.exists()) { closeTr(); return; } tr.pog = { id: d.id, ...d.data() }; subTrDw(); renderTr(); }));
  tr.unsubs.push(onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => { tr.fixtures = s.docs.map(d => ({ id: d.id, ...d.data() })); renderTr(); }));
  subTrDoc();
}
// 이 POG 매장의 도면 번역 (POG 문서가 늦게 오거나 매장이 바뀌면 다시 구독)
function subTrDw(force) {
  const st = storeForPog(tr.pog), key = st ? st.id + '|' + tr.lang : '';
  if (!force && key === tr.dwKey) return;
  tr.unsubDw?.(); tr.unsubDw = null; tr.dwKey = key; tr.dwTr = {};
  if (st) tr.unsubDw = onSnapshot(doc(db, 'drawings', st.id, 'translations', tr.lang), d => { tr.dwTr = d.exists() ? d.data() : {}; renderTr(); }, () => { });
}
function subTrDoc() {
  tr.unsubDoc?.();
  subTrDw(true);
  const id = tr.pog.id, lang = tr.lang;
  tr.unsubDoc = onSnapshot(doc(db, 'pogs', id, 'translations', lang), d => {
    if (tr.lang !== lang) return;
    const data = d.exists() ? d.data() : {};
    // 저장 대기 중인 내 입력은 지키기
    tr.doc = { ...data, fx: { ...(data.fx || {}) } };
    for (const [k, v] of Object.entries(tr.local || {})) if (pendingKey(k)) { const [, , , f, key] = k.split('|'); (tr.doc.fx[f] ||= {})[key] = v; }
    renderTr();
  });
}
$('#tr-lang').addEventListener('change', e => { tr.lang = e.target.value; tr.doc = {}; subTrDoc(); renderTr(); });
$('#tr-only').addEventListener('change', () => renderTrSide(true));
$('#tr-view').onclick = () => { const id = tr.pog?.id; if (!id) return; state.viewer.wantLang = tr.lang; go('pog-online'); openViewer(id); };
function saveTr(fxId, key, v) {
  const pogId = tr.pog.id, lang = tr.lang, k = `tr|${pogId}|${lang}|${fxId}|${key}`;
  ((tr.doc.fx ||= {})[fxId] ||= {})[key] = v;
  (tr.local ||= {})[k] = v;
  queueWrite(k, () => setDoc(doc(db, 'pogs', pogId, 'translations', lang), { lang, fx: { [fxId]: { [key]: v } }, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true }));
}
// 한 POG의 번역 줄 전체 (고정 문구 → 표지 → 페이지들)
function trSections() {
  const pog = tr.pog, lang = tr.lang, fxs = composeFx(tr.fixtures);
  const sections = [];
  const labelDefault = k => lang === 'English' ? LABELS_EN[k] : '';
  sections.push({ id: '__labels', title: '페이지 고정 문구', sub: '모든 페이지에 똑같이 들어가는 글자',
    rows: Object.keys(LABELS_KO).map(k => ({ key: k, label: LABELS_KO[k], ko: LABELS_KO[k], fixed: labelDefault(k) })) });
  const pr = [];
  if (hasKo(coverTitle(pog))) pr.push({ key: 'cover', label: '표지 매장명', ko: coverTitle(pog), addCat: '카테고리' });
  if (hasKo(footStore(pog))) pr.push({ key: 'store', label: '페이지 아래 매장명', ko: footStore(pog), addCat: '카테고리' });
  if (pr.length) sections.push({ id: '__pog', title: '표지·매장명', rows: pr });
  fxs.forEach((fx, i) => sections.push({ id: fx.id, no: i + 2, title: displayName(fx), sub: fx.kind === 'free' ? '추가 페이지' : catName(fx.teamName), rows: trFields(fx), fx }));
  return sections;
}
function rowState(sec, r) {
  const saved = tr.doc.fx?.[sec.id]?.[r.key] || '';
  if (r.fixed !== undefined) { // 고정 문구: 영어는 기본값이 있음
    return { a: { text: r.fixed, missing: r.fixed ? [] : [r.ko] }, custom: false, need: !saved && !r.fixed, value: saved || r.fixed, status: saved ? 'saved' : r.fixed ? 'auto' : 'missing' };
  }
  return trState(r, saved, tr.lang);
}
// 화면: 왼쪽 썸네일 · 가운데 번역된 페이지 그림(보기 전용) · 오른쪽 지금 페이지의 번역 칸
function renderTr(force) {
  const pog = tr.pog, wrap = $('#tr-pages');
  if (!wrap || !pog?.status) return;
  const langs = trLangs(), lsel = $('#tr-lang');
  if (!langs.includes(tr.lang)) tr.lang = 'English';
  lsel.replaceChildren(...langs.map(l => h('option', { value: l }, l))); lsel.value = tr.lang;
  $('#tr-title').textContent = `${footStore(pog)} · 최종 ${fmtDate(pog.finalizedAt)}`;
  $('#tr-pub').textContent = tr.doc.publishedAt ? `반영: ${fmtTime(tr.doc.publishedAt)}` : '아직 반영 안 함';
  // 항목마다 지금 번역(직접 입력 > 사전 자동)과 ! 개수
  const secs = trSections(), vals = new Map(), needBy = new Map();
  let needN = 0;
  for (const sec of secs) {
    const o = {}; let n = 0;
    for (const r of sec.rows) { const st = rowState(sec, r); if (st.need) n++; const v = st.value || st.a.text; if (v) o[r.key] = v; }
    vals.set(sec.id, o); needBy.set(sec.id, n); needN += n;
  }
  tr.secs = secs; tr.needBy = needBy;
  const nb = $('#tr-need'); nb.textContent = needN ? `확인 필요 ${needN}` : '모두 번역됨'; nb.className = 'badge tr-need ' + (needN ? 'warn' : 'final');
  // 페이지 그림: 바뀐 페이지만 다시 그림
  const L = { ...LABELS_KO, ...(vals.get('__labels') || {}) };
  const pogV = { ...pog, coverTitle: vals.get('__pog')?.cover || coverTitle(pog), branchName: vals.get('__pog')?.store || footStore(pog) };
  wrap.querySelector(':scope > .pad')?.remove();
  const want = [], keep = new Map();
  const put = (id, sig, make) => {
    let c = tr.blocks.get(id);
    if (!c || c.sig !== sig) { c = { sig, el: make() }; c.el.addEventListener('pointerdown', () => setTrActive(id)); }
    keep.set(id, c); want.push(c.el);
  };
  put('__cover', JSON.stringify([L, pogV.coverTitle, pogV.branchName, pog.manager]), () => { const el = buildCover(pogV, { editable: false, L }); syncCover(el, pogV); return el; });
  const fxSecs = secs.filter(x => x.fx);
  for (const sec of fxSecs) {
    const fxT = applyTr(sec.fx, vals.get(sec.id));
    put(sec.id, JSON.stringify([itemSig(sec.fx), vals.get(sec.id), L, pogV.branchName, pog.manager, sec.fx.notes, sec.fx.extras, sec.fx.itemZ]),
      () => { const el = buildPage(fxT, pogV, { editable: false, L }); syncPage(el, fxT, pogV); return el; });
  }
  tr.blocks.forEach((c, id) => { if (!keep.has(id)) c.el.remove(); });
  tr.blocks = keep;
  want.forEach((el, i) => { if (wrap.children[i] !== el) wrap.insertBefore(el, wrap.children[i] || null); });
  const entries = slideEntries(keep.get('__cover').el, pogV, fxSecs.map(x => applyTr(x.fx, vals.get(x.id))), fx => keep.get(fx.id)?.el)
    .map(e => ({ ...e, need: e.id === '__cover' ? (needBy.get('__labels') || 0) + (needBy.get('__pog') || 0) : needBy.get(e.id) }));
  trThumbs.sync(entries);
  renderTrSide(force);
}
function setTrActive(id) {
  if (tr.active === id) return;
  tr.active = id; trThumbs.setActive(id); renderTrSide(true);
}
// 오른쪽 패널: 지금 페이지의 번역 칸 (표지면 페이지 고정 문구·표지·매장명)
function renderTrSide(force) {
  const box = $('#tr-side'); if (!box || !tr.secs) return;
  const a = document.activeElement;
  if (!force && box.contains(a) && a.tagName === 'INPUT') { tr.dirty = true; return; } // 입력 중이면 그대로
  tr.dirty = false;
  const id = tr.active || '__cover';
  const secs = id === '__cover' ? tr.secs.filter(x => x.id === '__labels' || x.id === '__pog') : tr.secs.filter(x => x.id === id);
  const only = $('#tr-only').checked, ed = canEdit('pog-trans'), canGl = canEdit('glossary');
  const nodes = [];
  const sec0 = tr.secs.find(x => x.id === id);
  nodes.push(h('div', { class: 'se-head' }, h('b', {}, id === '__cover' ? '표지 · 페이지 고정 문구' : sec0?.title || ''), h('span', { class: 'mut' }, `${tr.lang}로 번역 · 페이지를 누르면 그 페이지 칸이 나와요`)));
  // 다음 확인 필요 페이지로
  const order = ['__cover', ...tr.secs.filter(x => x.fx).map(x => x.id)];
  const needOf = k => k === '__cover' ? (tr.needBy.get('__labels') || 0) + (tr.needBy.get('__pog') || 0) : (tr.needBy.get(k) || 0);
  const nextNeed = [...order.slice(order.indexOf(id) + 1), ...order.slice(0, order.indexOf(id))].find(k => needOf(k));
  if (nextNeed) nodes.push(h('button', { class: 'btn small se-next', onclick: () => { setTrActive(nextNeed); (nextNeed === '__cover' ? tr.blocks.get('__cover') : tr.blocks.get(nextNeed))?.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
    `다음 확인 필요 페이지로 → (${needOf(nextNeed)}개)`));
  let shown = 0;
  for (const sec of secs) {
    const rows = [];
    for (const r of sec.rows) {
      const st = rowState(sec, r);
      if (only && !st.need) continue;
      const inp = h('input', { class: 'tr-in' + (st.need ? ' need' : ''), placeholder: st.a.missing.length ? st.a.text : '', disabled: !ed });
      inp.value = st.value;
      inp.addEventListener('input', () => { saveTr(sec.id, r.key, inp.value.trim()); renderTr(); }); // 페이지 그림이 바로 바뀜
      if (canGl && r.fixed === undefined) inp.addEventListener('change', () => { // 사전에 없던 값을 번역했으면 사전에도 넣을지 물어봄
        const v = inp.value.trim();
        if (v && (st.custom || st.a.missing.length)) askGlossary(sec, r, v);
      });
      const why = st.dwMissing ? '도면 번역에서 이 매대를 아직 번역하지 않았어요 (1. 도면 → 도면 번역하기)' : st.a.missing.length ? `사전에 없는 말: ${st.a.missing.join(', ')}` : st.custom ? '기존 선택지가 아니라 직접 입력한 값이에요. 번역을 확인해주세요' : '';
      rows.push(h('div', { class: 'tr-row' + (st.need ? ' need' : '') + (!st.need && why ? ' done' : '') },
        h('div', { class: 'tr-top' }, h('span', { class: 'tr-l' }, r.label),
          st.need ? h('span', { class: 'tr-bang', title: why }, '!') : st.status === 'saved' ? h('span', { class: 'tr-ok', title: '직접 저장한 번역' }, '✓') : h('span', { class: 'tr-auto', title: '사전에서 자동' }, '사전')),
        h('div', { class: 'tr-ko' }, r.ko + (r.qty ? ` × ${r.qty}` : ''), r.hint ? h('div', { class: 'tr-hint' }, r.hint) : null),
        inp, why ? h('div', { class: 'tr-why' }, why) : null,
        (st.need && ed && st.custom && !st.a.missing.length) || (canGl && r.fixed === undefined && (st.custom || st.a.missing.length)) ? h('div', { class: 'se-btns' },
          st.need && ed && st.custom && !st.a.missing.length ? h('button', { class: 'btn small ghost', onclick: () => { saveTr(sec.id, r.key, st.a.text); renderTr(true); } }, '이대로 확인') : null,
          canGl && r.fixed === undefined && (st.custom || st.a.missing.length) ? h('button', { class: 'btn small ghost', onclick: () => askGlossary(sec, r, inp.value.trim()) }, '사전에 추가') : null) : null));
    }
    if (!rows.length) continue;
    shown += rows.length;
    nodes.push(h('section', { class: 'se-sec' }, secs.length > 1 ? h('h4', {}, sec.title) : null, ...rows));
  }
  if (!shown) nodes.push(h('p', { class: 'se-help' }, only ? '이 페이지엔 확인이 필요한 칸이 없어요.' : '이 페이지엔 번역할 글자가 없어요.'));
  if (!ed) nodes.push(h('p', { class: 'se-help' }, '보기 전용이에요. 번역은 글로벌사업부만 고칠 수 있어요.'));
  box.replaceChildren(...nodes);
}
$('#tr-side').addEventListener('focusout', () => setTimeout(() => { if (tr.dirty) renderTrSide(); }, 60));

// 사전에 추가: 넣기 전에 비슷한 단어를 보여줘서 이미 있는 말을 또 만들지 않게
function askGlossary(sec, r, value, opts = {}) {
  const lang = opts.lang || tr.lang, st = opts.st || rowState(sec, r);
  const use = opts.onUse || (v => saveTr(sec.id, r.key, v)), after = opts.after || (() => renderTr(true));
  const entries = r.dict || !st.a.missing.length || (st.a.missing.length === 1 && norm(st.a.missing[0]) === norm(r.ko))
    ? [{ ko: r.ko.trim(), cat: r.dict || r.addCat || '카테고리', val: value }]
    : st.a.missing.map(w => ({ ko: w, cat: r.addCat || '카테고리', val: '' }));
  const blocks = entries.map(en => {
    const inp = h('input', { class: 'tr-in', placeholder: `${lang} 번역` }); inp.value = en.val || '';
    const cat = h('select', { class: 'nb-sel' }, ...CATS.map(c => h('option', { value: c }, c))); cat.value = en.cat;
    const sims = similarWords(en.ko);
    en.inp = inp; en.sel = cat;
    return h('div', { class: 'ag-entry' },
      h('div', { class: 'ag-top' }, h('b', {}, en.ko), cat, inp),
      sims.length ? h('div', { class: 'ag-sim' }, h('div', { class: 'mut' }, '비슷한 단어가 이미 있어요. 같은 뜻이면 그 번역을 쓰세요:'),
        ...sims.map(({ g }) => h('div', { class: 'ag-s' }, h('span', {}, `[${catLabel(g.cat)}] ${g.ko} → ${trOf(g, lang) || '(번역 없음)'}`),
          trOf(g, lang) ? h('button', { class: 'btn small ghost', onclick: () => { inp.value = trOf(g, lang); } }, '이 번역 쓰기') : null)))
        : h('div', { class: 'ag-sim mut' }, '비슷한 단어 없음'));
  });
  const add = h('button', { class: 'btn primary' }, '사전에 추가');
  const skip = h('button', { class: 'btn' }, entries.length === 1 ? '번역에만 쓰기 (사전엔 안 넣음)' : '사전에 안 넣기');
  const close = modal(h('div', {},
    h('h3', {}, '용어 사전에도 저장할까요?'),
    h('p', { class: 'mut' }, `'${r.label}' 칸의 ${entries.length === 1 ? '값' : '사전에 없는 말'}이에요. 사전에 넣어두면 다음부터 자동으로 번역돼요.`),
    ...blocks, h('div', { class: 'modal-act' }, skip, add)), { wide: true });
  const single = entries.length === 1 && entries[0].ko === r.ko.trim();
  skip.onclick = () => { if (single && entries[0].inp.value.trim()) use(entries[0].inp.value.trim()); close(); after(); };
  add.onclick = async () => {
    add.disabled = true;
    try {
      let n = 0;
      for (const en of entries) {
        const v = en.inp.value.trim(), cat = en.sel.value; if (!v) continue;
        const ex = state.glossary.find(g => g.cat === cat && norm(g.ko) === norm(en.ko));
        if (ex) { // 같은 분류에 이미 있으면 이 언어 번역만 채움
          if (lang === 'English') await updateDoc(doc(db, 'glossary', ex.id), { en: v, updatedAt: serverTimestamp(), updatedBy: me() });
          else await updateDoc(doc(db, 'glossary', ex.id), new FieldPath('tr', lang), v, 'updatedAt', serverTimestamp(), 'updatedBy', me());
          glLog(ex, 'edit', [{ f: lang === 'English' ? 'en' : 'tr.' + lang, from: trOf(ex, lang), to: v }]);
        } else {
          const data = { cat, ko: en.ko, en: lang === 'English' ? v : '', createdAt: serverTimestamp(), createdBy: me() };
          if (lang !== 'English') data.tr = { [lang]: v };
          const ref = await addDoc(collection(db, 'glossary'), data);
          glLog({ id: ref.id, cat, ko: en.ko }, 'add', [{ f: lang === 'English' ? 'en' : 'tr.' + lang, from: '', to: v }]);
        }
        n++;
      }
      if (single && entries[0].inp.value.trim()) use(entries[0].inp.value.trim());
      toast(n ? `사전에 ${n}개 저장했어요` : '저장할 번역이 없어요');
      close();
    } catch (e) { toast('저장 실패: ' + e.message); add.disabled = false; }
  };
}
// 온라인 POG에 반영: 지금 보이는 최종 번역(사전 자동 + 직접 고친 것)을 out에 고정 저장
$('#tr-publish').onclick = async () => {
  if (!tr.pog) return;
  let need = 0; const out = {};
  for (const sec of trSections()) for (const r of sec.rows) {
    const st = rowState(sec, r); if (st.need) need++;
    const v = st.value || st.a.text; if (v) (out[sec.id] ||= {})[r.key] = v;
  }
  if (need && !confirm(`확인 필요한 칸이 ${need}개 남아 있어요. 그래도 지금 상태로 온라인 POG에 반영할까요?`)) return;
  try {
    // out은 통째로 바꿈 (지난번 반영에만 있던 항목이 남지 않게). fx(직접 고친 번역)는 그대로
    await setDoc(doc(db, 'pogs', tr.pog.id, 'translations', tr.lang), { lang: tr.lang, out, publishedAt: serverTimestamp(), publishedBy: me() }, { mergeFields: ['lang', 'out', 'publishedAt', 'publishedBy'] });
    toast(`${tr.lang} 번역을 온라인 POG에 반영했어요`);
  } catch (e) { toast('반영 실패: ' + e.message); }
};

/* ---------- 매장 등록 (글사부) ----------
   stores/{id}: code(매장코드 = POG 사이트 매장코드), partner, branch, openDate. 도면은 drawings/{같은 id} */
const storeName = st => st ? `${st.partner || ''} ${st.branch || ''}`.trim() : '';
const storeForPog = pog => pog && (state.stores.find(x => x.id === pog.storeId) || state.stores.find(x => String(x.code).trim() === String(pog.storeCode || '').trim()));
function renderStores() {
  const body = $('#st-body'); if (!body) return;
  const ed = canEdit('stores');
  body.innerHTML = '';
  if (!state.stores.length) { body.append(h('tr', {}, h('td', { colspan: 7, class: 'mut pad' }, '등록된 매장이 없어요.'))); return; }
  for (const st of state.stores) {
    const inp = (f, type = 'text') => {
      const el = h('input', { type, value: st[f] || '', disabled: !ed });
      el.addEventListener('change', async () => {
        const v = el.value.trim();
        if (f === 'code' && state.stores.some(x => x.id !== st.id && String(x.code) === v)) { toast('이미 있는 매장코드예요'); el.value = st.code; return; }
        await updateDoc(doc(db, 'stores', st.id), { [f]: v, updatedAt: serverTimestamp(), updatedBy: me() }); toast('수정했어요');
      });
      return el;
    };
    const d = state.dwMap.get(st.id);
    const fin = d && dwFinalNo(d);
    const pogs = state.pogs.filter(p => String(p.storeCode) === String(st.code));
    body.append(h('tr', {}, h('td', {}, inp('code')), h('td', {}, inp('partner')), h('td', {}, inp('branch')), h('td', {}, inp('openDate', 'date')),
      h('td', { class: 'st-dw' }, d?.latestNo ? `ver.${d.latestNo}${fin ? ` · ★ver.${fin}` : ''}${d.area ? ` · ${d.area}평` : ''}` : '없음'),
      h('td', { class: 'st-dw' }, pogs.length ? `${pogs.length}개${pogs.some(p => p.status === 'final') ? ' (최종 있음)' : ''}` : '없음'),
      h('td', { class: 'tc' }, ed && !d?.latestNo ? h('button', { class: 'btn ghost danger small', onclick: async () => {
        if (confirm(`'${storeName(st)}' 매장을 지울까요?`)) await deleteDoc(doc(db, 'stores', st.id));
      } }, '삭제') : null)));
  }
}
$('#st-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, code = f.code.value.trim(), partner = f.partner.value.trim(), branch = f.branch.value.trim(), openDate = f.open.value;
  if (!code || !partner || !branch) return;
  if (state.stores.some(x => String(x.code) === code)) { toast('이미 등록된 매장코드예요'); return; }
  try {
    await addDoc(collection(db, 'stores'), { code, partner, branch, openDate, createdAt: serverTimestamp(), createdBy: me() });
    toast('매장을 등록했어요'); f.reset(); f.code.focus();
  } catch (err) { toast('등록 실패: ' + err.message); }
});

/* ---------- 1. 도면: 업로드(VMD) · 번역하기(글사부) ----------
   drawings/{storeId}: storeId, storeCode, area(평수), latestNo, finalVersion(★ 최종본 버전 id), status('final' = 내보낸 버전이 있음)
   drawings/{storeId}/versions/{vId}: no, fileName, url/path(정리한 SVG), baseUrl/basePath(글자를 뺀 SVG = 영문 바탕),
     w, h(viewBox), groups(매대명 글자 묶음 [{id, ko, lines, x,y,w,h, fs}]), memo, exported, uploadedAt/By, exportedAt/By
   drawings/{storeId}/translations/{언어}: v: { vId: { groupId: { ko, text, dx, dy, sc } } }
   SVG는 올릴 때 한 번만 브라우저에서 읽어서 글자 위치를 저장한다 (나중엔 그림으로만 보여줘서 다른 설정이 필요 없음) */
const dwFinal = d => d?.finalVersion || null;
const dwFinalNo = d => d?.finalNo || null;
const dw = { tab: 'up', id: null, doc: null, versions: [], vId: null, lang: 'English', tr: {}, sel: null, unsubs: [], onlyNeed: false };
$$('[data-dwtab]').forEach(b => b.onclick = () => {
  dw.tab = b.dataset.dwtab;
  $$('[data-dwtab]').forEach(x => x.classList.toggle('on', x === b));
  const id = dw.id; closeDw(); renderDwList();
  if (id && dwListRows().some(x => x.id === id)) openDw(id);
});
$('#dw-search').addEventListener('input', renderDwList);
function dwListRows() {
  const q = $('#dw-search').value.trim().toLowerCase();
  return state.stores.filter(st => {
    const d = state.dwMap.get(st.id);
    if (dw.tab === 'tr' && !(d?.status === 'final')) return false; // 번역은 내보낸 도면만
    return !q || [st.code, st.partner, st.branch].join(' ').toLowerCase().includes(q);
  });
}
function renderDwList() {
  const list = $('#dw-list'); if (!list) return;
  const rows = dwListRows();
  list.innerHTML = '';
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, dw.tab === 'tr' ? '내보낸 도면이 있는 매장이 없어요.' : '등록된 매장이 없어요. 처음 화면의 \'매장 등록\'에서 먼저 등록해주세요.'));
  for (const st of rows) {
    const d = state.dwMap.get(st.id);
    const sub = !d?.latestNo ? '도면 없음' : `ver.${d.latestNo}${d.latestExported ? '' : ' 작성 중'}${dwFinalNo(d) ? ` · ★ver.${dwFinalNo(d)}` : ''}`;
    list.append(h('div', { class: 'pitem' + (dw.id === st.id ? ' on' : ''), onclick: () => openDw(st.id) },
      h('div', { class: 'pi-top' }, h('b', {}, storeName(st)), d?.status === 'final' ? h('span', { class: 'badge final' }, '내보냄') : d?.latestNo ? h('span', { class: 'badge draft' }, '작성 중') : null),
      h('div', { class: 'pi-sub' }, `${st.code} · ${sub}`)));
  }
  $('#dw-empty').replaceChildren(...(dw.tab === 'up'
    ? [h('div', { class: 'upload-rule' }, h('b', {}, '업로드 파일은 SVG 파일'), ' · ', h('b', {}, '글씨는 윤곽선 만들기 하지 말아주세요'),
        h('div', { class: 'mut' }, '한글 매대명이 들어간 도면 파일 하나만 올리면 돼요. 영문 도면은 이 파일에서 글자만 바꿔 만들어요.')),
       h('div', {}, '왼쪽에서 매장을 고르세요.')]
    : [h('div', {}, '번역할 매장을 고르세요.'), h('div', { class: 'mut' }, 'VMD실이 내보낸 도면만 나와요.')]));
}
function closeDw() {
  dw.unsubs.forEach(u => u()); dw.unsubs = []; dw.id = null; dw.doc = null; dw.versions = []; dw.vId = null; dw.tr = {}; dw.sel = null;
  $('#dw-body')?.classList.add('hidden'); $('#dw-empty')?.classList.remove('hidden');
  $('#v-drawing .split')?.classList.remove('list-off');
}
function openDw(id) {
  closeDw();
  dw.id = id;
  $('#dw-empty').classList.add('hidden'); $('#dw-body').classList.remove('hidden');
  $('#dw-stage').replaceChildren(h('div', { class: 'mut pad' }, '불러오는 중…'));
  renderDwList();
  dw.unsubs.push(onSnapshot(doc(db, 'drawings', id), d => { dw.doc = d.exists() ? { id: d.id, ...d.data() } : null; renderDw(); }, () => { }));
  dw.unsubs.push(onSnapshot(query(collection(db, 'drawings', id, 'versions'), orderBy('no')), s => {
    dw.versions = s.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!dw.versions.some(v => v.id === dw.vId)) dw.vId = null;
    renderDw();
  }, () => { dw.versions = []; renderDw(); }));
  subDwTr();
}
function subDwTr() {
  dw.unsubTr?.();
  if (dw.tab !== 'tr' || !dw.id) return;
  const id = dw.id, lang = dw.lang;
  dw.unsubTr = onSnapshot(doc(db, 'drawings', id, 'translations', lang), d => {
    if (dw.id !== id || dw.lang !== lang) return;
    const data = d.exists() ? d.data() : {};
    dw.tr = { ...data, v: { ...(data.v || {}) } };
    for (const [k, v] of Object.entries(dw.local || {})) if (pendingKey(k)) { const [, , , vid, gid] = k.split('|'); ((dw.tr.v[vid] ||= {})[gid] ||= {}); Object.assign(dw.tr.v[vid][gid], v); }
    renderDw();
  }, () => { });
  dw.unsubs.push(() => dw.unsubTr?.());
}
const curVersion = () => dw.versions.find(v => v.id === dw.vId);
function pickDefaultVersion() {
  if (dw.vId && dw.versions.some(v => v.id === dw.vId)) return;
  const exported = dw.versions.filter(v => v.exported);
  dw.vId = dw.tab === 'tr' ? (dwFinal(dw.doc) && exported.some(v => v.id === dwFinal(dw.doc)) ? dwFinal(dw.doc) : exported.at(-1)?.id)
    : dw.versions.at(-1)?.id || null;
}
function renderDw() {
  if (!dw.id) return;
  const st = state.stores.find(x => x.id === dw.id);
  pickDefaultVersion();
  const v = curVersion(), up = dw.tab === 'up';
  $('#dw-title').textContent = `${storeName(st)} (${st?.code || ''})`;
  const area = $('#dw-area'); area.disabled = !up || !canEdit('drawing');
  if (area !== document.activeElement) area.value = dw.doc?.area ?? '';
  $('#dw-area-f').classList.toggle('hidden', !up && !dw.doc?.area);
  $('#dw-lang-f').classList.toggle('hidden', up); $('#dw-ko-f').classList.toggle('hidden', up);
  if (!up) { const langs = trLangs(), sel = $('#dw-lang'); if (!langs.includes(dw.lang)) dw.lang = 'English'; sel.replaceChildren(...langs.map(l => h('option', { value: l }, l))); sel.value = dw.lang; }
  const fin = dwFinal(dw.doc);
  $('#dw-ver').textContent = v ? `ver.${v.no}${v.id === fin ? ' ★최종본' : ''}${v.exported ? '' : ' · 작성 중'}` : '도면 없음';
  $('#dw-ver').className = 'badge ' + (v?.exported ? 'final' : 'draft');
  $('#dw-upload').classList.toggle('hidden', !up || !canEdit('drawing'));
  $('#dw-upload').textContent = dw.versions.length ? '재업로드' : '도면 파일 올리기';
  $('#dw-export').classList.toggle('hidden', !up || !canEdit('drawing') || !v || v.exported);
  $('#dw-print').classList.toggle('hidden', !v);
  renderDwStage(); renderDwSide();
}
$('#dw-area').addEventListener('input', e => {
  const id = dw.id, st = state.stores.find(x => x.id === id), val = e.target.value === '' ? '' : Number(e.target.value);
  queueWrite(`dw|${id}|area`, () => setDoc(doc(db, 'drawings', id), { storeId: id, storeCode: st?.code || '', area: val, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true }));
});
$('#dw-lang').addEventListener('change', e => { dw.lang = e.target.value; dw.tr = {}; subDwTr(); renderDw(); });
$('#dw-ko').addEventListener('change', () => renderDwStage());
$('#dw-upload').onclick = () => $('#dw-file').click();
$('#dw-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await uploadDrawing(f); };
$('#dw-print').onclick = () => {
  const imgs = $$('#dw-stage img').filter(i => !i.complete);
  Promise.all(imgs.map(i => new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 8000); }))).then(() => window.print());
};

// SVG 읽기: 위험한 부분(script 등) 빼고, 화면 밖에 그려서 글자마다 위치를 잰 뒤 매대 단위로 묶음
async function analyzeSvg(text) {
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = xml.documentElement;
  if (xml.querySelector('parsererror') || svg.nodeName.toLowerCase() !== 'svg') throw new Error('SVG 파일이 아니에요');
  svg.querySelectorAll('script, foreignObject, iframe').forEach(e => e.remove());
  svg.querySelectorAll('*').forEach(e => [...e.attributes].forEach(a => { if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name); }));
  const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = vb.length === 4 && vb.every(n => isFinite(n)) && vb[2] > 0 ? vb
    : [0, 0, parseFloat(svg.getAttribute('width')) || 1000, parseFloat(svg.getAttribute('height')) || 700];
  if (!svg.getAttribute('viewBox')) svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  const clean = new XMLSerializer().serializeToString(svg);
  const host = h('div', { style: 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none' });
  const live = document.importNode(svg, true);
  live.setAttribute('width', vw); live.setAttribute('height', vh);
  host.append(live); document.body.append(host);
  const root = live.getBoundingClientRect(), k = vw / (root.width || vw);
  const lines = [];
  live.querySelectorAll('text').forEach(t => {
    const parts = [...t.querySelectorAll('tspan')].filter(x => !x.querySelector('tspan'));
    for (const el of parts.length ? parts : [t]) {
      if (!el.textContent.trim()) continue;
      for (const c of charRuns(el)) {
        const w = c.w * k, hh = c.h * k;
        lines.push({ text: c.text, x: (c.x - root.left) * k, y: (c.y - root.top) * k, w, h: hh, lh: c.text.length > 1 && hh > w * 1.5 ? w : hh }); // lh = 글자 굵기 (세로 글씨면 폭)
      }
    }
  });
  host.remove();
  const base = svg.cloneNode(true); base.querySelectorAll('text').forEach(e => e.remove());
  return { w: vw, h: vh, clean, base: new XMLSerializer().serializeToString(base), lines: lines.length, groups: groupLines(lines) };
}
// 글자 조각 하나를 글자 위치로 다시 나눔: 한 조각 안에 멀리 떨어진 매대명 여러 개가 들어 있을 때 (글자 크기만큼 떨어지면 다른 덩어리)
function charRuns(el) {
  const whole = () => { const r = el.getBoundingClientRect(); return r.width && r.height ? [{ text: el.textContent.replace(/\s+/g, ' ').trim(), x: r.left, y: r.top, w: r.width, h: r.height }] : []; };
  let n, m;
  try { n = el.getNumberOfChars(); m = el.getScreenCTM(); } catch { return whole(); }
  if (!n || !m || n > 2000) return whole();
  const str = el.textContent, boxes = [];
  for (let i = 0; i < n; i++) {
    let e; try { e = el.getExtentOfChar(i); } catch { return whole(); }
    const pts = [[e.x, e.y], [e.x + e.width, e.y], [e.x, e.y + e.height], [e.x + e.width, e.y + e.height]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    boxes.push({ ch: str[i] ?? '', x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys) });
  }
  const runs = []; let cur = null, prev = null;
  for (const bx of boxes) {
    if (/\s/.test(bx.ch)) { if (cur) cur.sp = true; continue; }
    const fs = Math.min(bx.r - bx.x, bx.b - bx.y) > 0 ? Math.max(bx.r - bx.x, bx.b - bx.y) : 0;
    const gap = prev ? Math.max(bx.x - prev.r, prev.x - bx.r, bx.y - prev.b, prev.y - bx.b, 0) : 0;
    if (!cur || gap > Math.max(fs, prev.b - prev.y, prev.r - prev.x) * 0.9) { cur = { text: '', x: bx.x, y: bx.y, r: bx.r, b: bx.b }; runs.push(cur); }
    else if (cur.sp) cur.text += ' ';
    cur.sp = false; cur.text += bx.ch;
    cur.x = Math.min(cur.x, bx.x); cur.y = Math.min(cur.y, bx.y); cur.r = Math.max(cur.r, bx.r); cur.b = Math.max(cur.b, bx.b);
    prev = bx;
  }
  const out = runs.filter(r => r.text && r.r > r.x && r.b > r.y).map(r => ({ text: r.text, x: r.x, y: r.y, w: r.r - r.x, h: r.b - r.y }));
  return out.length ? out : whole();
}
// 같은 매대 이름: 같은 줄에서 바로 붙은 조각 + 위아래로 이어지고 가로로 겹치는 줄 (예: '캐릭터인형' / 'ACC' / '/파우치 키링')
function groupLines(lines) {
  const par = lines.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
    const p = lines[a], q = lines[b], lh = Math.max(Math.min(p.lh, q.lh), 0.5);
    const hOver = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
    const vGap = Math.max(p.y, q.y) - Math.min(p.y + p.h, q.y + q.h);
    const sameRow = Math.abs((p.y + p.h / 2) - (q.y + q.h / 2)) < lh * 0.5;
    const near = sameRow ? -hOver < lh * 0.35
      : vGap < lh * 0.5 && Math.abs((p.x + p.w / 2) - (q.x + q.w / 2)) < Math.max(p.w, q.w) * 0.6 + lh;
    if (near) par[find(a)] = find(b);
  }
  const m = new Map(); lines.forEach((l, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(l); });
  const groups = [...m.values()].map(makeGroup).sort((a, b) => a.y - b.y || a.x - b.x);
  return groups.map((g, i) => ({ id: 'g' + i, ...g }));
}
// 글자 조각들 → 매대명 묶음 하나 (parts = 나누기·합치기용 조각)
function makeGroup(ls) {
  ls.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const l of ls) { const last = rows.at(-1); if (last && Math.abs(last.cy - (l.y + l.h / 2)) < l.lh * 0.5) last.parts.push(l); else rows.push({ cy: l.y + l.h / 2, parts: [l] }); }
  const texts = rows.map(r => r.parts.sort((a, b) => a.x - b.x).reduce((acc, p, i, arr) => !i ? p.text : acc + (p.x - (arr[i - 1].x + arr[i - 1].w) > p.lh * 0.25 ? ' ' : '') + p.text, ''));
  const x = Math.min(...ls.map(l => l.x)), y = Math.min(...ls.map(l => l.y));
  const fs = ls.map(l => l.lh).sort((a, b) => a - b)[Math.floor(ls.length / 2)];
  const parts = ls.map(l => ({ text: l.text, x: +l.x.toFixed(2), y: +l.y.toFixed(2), w: +l.w.toFixed(2), h: +l.h.toFixed(2), lh: +(l.lh ?? l.h).toFixed(2) }));
  return { ko: joinLabel(texts), lines: texts, parts, x: +x.toFixed(2), y: +y.toFixed(2), w: +(Math.max(...ls.map(l => l.x + l.w)) - x).toFixed(2), h: +(Math.max(...ls.map(l => l.y + l.h)) - y).toFixed(2), fs: +fs.toFixed(2) };
}
// 줄 잇기: '/'로 끝나거나 시작하면 붙이고, 아니면 띄어쓰기
const joinLabel = ts => ts.reduce((acc, t) => !acc ? t : (acc.endsWith('/') || t.startsWith('/') ? acc + t : acc + ' ' + t), '');

async function uploadDrawing(file) {
  if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') { alert('SVG 파일만 올릴 수 있어요.\n(Illustrator: 파일 → 내보내기 → 다른 이름으로 내보내기 → SVG. 글씨는 윤곽선 만들기 하지 말아주세요)'); return; }
  const id = dw.id, store = state.stores.find(x => x.id === id);
  let an;
  try { toast('도면을 읽는 중…'); an = await analyzeSvg(await file.text()); }
  catch (e) { alert('도면을 읽지 못했어요: ' + e.message); return; }
  if (!an.groups.length && !confirm('도면에서 글자를 하나도 못 읽었어요.\n매대명을 윤곽선 만들기 했다면 번역을 할 수 없어요.\n그래도 올릴까요?')) return;
  const latest = dw.versions.at(-1), redo = latest && !latest.exported; // 아직 안 내보낸 버전이면 그 버전을 바꿈
  const no = redo ? latest.no : (latest?.no || 0) + 1, vId = redo ? latest.id : 'v' + no, ts = Date.now();
  const path = `drawings/${id}/v${no}_${ts}.svg`, basePath = `drawings/${id}/v${no}_${ts}_base.svg`;
  try {
    toast('도면 올리는 중…');
    const typ = { contentType: 'image/svg+xml' };
    await uploadBytes(sRef(st, path), new Blob([an.clean], { type: 'image/svg+xml' }), typ);
    await uploadBytes(sRef(st, basePath), new Blob([an.base], { type: 'image/svg+xml' }), typ);
    const [url, baseUrl] = await Promise.all([getDownloadURL(sRef(st, path)), getDownloadURL(sRef(st, basePath))]);
    if (redo) for (const p of [latest.path, latest.basePath]) if (p) deleteObject(sRef(st, p)).catch(() => { });
    await setDoc(doc(db, 'drawings', id, 'versions', vId), {
      no, fileName: file.name, url, path, baseUrl, basePath, w: an.w, h: an.h, groups: an.groups, lineCount: an.lines,
      memo: redo ? (latest.memo || '') : '', exported: false, uploadedAt: serverTimestamp(), uploadedBy: me(),
    });
    await setDoc(doc(db, 'drawings', id), { storeId: id, storeCode: store?.code || '', latestNo: no, latestExported: false, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true });
    dw.vId = vId;
    toast(`ver.${no} 올렸어요 · 매대명 ${an.groups.length}개 읽음. 다 되면 '내보내기'를 눌러주세요`);
  } catch (e) { toast('올리기 실패: ' + e.message); }
}
$('#dw-export').onclick = async () => {
  const v = curVersion(); if (!v || v.exported) return;
  if (!confirm(`ver.${v.no}을(를) 내보낼까요?\n내보내면 글로벌사업부가 번역할 수 있어요. 고칠 게 생기면 '재업로드'로 다음 버전을 올리면 돼요.`)) return;
  const b = writeBatch(db);
  b.update(doc(db, 'drawings', dw.id, 'versions', v.id), { exported: true, exportedAt: serverTimestamp(), exportedBy: me() });
  b.set(doc(db, 'drawings', dw.id), { status: 'final', latestExported: v.no === dw.doc?.latestNo, updatedAt: serverTimestamp() }, { merge: true });
  await b.commit();
  toast(`ver.${v.no}을(를) 내보냈어요. 최종본이면 버전 기록에서 ★를 눌러주세요`);
};
async function starVersion(v) {
  await setDoc(doc(db, 'drawings', dw.id), { finalVersion: v.id, finalNo: v.no, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true });
  toast(`ver.${v.no}을(를) 최종본(★)으로 정했어요. POG에서 이 도면이 보여요`);
}

// 도면 번역 값: 이 버전에 저장한 것 > 다른 버전에서 같은 한국어로 저장한 것 > 사전 자동
function dwRowState(g, vId = dw.vId, trDoc = dw.tr, lang = dw.lang) {
  const m0 = trDoc?.v?.[vId]?.[g.id] || {};
  const m = m0.ko && norm(m0.ko) !== norm(g.ko) ? {} : m0; // 나누기·합치기로 글자가 바뀌었으면 예전 번역은 안 씀
  let prev = '';
  if (!m.text) for (const [vid, map] of Object.entries(trDoc?.v || {})) { if (vid === vId) continue; const hit = Object.values(map || {}).find(x => x?.text && norm(x.ko) === norm(g.ko)); if (hit) { prev = hit.text; break; } }
  const a = autoTranslate(g.ko, lang, ['카테고리']);
  const value = m.text || prev || (a.missing.length ? '' : a.text);
  return { m, prev, a, value, show: value || a.text, need: !m.text && !prev && a.missing.length > 0, status: m.text ? 'saved' : prev ? 'prev' : a.missing.length ? 'missing' : 'auto' };
}
// POG 헤더용: 도면 매대 영문 (저장된 번역 없으면 사전 자동이 완전할 때만)
function dwEnglish(ref, lang) {
  const g = { id: ref.gid, ko: ref.ko };
  const s0 = dwRowState(g, ref.vId, tr.dwTr || {}, lang);
  return s0.value || '';
}
function saveDwTr(gid, patch) {
  const id = dw.id, lang = dw.lang, vId = dw.vId, g = curVersion()?.groups.find(x => x.id === gid);
  const k = `dwtr|${id}|${lang}|${vId}|${gid}`;
  const cur = (((dw.tr.v ||= {})[vId] ||= {})[gid] ||= {});
  Object.assign(cur, { ko: g?.ko || '' }, patch);
  (dw.local ||= {})[k] = { ...cur };
  queueWrite(k, () => setDoc(doc(db, 'drawings', id, 'translations', lang), { lang, v: { [vId]: { [gid]: { ...dw.local[k] } } }, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true }));
}

// 그림: 업로드 화면 = 원본 + 읽은 매대명 표시 / 번역 화면 = 글자 뺀 바탕 + 번역 글자
function drawingView(v, mode, { onPick, used, selId, picks } = {}) {
  const wrap = h('div', { class: 'dw-canvas', style: `aspect-ratio:${v.w} / ${v.h}` }, h('img', { src: mode === 'en' ? v.baseUrl : v.url, alt: '', draggable: 'false' }));
  const pct = (n, of) => `${(n / of * 100).toFixed(3)}%`;
  for (const g of v.groups || []) {
    if (mode === 'en') {
      const s0 = dwRowState(g), m = s0.m, sc = m.sc || 1;
      const el = h('div', { class: 'dw-lab' + (s0.need ? ' need' : '') + (g.id === selId ? ' on' : '') + (canEdit('drawing-trans') ? ' edit' : ''),
        style: `left:${pct(g.x + g.w / 2 + (m.dx || 0), v.w)};top:${pct(g.y + (m.dy || 0), v.h)};font-size:${(g.fs * 0.82 * sc / v.w * 100).toFixed(4)}cqw` },
        (s0.show || g.ko).replace(/ ?\/ ?/g, '/'));
      el.title = g.ko;
      el.addEventListener('pointerdown', e => dragLabel(e, g, wrap, v));
      wrap.append(el);
    } else {
      const el = h('div', { class: 'dw-box' + (onPick ? ' pick' : '') + (used?.has(g.id) ? ' used' : '') + (g.id === selId || picks?.has(g.id) ? ' on' : ''),
        style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko });
      if (onPick) el.onclick = () => onPick(g);
      wrap.append(el);
    }
  }
  return wrap;
}
function dragLabel(e, g, wrap, v) {
  dw.sel = g.id; renderDwSide();
  $$('.dw-lab.on', wrap).forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on');
  if (!canEdit('drawing-trans')) return;
  e.preventDefault();
  const el = e.currentTarget, m0 = dwRowState(g).m, k = v.w / wrap.clientWidth, sx = e.clientX, sy = e.clientY, dx0 = m0.dx || 0, dy0 = m0.dy || 0;
  let dx = dx0, dy = dy0, moved = false;
  const mv = ev => {
    dx = dx0 + (ev.clientX - sx) * k; dy = dy0 + (ev.clientY - sy) * k; moved = true;
    el.style.left = `${((g.x + g.w / 2 + dx) / v.w * 100).toFixed(3)}%`; el.style.top = `${((g.y + dy) / v.h * 100).toFixed(3)}%`;
  };
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (moved) saveDwTr(g.id, { dx: +dx.toFixed(2), dy: +dy.toFixed(2) }); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
function renderDwStage() {
  const box = $('#dw-stage'), v = curVersion(); if (!box) return;
  if (!v) {
    box.replaceChildren(h('div', { class: 'upload-rule' }, h('b', {}, '업로드 파일은 SVG 파일'), ' · ', h('b', {}, '글씨는 윤곽선 만들기 하지 말아주세요'),
      h('div', { class: 'mut' }, canEdit('drawing') ? "위의 '도면 파일 올리기'를 눌러 한글 도면 SVG를 올려주세요." : 'VMD실이 아직 도면을 올리지 않았어요.')));
    return;
  }
  const en = dw.tab === 'tr' && !$('#dw-ko').checked;
  const legend = dw.tab === 'up'
    ? h('div', { class: 'dw-legend' }, `파란 칸 = 사이트가 읽은 매대명 ${v.groups?.length || 0}개. 파란 칸이 없는 글자는 윤곽선이 된 글자라 번역할 수 없어요.${canEdit('drawing') ? ' 칸을 누르면 고르고, 오른쪽에서 나누기·합치기를 할 수 있어요.' : ''}`,
      !v.groups?.length ? h('span', { class: 'warn' }, ' 글자를 하나도 못 읽었어요!') : null)
    : h('div', { class: 'dw-legend' }, en ? '글자를 끌어서 옮길 수 있어요. 누르면 오른쪽에서 고쳐요. 회색 점선 = 아직 번역 안 된 글자' : '한글 원본이에요.');
  const pickable = dw.tab === 'up' && canEdit('drawing');
  box.replaceChildren(legend, drawingView(v, en ? 'en' : 'ko', pickable ? { picks: dwPicks(), onPick: g => togglePick(g.id) } : { selId: dw.sel }));
}
function verCard(v, { canStar, onOpen }) {
  const fin = dwFinal(dw.doc) === v.id;
  return h('div', { class: 'dw-ver' + (v.id === dw.vId ? ' cur' : ''), onclick: onOpen },
    h('div', { class: 't' }, h('b', {}, `ver.${v.no}`),
      h('span', { class: 'badge ' + (v.exported ? 'final' : 'draft') }, v.exported ? '내보냄' : '작성 중'),
      canStar && v.exported ? h('button', { class: 'dw-star' + (fin ? ' on' : ''), title: fin ? '최종본' : '최종본으로 정하기', onclick: e => { e.stopPropagation(); if (!fin) starVersion(v); } }, '★')
        : fin ? h('span', { class: 'dw-star on', title: '최종본' }, '★') : null),
    h('div', { class: 'd' }, `올림 ${fmtTime(v.uploadedAt)} · ${v.uploadedBy || ''}${v.exportedAt ? ` · 내보냄 ${fmtTime(v.exportedAt)}` : ''}`),
    v.memo ? h('div', { class: 'm' }, v.memo) : null);
}
function renderDwSide() {
  const box = $('#dw-side'); if (!box || !dw.id) return;
  const a = document.activeElement;
  if (box.contains(a) && /INPUT|TEXTAREA/.test(a.tagName)) return; // 입력 중이면 그대로
  const v = curVersion(), nodes = [];
  const sec = (t, ...k) => h('section', { class: 'se-sec' }, h('h4', {}, t), ...k);
  const vers = [...dw.versions].reverse();
  if (dw.tab === 'up') {
    const ed = canEdit('drawing');
    if (v) {
      nodes.push(h('div', { class: 'se-head' }, h('b', {}, `ver.${v.no}${dwFinal(dw.doc) === v.id ? ' ★최종본' : ''}`), h('span', { class: 'mut' }, `${v.fileName || ''} · 매대명 ${v.groups?.length || 0}개 읽음`)));
      const ta = h('textarea', { class: 'se-memo', rows: 5, placeholder: ed ? (v.no > 1 ? '이번 버전에서 바뀐 것, 특이사항' : '특이사항 메모') : '', disabled: !ed });
      ta.value = v.memo || '';
      ta.addEventListener('input', () => queueWrite(`dw|${dw.id}|${v.id}|memo`, () => updateDoc(doc(db, 'drawings', dw.id, 'versions', v.id), { memo: ta.value })));
      nodes.push(sec(v.no > 1 ? '메모 (바뀐 것·특이사항)' : '특이사항 메모', ta));
      if (ed) nodes.push(groupEditor(v));
    } else nodes.push(h('p', { class: 'se-help' }, '아직 올린 도면이 없어요.'));
    if (vers.length) nodes.push(sec('버전 기록', h('p', { class: 'se-help' }, ed ? '내보낸 버전 중 최종본에 ★를 누르세요. ★ 버전이 POG에서 보여요.' : '★ = 최종본 (POG에서 보이는 도면)'),
      ...vers.map(x => verCard(x, { canStar: ed, onOpen: () => { dw.vId = x.id; renderDw(); } }))));
  } else {
    const ed = canEdit('drawing-trans'), canGl = canEdit('glossary');
    if (!v) { box.replaceChildren(h('p', { class: 'se-help' }, '내보낸 도면이 없어요.')); return; }
    const groups = v.groups || [], states = groups.map(g => [g, dwRowState(g)]), needN = states.filter(([, s0]) => s0.need).length;
    nodes.push(h('div', { class: 'se-head' }, h('b', {}, `ver.${v.no}${dwFinal(dw.doc) === v.id ? ' ★최종본' : ''} · ${dw.lang}`),
      h('span', { class: needN ? 'badge warn' : 'badge final' }, needN ? `확인 필요 ${needN}` : '모두 번역됨')));
    const g = groups.find(x => x.id === dw.sel);
    if (g) {
      const s0 = dwRowState(g);
      const ta = h('textarea', { class: 'se-memo', rows: 2, placeholder: s0.a.text, disabled: !ed }); ta.value = s0.value;
      ta.addEventListener('input', () => { saveDwTr(g.id, { text: ta.value.trim() }); renderDwStage(); });
      if (canGl) ta.addEventListener('change', () => {
        const val = ta.value.trim();
        if (val && s0.a.missing.length) askGlossary({ id: 'dw' }, { key: g.id, label: '도면 매대명', ko: g.ko, addCat: '카테고리' }, val,
          { lang: dw.lang, st: { a: s0.a, custom: false }, onUse: x => saveDwTr(g.id, { text: x }), after: () => renderDw() });
      });
      const scSel = h('select', { class: 'nb-sel', disabled: !ed }, ...[0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.7, 2].map(x => h('option', { value: x }, Math.round(x * 100) + '%')));
      scSel.value = String(s0.m.sc || 1); scSel.onchange = () => { saveDwTr(g.id, { sc: Number(scSel.value) }); renderDwStage(); };
      nodes.push(sec('고르는 글자', h('div', { class: 'tr-ko' }, g.lines.join('\n')),
        ta, s0.a.missing.length && !s0.m.text && !s0.prev ? h('div', { class: 'tr-why', style: 'color:var(--red)' }, `사전에 없는 말: ${s0.a.missing.join(', ')}`) : null,
        s0.status === 'prev' ? h('div', { class: 'tr-why' }, '이전 버전 번역을 그대로 가져왔어요') : null,
        h('div', { class: 'se-btns' }, h('span', { class: 'nb-l' }, '글자 크기'), scSel,
          ed ? h('button', { class: 'btn small ghost', onclick: () => { saveDwTr(g.id, { dx: 0, dy: 0, sc: 1 }); renderDw(); } }, '위치·크기 처음대로') : null,
          canGl && s0.a.missing.length ? h('button', { class: 'btn small ghost', onclick: () => askGlossary({ id: 'dw' }, { key: g.id, label: '도면 매대명', ko: g.ko, addCat: '카테고리' }, ta.value.trim(),
            { lang: dw.lang, st: { a: s0.a, custom: false }, onUse: x => saveDwTr(g.id, { text: x }), after: () => renderDw() }) }, '사전에 추가') : null)));
    }
    const only = h('input', { type: 'checkbox', checked: dw.onlyNeed }); only.onchange = () => { dw.onlyNeed = only.checked; renderDwSide(); };
    nodes.push(sec(`매대명 ${groups.length}개`, h('label', { class: 'nb-chk' }, only, ' 확인 필요만'),
      h('div', { class: 'dw-glist' }, ...states.filter(([, s0]) => !dw.onlyNeed || s0.need).map(([x, s0]) => h('div', { class: 'dw-gi' + (s0.need ? ' need' : '') + (x.id === dw.sel ? ' on' : ''), onclick: () => { dw.sel = x.id; renderDwStage(); renderDwSide(); } },
        h('span', { class: 'ko' }, x.ko), h('span', { class: 'en' }, s0.need ? '!' : s0.show))))));
    nodes.push(sec('버전 기록', ...vers.filter(x => x.exported).map(x => verCard(x, { canStar: false, onOpen: () => { dw.vId = x.id; dw.sel = null; renderDw(); } }))));
  }
  box.replaceChildren(...nodes);
}
// 매대명 묶음 고치기 (업로드 탭): 자동으로 묶은 게 틀렸을 때 나누기·합치기
function dwPicks() { if (dw.picksV !== dw.vId) { dw.picks = new Set(); dw.picksV = dw.vId; } return dw.picks; }
function togglePick(id) { const p = dwPicks(); p.has(id) ? p.delete(id) : p.add(id); renderDwStage(); renderDwSide(); }
function groupEditor(v) {
  const groups = v.groups || [], picks = dwPicks(), sel = groups.filter(g => picks.has(g.id));
  const nextId = () => 'g' + (Math.max(-1, ...groups.map(g => parseInt(g.id.slice(1)) || 0)) + 1 + nextId.n++); nextId.n = 0;
  const save = async (list, msg) => {
    const linked = [...state.fixtures.values()].some(f => f.drawingRef?.vId === v.id);
    if (v.exported && !confirm(`이미 내보낸 버전이에요. ${msg}${linked ? '\nPOG에서 이 버전의 매대를 고른 페이지가 있으면, 나뉜 매대는 다시 골라야 할 수 있어요.' : ''}\n계속할까요?`)) return;
    list.sort((a, b) => a.y - b.y || a.x - b.x);
    try { await updateDoc(doc(db, 'drawings', dw.id, 'versions', v.id), { groups: list }); dw.picks = new Set(); toast(msg); }
    catch (e) { alert('저장하지 못했어요: ' + (e.code || e.message)); }
  };
  const split = () => {
    const g = sel[0], parts = g.parts || [];
    const pieces = parts.map((p, i) => ({ id: i ? nextId() : g.id, ...makeGroup([{ ...p }]) }));
    save(groups.flatMap(x => x.id === g.id ? pieces : [x]), `'${g.ko}'를 ${pieces.length}개로 나눴어요`);
  };
  const merge = () => {
    if (sel.some(g => !g.parts)) { alert('예전에 올린 도면이라 합칠 수 없어요. 도면을 다시 올려주세요.'); return; }
    const first = sel.slice().sort((a, b) => a.y - b.y || a.x - b.x)[0];
    const one = { id: first.id, ...makeGroup(sel.flatMap(g => g.parts.map(p => ({ ...p })))) };
    save([...groups.filter(x => !picks.has(x.id)), one], `${sel.length}개를 '${one.ko}'로 합쳤어요`);
  };
  const g1 = sel.length === 1 ? sel[0] : null;
  return h('section', { class: 'se-sec' }, h('h4', {}, '매대명 묶음 고치기'),
    h('p', { class: 'se-help' }, '도면에서 파란 칸을 누르세요. 한 칸에 여러 매대가 들어갔으면 [나누기], 한 매대가 여러 칸으로 나뉘었으면 여러 칸을 눌러 [합치기].'),
    sel.length ? h('div', { class: 'dw-glist' }, ...sel.map(g => h('div', { class: 'dw-gi on', onclick: () => togglePick(g.id) }, h('span', { class: 'ko' }, g.ko), h('span', { class: 'en' }, '×')))) : null,
    h('div', { class: 'se-btns' },
      h('button', { class: 'btn small', disabled: !(g1 && (g1.parts?.length || 0) > 1), onclick: split }, '나누기'),
      h('button', { class: 'btn small', disabled: sel.length < 2, onclick: merge }, sel.length >= 2 ? `${sel.length}개 합치기` : '합치기'),
      sel.length ? h('button', { class: 'btn small ghost', onclick: () => { dw.picks = new Set(); renderDwStage(); renderDwSide(); } }, '고른 것 지우기') : null),
    g1 && !g1.parts ? h('div', { class: 'tr-why' }, '예전에 올린 도면이라 나눌 수 없어요. 다시 올리면 돼요.') : null);
}
$('#dw-side').addEventListener('focusout', () => setTimeout(() => renderDwSide(), 80));

// POG 헤더: 이 매장의 ★최종본 도면에서 매대를 눌러 고름
async function openHeaderPicker(pog, fx) {
  const st0 = storeForPog(pog);
  if (!st0) { modal(h('div', {}, h('h3', {}, '도면이 이어진 매장이 없어요'), h('p', {}, `처음 화면 → 매장 등록에서 매장코드 '${pog.storeCode}'인 매장을 등록하고, VMD실이 도면을 올리면 여기서 고를 수 있어요.`))); return; }
  const d = state.dwMap.get(st0.id);
  let vers = [];
  try { vers = (await getDocs(query(collection(db, 'drawings', st0.id, 'versions'), orderBy('no')))).docs.map(x => ({ id: x.id, ...x.data() })).filter(x => x.exported); } catch { }
  const v = vers.find(x => x.id === dwFinal(d)) || vers.at(-1);
  if (!v) { modal(h('div', {}, h('h3', {}, '아직 내보낸 도면이 없어요'), h('p', {}, `'${storeName(st0)}' 매장 도면을 VMD실이 올리고 내보내면 고를 수 있어요.`))); return; }
  const used = new Set([...state.fixtures.values()].filter(x => x.id !== fx.id && x.drawingRef?.vId === v.id).map(x => x.drawingRef.gid));
  const close = modal(h('div', {},
    h('h3', {}, `도면에서 매대 고르기 · ${storeName(st0)} ver.${v.no}${dwFinal(d) === v.id ? ' ★최종본' : ''}`),
    h('p', { class: 'mut' }, '매대를 누르면 헤더에 들어가요. 초록 = 다른 페이지에서 이미 고른 매대. 넣은 뒤에 뒤에 숫자(1, 2…)를 붙여도 돼요.'),
    drawingView(v, 'ko', { used, selId: fx.drawingRef?.vId === v.id ? fx.drawingRef.gid : null, onPick: g => {
      const ref = { storeId: st0.id, vId: v.id, vNo: v.no, gid: g.id, ko: g.ko };
      saveFx(pog.id, fx.id, 'headerName', g.ko); saveFx(pog.id, fx.id, 'drawingRef', ref);
      const blk = state.pageEls.get(fx.id), inp = blk?.querySelector('[data-f="headerName"]'); if (inp) inp.value = g.ko;
      fx.drawingRef = ref; fx.headerName = g.ko;
      close(); toast(`헤더에 '${g.ko}'를 넣었어요`);
    } })), { wide: true });
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
  const v = state.viewer; v.unsubPog?.(); v.unsubFx?.(); v.unsubTr?.();
  v.unsubPog = v.unsubFx = v.unsubTr = null; v.pog = null; v.fixtures = []; v.trs = {}; v.lang = v.wantLang || 'ko'; v.wantLang = null;
  vwThumbs.clear();
  $('#viewer-body')?.classList.add('hidden'); $('#viewer-empty')?.classList.remove('hidden');
  $('#v-pog-online .split')?.classList.remove('list-off');
}
function openViewer(id) {
  closeViewer();
  const v = state.viewer;
  v.pog = { id };
  $('#viewer-empty').classList.add('hidden'); $('#viewer-body').classList.remove('hidden');
  $('#v-pog-online .split').classList.add('list-off');
  $('#vw-pages').innerHTML = '<div class="mut pad">불러오는 중…</div>';
  renderOnlineList();
  v.unsubPog = onSnapshot(doc(db, 'pogs', id), d => { if (!d.exists()) { closeViewer(); return; } v.pog = { id: d.id, ...d.data() }; renderViewer(); });
  v.unsubFx = onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => { v.fixtures = s.docs.map(d => ({ id: d.id, ...d.data() })); renderViewer(); });
  // 번역본: 2.2에서 '온라인 POG에 반영'한 언어만 고를 수 있음
  v.unsubTr = onSnapshot(collection(db, 'pogs', id, 'translations'), s => {
    v.trs = Object.fromEntries(s.docs.map(d => [d.id, d.data()]).filter(([, d]) => d.out));
    const sel = $('#vw-lang');
    sel.replaceChildren(h('option', { value: 'ko' }, '한국어'), ...Object.keys(v.trs).map(l => h('option', { value: l }, l)));
    if (v.lang !== 'ko' && !v.trs[v.lang]) v.lang = 'ko';
    sel.value = v.lang;
    renderViewer();
  }, () => { });
}
$('#vw-lang').addEventListener('change', e => { state.viewer.lang = e.target.value; renderViewer(); });
function renderViewer() {
  const v = state.viewer; if (!v.pog?.status) return;
  $('#vw-title').textContent = `${v.pog.branchName || v.pog.storeName || ''} · 최종 ${fmtDate(v.pog.finalizedAt)}${v.pog.manager ? ' · ' + v.pog.manager : ''}`;
  const wrap = $('#vw-pages'); wrap.innerHTML = '';
  // 번역본이면 반영된 번역(out)으로 글자를 바꿔서 그림
  const out = v.lang !== 'ko' ? v.trs?.[v.lang]?.out : null;
  const L = out ? { ...LABELS_KO, ...(out.__labels || {}) } : LABELS_KO;
  const pogV = out ? { ...v.pog, coverTitle: out.__pog?.cover || coverTitle(v.pog), branchName: out.__pog?.store || footStore(v.pog) } : v.pog;
  const fxV = fx => applyTr(fx, out?.[fx.id]);
  const cover = buildCover(pogV, { editable: false, L }); syncCover(cover, pogV); wrap.append(cover);
  const blocks = new Map();
  const shownFx = composeFx(v.fixtures);
  shownFx.forEach(f => { const fx = fxV(f); const el = buildPage(fx, pogV, { editable: false, onItem: showItem, L }); syncPage(el, fx, pogV); wrap.append(el); blocks.set(fx.id, el); });
  vwThumbs.sync(slideEntries(cover, v.pog, shownFx, fx => blocks.get(fx.id)));
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
const norm = t => (t || '').toLowerCase().replace(/\s+/g, ''); // 띄어쓰기·대소문자 무시
const CODE_CATS = ['고리타입', '집기']; // 선반/파이프는 제품코드 필요 없음 (사용자) // 제품코드를 넣는 분류 (고리·집기 수량 엑셀에 쓰임)
const catOrder = c => { const i = CATS.indexOf(c); return i < 0 ? CATS.length : i; };
const oldCats = () => [...new Set(state.glossary.map(g => g.cat).filter(c => c && !CATS.includes(c)))];
const catLabel = c => CATS.includes(c) ? c : `${c} (예전)`;
// 한국어·영어 말고 추가된 언어들 (각 단어의 tr: { 언어이름: 번역 })
const glLangs = () => [...new Set(state.glossary.flatMap(g => Object.keys(g.tr || {})))].sort((a, b) => a.localeCompare(b));
function glSearch(q) {
  const n = norm(q);
  return state.glossary.filter(g => [g.ko, g.en, g.code, ...Object.values(g.tr || {})].some(t => norm(t).includes(n)))
    .sort((a, b) => catOrder(a.cat) - catOrder(b.cat) || (a.ko || '').localeCompare(b.ko || '', 'ko'));
}
// 편집 기록: glossaryLog에 누가 언제 무엇을 바꿨는지 남김 (화면에는 '변경 기록'·ⓘ로만 작게)
const me = () => state.user.email.toLowerCase();
const logEntry = (g, action, changes = []) => ({ gid: g.id, cat: g.cat || '', ko: g.ko || '', action, changes, by: me(), at: serverTimestamp() });
const glLog = (g, action, changes) => addDoc(collection(db, 'glossaryLog'), logEntry(g, action, changes)).catch(() => { });
const fieldLabel = f => ({ ko: '한국어', en: 'English', cat: '분류', code: '제품코드' }[f] || f.replace(/^tr\./, ''));

let glDirty = false;
function refreshGlossaryLists() {
  const dl = $('#dl-fixtureType'); dl.innerHTML = '';
  glossaryOf('매대타입').forEach(g => dl.append(h('option', { value: g.ko })));
  const dx = $('#dl-extras'); dx.innerHTML = '';
  glossaryOf('집기').forEach(g => dx.append(h('option', { value: g.ko })));
  $$('select.hook-sel').forEach(sel => fillHookSelect(sel, sel.value));
  state.pageEls?.forEach(b => { if (b._sp && !b.querySelector('.sp-list')?.contains(document.activeElement)) renderSp(b); });
}
function setGlCat(c) {
  state.glCat = c;
  if (CATS.includes(c)) $('#gl-add-cat').value = c;
  syncAddCode();
}
const syncAddCode = () => $('#gl-add').code.classList.toggle('hidden', !CODE_CATS.includes($('#gl-add-cat').value));

// 가져온 POG의 팀명을 사전 '팀명'에 자동으로 추가 (사전을 편집할 수 있는 계정에서만)
// 문서 ID를 팀명으로 정해서 여러 사람이 동시에 열어도 한 번만 생김
const teamDocId = name => 'team_' + name.replace(/[\/.#$\[\]]/g, '_');
const teamsChecked = new Set(); // 팀명 목록이 없는 예전 POG는 매대를 한 번만 읽어서 확인
let teamTimer = null, glLoaded = false;
const scheduleTeamSync = () => { clearTimeout(teamTimer); teamTimer = setTimeout(syncTeams, 1500); };
async function syncTeams() {
  if (!glLoaded || !canEdit('glossary')) return;
  const names = new Set();
  for (const p of state.pogs) {
    if (Array.isArray(p.teams)) p.teams.forEach(t => names.add(t));
    else if (!teamsChecked.has(p.id)) {
      teamsChecked.add(p.id);
      try { (await getDocs(collection(db, 'pogs', p.id, 'fixtures'))).docs.forEach(d => names.add(catName(d.data().teamName))); } catch { }
    }
  }
  const have = new Set(glossaryOf('팀명').map(g => norm(g.ko)));
  for (const name of names) {
    if (!name || have.has(norm(name))) continue;
    have.add(norm(name));
    const id = teamDocId(name);
    try {
      await setDoc(doc(db, 'glossary', id), { cat: '팀명', ko: name, auto: true, createdAt: serverTimestamp(), createdBy: me() }, { merge: true });
      glLog({ id, cat: '팀명', ko: name }, 'auto', []);
    } catch { }
  }
}
function renderGlossary() {
  const body = $('#gl-body');
  if (body.contains(document.activeElement)) { glDirty = true; return; }
  glDirty = false;
  const q = $('#gl-q').value.trim();
  $('#gl-q-clear').classList.toggle('hidden', !q);

  const tabs = $('#gl-tabs'); tabs.innerHTML = '';
  tabs.classList.toggle('dim', !!q);
  if (!CATS.includes(state.glCat) && !oldCats().includes(state.glCat)) state.glCat = CATS[0];
  [...CATS, ...oldCats()].forEach(c => tabs.append(h('button', { class: !q && c === state.glCat ? 'on' : '', onclick: () => { $('#gl-q').value = ''; setGlCat(c); renderGlossary(); } },
    `${catLabel(c)} `, h('span', { class: 'cnt' }, glossaryOf(c).length))));

  // 추가 언어 선택 칸
  const langs = glLangs(), lsel = $('#gl-lang');
  if (state.glLang && !langs.includes(state.glLang)) state.glLang = '';
  lsel.innerHTML = '';
  lsel.append(h('option', { value: '' }, langs.length ? '선택 안 함' : '(아직 없음)'), ...langs.map(l => h('option', { value: l }, l)));
  lsel.value = state.glLang;
  const lang = state.glLang;

  const rows = q ? glSearch(q) : glossaryOf(state.glCat);
  $('#gl-info').textContent = q ? `'${q}' 검색 결과 ${rows.length}개 · 전체 분류에서 찾았어요`
    : state.glCat === '팀명' ? '가져온 POG의 팀명이 자동으로 들어와요. 영어(와 다른 언어)만 채우면 돼요.'
    : !CATS.includes(state.glCat) ? `예전 분류예요. 필요한 단어는 검색해서 분류를 바꾸고, 나머지는 지워주세요.` : '';
  const showCode = q ? rows.some(g => CODE_CATS.includes(g.cat)) : CODE_CATS.includes(state.glCat);
  $('#gl-head').innerHTML = '';
  $('#gl-head').append(h('tr', {}, showCode ? h('th', { class: 'gl-code-col' }, '제품코드') : null, q ? h('th', { class: 'gl-cat-col' }, '분류') : null, h('th', {}, '한국어'), h('th', {}, 'English'), lang ? h('th', {}, lang) : null, h('th', {})));

  body.innerHTML = '';
  if (!rows.length) body.append(h('tr', {}, h('td', { colspan: 3 + (q ? 1 : 0) + (lang ? 1 : 0) + (showCode ? 1 : 0), class: 'mut pad' },
    q ? '저장된 단어가 없어요. 위 칸에서 바로 추가할 수 있어요.' : '등록된 단어가 없어요.')));
  const ed = canEdit('glossary'); // 글사부·관리자만 편집, 나머지는 보기
  rows.forEach(g => {
    const inp = (f) => {
      const el = h('input', { value: g[f] || '', disabled: !ed });
      el.addEventListener('change', async () => {
        const v = el.value.trim();
        await updateDoc(doc(db, 'glossary', g.id), { [f]: v, updatedAt: serverTimestamp(), updatedBy: me() });
        glLog(g, 'edit', [{ f, from: g[f] || '', to: v }]);
        toast('수정했어요');
      });
      return el;
    };
    const trInp = () => {
      const el = h('input', { value: g.tr?.[lang] || '', disabled: !ed });
      el.addEventListener('change', async () => {
        const v = el.value.trim();
        await updateDoc(doc(db, 'glossary', g.id), new FieldPath('tr', lang), v, 'updatedAt', serverTimestamp(), 'updatedBy', me());
        glLog(g, 'edit', [{ f: 'tr.' + lang, from: g.tr?.[lang] || '', to: v }]);
        toast('수정했어요');
      });
      return el;
    };
    let catCell = null;
    if (q) {
      const sel = h('select', { class: 'gl-cat-sel', disabled: !ed }, ...[...CATS, ...(CATS.includes(g.cat) ? [] : [g.cat])].map(c => h('option', { value: c }, catLabel(c))));
      sel.value = g.cat;
      sel.addEventListener('change', async () => {
        await updateDoc(doc(db, 'glossary', g.id), { cat: sel.value, updatedAt: serverTimestamp(), updatedBy: me() });
        glLog(g, 'edit', [{ f: 'cat', from: g.cat, to: sel.value }]);
        toast(`'${sel.value}'(으)로 옮겼어요`);
      });
      catCell = h('td', {}, sel);
    }
    const codeCell = showCode ? h('td', {}, CODE_CATS.includes(g.cat) ? inp('code') : null) : null;
    body.append(h('tr', {}, codeCell, catCell, h('td', {}, inp('ko')), h('td', {}, inp('en')), lang ? h('td', {}, trInp()) : null,
      h('td', { class: 'tc' }, ed ? h('span', {},
        h('button', { class: 'gl-i', type: 'button', title: g.updatedBy ? `마지막 수정: ${g.updatedBy} · ${fmtDate(g.updatedAt)}` : '편집 기록 보기', onclick: () => showGlLog(g) }, 'ⓘ'),
        h('button', { class: 'btn ghost danger small', onclick: async () => {
          if (!confirm(`'${g.ko}'를 삭제할까요?`)) return;
          await deleteDoc(doc(db, 'glossary', g.id));
          glLog(g, 'delete', [{ f: 'en', from: g.en || '', to: '' }]);
        } }, '삭제')) : null)));
  });
  renderGlHint();
}
// 추가하려는 한국어가 이미 있으면 알려주기
function renderGlHint() {
  const ko = $('#gl-add').ko.value.trim(), box = $('#gl-hint');
  box.innerHTML = '';
  if (!ko) return;
  const same = state.glossary.filter(g => norm(g.ko) === norm(ko));
  if (!same.length) return;
  box.append('이미 저장돼 있어요: ',
    ...same.map(g => h('span', { class: 'gl-hit' }, `[${g.cat}] ${g.ko} → ${g.en || '(영문 없음)'}`)),
    h('button', { class: 'link', type: 'button', onclick: () => { $('#gl-q').value = ko; renderGlossary(); } }, '찾아서 수정하기'));
}
$('#gl-add-cat').append(...CATS.map(c => h('option', { value: c }, c)));
$('#gl-add-cat').addEventListener('change', e => { syncAddCode(); if (!$('#gl-q').value.trim()) { state.glCat = e.target.value; renderGlossary(); } });
$('#gl-add').ko.addEventListener('input', renderGlHint);
$('#gl-q').addEventListener('input', renderGlossary);
$('#gl-q-clear').onclick = () => { $('#gl-q').value = ''; renderGlossary(); $('#gl-q').focus(); };
$('#gl-body').addEventListener('focusout', () => setTimeout(() => { if (glDirty) renderGlossary(); }, 50));
$('#gl-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, cat = f.cat.value, ko = f.ko.value.trim(), en = f.en.value.trim(), code = CODE_CATS.includes(cat) ? f.code.value.trim() : '';
  if (!ko) return;
  const same = state.glossary.filter(g => norm(g.ko) === norm(ko));
  if (same.some(g => g.cat === cat)) {
    toast(`'${cat}'에 이미 있는 단어예요. 아래에서 수정하세요`);
    $('#gl-q').value = ko; renderGlossary(); return;
  }
  if (same.length && !confirm(`'${same.map(g => g.cat).join(', ')}' 분류에 같은 단어가 있어요. '${cat}'에도 추가할까요?`)) return;
  const r = await addDoc(collection(db, 'glossary'), { cat, ko, en, ...(code ? { code } : {}), createdAt: serverTimestamp(), createdBy: me() });
  glLog({ id: r.id, cat, ko }, 'add', [{ f: 'en', from: '', to: en }]);
  toast('추가했어요');
  f.ko.value = ''; f.en.value = ''; f.code.value = ''; f.ko.focus(); renderGlHint();
});
setGlCat(state.glCat);
renderGlossary();

/* ---------- 용어 사전 변경 기록 ---------- */
const ACTION = { add: '추가', edit: '수정', delete: '삭제', import: '엑셀', auto: 'POG에서 자동' };
const fmtTime = ts => { const d = ts?.toDate?.(); return d ? `${fmtDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
async function showGlLog(g) {
  const box = h('div', { class: 'log-box' }, h('div', { class: 'mut pad' }, '불러오는 중…'));
  const q = h('input', { class: 'search w100', placeholder: '단어·편집자 이메일로 찾기' });
  modal(h('div', {}, h('h3', {}, g ? `'${g.ko}' 변경 기록` : '용어 사전 변경 기록'), g ? null : q, box), { wide: true });
  try {
    const snap = await getDocs(g ? query(collection(db, 'glossaryLog'), where('gid', '==', g.id))
      : query(collection(db, 'glossaryLog'), orderBy('at', 'desc'), limit(500)));
    const logs = snap.docs.map(d => d.data()).sort((a, b) => (b.at?.toMillis?.() || 0) - (a.at?.toMillis?.() || 0));
    const draw = () => {
      const n = norm(q.value);
      const rows = logs.filter(l => !n || [l.ko, l.by, ...(l.changes || []).map(c => c.to)].some(t => norm(t).includes(n)));
      box.innerHTML = '';
      if (!rows.length) { box.append(h('div', { class: 'mut pad' }, '기록이 없어요. (기록은 이 기능이 생긴 뒤부터 남아요)')); return; }
      box.append(h('table', { class: 'log-tbl' },
        h('tr', {}, h('th', {}, '날짜'), h('th', {}, '편집자'), h('th', {}, ''), g ? null : h('th', {}, '단어'), h('th', {}, '내용')),
        ...rows.map(l => h('tr', {},
          h('td', {}, fmtTime(l.at)), h('td', {}, l.by), h('td', {}, ACTION[l.action] || l.action),
          g ? null : h('td', {}, `[${l.cat}] ${l.ko}`),
          h('td', { class: 'log-ch' }, ...(l.changes || []).map(c => h('div', {}, `${fieldLabel(c.f)}: ${c.from || '(빈칸)'} → `, h('b', {}, c.to || '(빈칸)'))))))));
    };
    q.addEventListener('input', draw); draw();
  } catch (e) { box.innerHTML = ''; box.append(h('div', { class: 'err pad' }, '기록을 읽지 못했어요: ' + e.code)); }
}
$('#gl-log').onclick = () => showGlLog(null);

/* ---------- 용어 사전 엑셀 (내보내기 / 올리기) ---------- */
// 열: ID | 분류 | 한국어 | English | 추가 언어들… 오른쪽에 새 열을 만들면 새 언어가 됨
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
let xlsxP = null;
const loadXLSX = () => xlsxP ||= new Promise((ok, no) => {
  if (window.XLSX) return ok(window.XLSX);
  const sc = h('script', { src: XLSX_URL });
  sc.onload = () => ok(window.XLSX);
  sc.onerror = () => { xlsxP = null; no(new Error('엑셀 도구를 불러오지 못했어요. 인터넷 연결을 확인해주세요.')); };
  document.head.append(sc);
});
const GL_FIXED = { id: 'ID (지우지 마세요)', cat: '분류', code: '제품코드', ko: '한국어', en: 'English' };
const isFixedHead = t => /^id\b/i.test(t) || ['분류', '제품코드', '한국어', 'english', '영어'].includes(t.toLowerCase());

$('#gl-lang').addEventListener('change', e => { state.glLang = e.target.value; renderGlossary(); });
$('#gl-export').onclick = async () => {
  try {
    const X = await loadXLSX(), langs = glLangs();
    const rows = [...state.glossary].sort((a, b) => catOrder(a.cat) - catOrder(b.cat) || (a.ko || '').localeCompare(b.ko || '', 'ko'));
    const aoa = [[GL_FIXED.id, GL_FIXED.cat, GL_FIXED.code, GL_FIXED.ko, GL_FIXED.en, ...langs],
      ...rows.map(g => [g.id, g.cat, g.code || '', g.ko || '', g.en || '', ...langs.map(l => g.tr?.[l] || '')])];
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, ...langs.map(() => ({ wch: 24 }))];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '용어사전');
    X.writeFile(wb, `용어사전_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
  } catch (e) { toast(e.message); }
};
$('#gl-import').onclick = () => $('#gl-file').click();
$('#gl-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const X = await loadXLSX();
    const wb = X.read(await file.arrayBuffer());
    const aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    showImportPreview(planGlossaryImport(aoa));
  } catch (err) { toast('엑셀을 읽지 못했어요: ' + err.message); }
};

// 엑셀 내용을 보고 무엇을 바꿀지 계산 (빈 칸은 바꾸지 않음)
function planGlossaryImport(aoa) {
  const head = (aoa[0] || []).map(t => String(t).trim());
  const col = test => head.findIndex(test);
  const ci = {
    id: col(t => /^id\b/i.test(t)), cat: col(t => t === '분류'), ko: col(t => t === '한국어'),
    en: col(t => ['english', '영어'].includes(t.toLowerCase())), code: col(t => t === '제품코드'),
  };
  if (ci.ko < 0) throw new Error("첫 줄에 '한국어' 열이 없어요. 내보낸 엑셀 양식을 그대로 써주세요.");
  const langCols = head.map((t, i) => [t, i]).filter(([t]) => t && !isFixedHead(t));
  const known = new Set(glLangs());
  const plan = { updates: [], adds: [], warns: [], newLangs: langCols.map(([t]) => t).filter(t => !known.has(t)), langs: langCols.map(([t]) => t) };
  const byId = new Map(state.glossary.map(g => [g.id, g])), seen = new Set();
  aoa.slice(1).forEach((row, ri) => {
    const v = i => (i >= 0 ? String(row[i] ?? '').trim() : '');
    const line = ri + 2, id = v(ci.id), ko = v(ci.ko), cat = v(ci.cat), en = v(ci.en), code = v(ci.code);
    if (!id && !ko) return; // 빈 줄
    let g = id ? byId.get(id) : null;
    if (id && !g) { plan.warns.push(`${line}번째 줄: ID '${id}'인 단어가 없어요 (삭제된 단어일 수 있어요)`); return; }
    if (!g && cat && !CATS.includes(cat)) { plan.warns.push(`${line}번째 줄: 분류 '${cat}'을(를) 알 수 없어요 (${CATS.join(', ')} 중 하나)`); return; }
    if (!g) g = state.glossary.find(x => x.cat === cat && norm(x.ko) === norm(ko)); // ID가 없으면 분류+한국어로 찾기
    const tr = {};
    langCols.forEach(([l, i]) => { const t = v(i); if (t && t !== (g?.tr?.[l] || '')) tr[l] = t; });
    if (g) {
      if (seen.has(g.id)) return;
      seen.add(g.id);
      const ch = {};
      if (ko && ko !== g.ko) ch.ko = ko;
      if (en && en !== (g.en || '')) ch.en = en;
      if (code && code !== (g.code || '')) ch.code = code;
      if (cat && cat !== g.cat && CATS.includes(cat)) ch.cat = cat;
      if (Object.keys(ch).length || Object.keys(tr).length) plan.updates.push({ g, ch, tr });
    } else {
      if (!cat) { plan.warns.push(`${line}번째 줄: 새 단어 '${ko}'에 분류가 없어요`); return; }
      if (plan.adds.some(a => a.cat === cat && norm(a.ko) === norm(ko))) return;
      plan.adds.push({ cat, ko, en, tr, ...(code ? { code } : {}) });
    }
  });
  return plan;
}
function showImportPreview(plan) {
  const nothing = !plan.updates.length && !plan.adds.length;
  const go = h('button', { class: 'btn primary', disabled: nothing }, '적용하기');
  const close = modal(h('div', {},
    h('h3', {}, '엑셀 올리기 미리보기'),
    h('ul', { class: 'imp-sum' },
      plan.newLangs.length ? h('li', {}, '새 언어: ', h('b', {}, plan.newLangs.join(', '))) : null,
      h('li', {}, `바뀌는 단어: ${plan.updates.length}개`),
      h('li', {}, `새로 추가하는 단어: ${plan.adds.length}개`),
      plan.warns.length ? h('li', {}, `건너뛰는 줄: ${plan.warns.length}개`) : null),
    plan.warns.length ? h('ul', { class: 'imp-warn' }, ...plan.warns.slice(0, 50).map(w => h('li', {}, w))) : null,
    h('p', { class: 'mut' }, nothing ? '바뀌는 내용이 없어요.' : '엑셀의 빈 칸은 지금 값을 그대로 둬요 (지우지 않아요).'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '저장 중…';
    try {
      let b = writeBatch(db), n = 0;
      const flush = async () => { if (n) { await b.commit(); b = writeBatch(db); n = 0; } };
      for (const { g, ch, tr } of plan.updates) {
        const args = [...Object.entries(ch).flat(), ...Object.entries(tr).flatMap(([l, t]) => [new FieldPath('tr', l), t]), 'updatedAt', serverTimestamp(), 'updatedBy', me()];
        b.update(doc(db, 'glossary', g.id), ...args);
        b.set(doc(collection(db, 'glossaryLog')), logEntry(g, 'import', [
          ...Object.entries(ch).map(([f, to]) => ({ f, from: g[f] || '', to })),
          ...Object.entries(tr).map(([l, to]) => ({ f: 'tr.' + l, from: g.tr?.[l] || '', to }))]));
        if ((n += 2) >= 400) await flush();
      }
      for (const a of plan.adds) {
        const r = doc(collection(db, 'glossary'));
        b.set(r, { ...a, createdAt: serverTimestamp(), createdBy: me() });
        b.set(doc(collection(db, 'glossaryLog')), logEntry({ id: r.id, ...a }, 'add', [{ f: 'en', from: '', to: a.en || '' }]));
        if ((n += 2) >= 400) await flush();
      }
      await flush();
      if (plan.newLangs.length) state.glLang = plan.newLangs[0];
      close(); toast(`저장했어요 (바뀜 ${plan.updates.length} · 추가 ${plan.adds.length})`);
      renderGlossary();
    } catch (e) { toast('저장 실패: ' + e.message); go.disabled = false; go.textContent = '적용하기'; }
  };
}

/* ---------- 계정 관리 (관리자만) ---------- */
const levelSelect = v => {
  const keys = ASSIGNABLE.includes(v) ? ASSIGNABLE : [v, ...ASSIGNABLE];
  const sel = h('select', { class: 'acc-sel' }, ...keys.map(k => h('option', { value: k }, LEVELS[k])));
  sel.value = v; return sel;
};
function renderAccounts() {
  const body = $('#acc-body'); body.innerHTML = '';
  const me = state.user?.email.toLowerCase();
  const rows = [...state.roles].sort((a, b) => a.id.localeCompare(b.id));
  if (!rows.length) body.append(h('tr', {}, h('td', { colspan: 3, class: 'mut pad' }, '등록된 계정이 없어요.')));
  rows.forEach(r => {
    const sel = levelSelect(LEVELS[r.level] ? r.level : 'finder');
    sel.addEventListener('change', async () => {
      if (r.id === me && sel.value !== 'admin' && !confirm('내 계정의 관리자 권한을 내리면 계정 관리 화면에 다시 들어올 수 없어요. 계속할까요?')) { sel.value = r.level; return; }
      try { await updateDoc(doc(db, 'roles', r.id), { level: sel.value, updatedAt: serverTimestamp(), updatedBy: me }); toast('레벨을 바꿨어요'); }
      catch (e) { toast('저장 실패: ' + e.message); sel.value = r.level; }
    });
    body.append(h('tr', {},
      h('td', {}, r.id, r.id === me ? h('span', { class: 'acc-me' }, '나') : null,
        ASSIGNABLE.includes(r.level) ? null : h('span', { class: 'acc-old' }, '레벨을 다시 골라주세요')),
      h('td', {}, sel),
      h('td', { class: 'tc' }, r.id === me ? null : h('button', { class: 'btn ghost danger small', onclick: async () => {
        if (confirm(`'${r.id}'의 레벨을 지울까요? 지우면 '제품 찾기만'으로 바뀌어요.`)) await deleteDoc(doc(db, 'roles', r.id));
      } }, '삭제'))));
  });
}
$('#acc-add-level').append(...ASSIGNABLE.map(k => h('option', { value: k }, LEVELS[k])));
$('#acc-add-level').value = 'pog';
$('#acc-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, email = f.email.value.trim().toLowerCase();
  if (!email) return;
  if (state.roles.some(r => r.id === email)) { toast('이미 있는 계정이에요. 목록에서 레벨을 바꾸세요'); return; }
  try {
    await setDoc(doc(db, 'roles', email), { level: f.level.value, createdAt: serverTimestamp(), updatedBy: state.user.email.toLowerCase() });
    toast('추가했어요'); f.email.value = '';
  } catch (e) { toast('저장 실패: ' + e.message); }
});
