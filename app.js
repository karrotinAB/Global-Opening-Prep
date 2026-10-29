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
const CATS = ['카테고리', '매대타입', '고리타입', '집기', '팀명'];
// 계정 레벨. roles/{이메일} 문서가 없으면 'finder' (제품 찾기만)
const LEVELS = { admin: '관리자', pog: 'POG팀', vmd: 'VMD팀', global: '글로벌사업부', buyer: '바이어', finder: '제품 찾기만', editor: '편집 (예전 레벨)' };
const ASSIGNABLE = ['admin', 'pog', 'vmd', 'global', 'buyer', 'finder']; // editor는 예전 레벨: 그대로 동작하지만 새로 고를 수는 없음
// 레벨마다 볼 수 있는 화면(views)과 편집할 수 있는 부분(edit). 진짜 차단은 firestore.rules / storage.rules가 함
const STAFF_VIEWS = ['home', 'drawing', 'pog-home', 'pog-make', 'pog-trans', 'pog-online', 'glossary', 'finder'];
const ALL_EDIT = ['drawing', 'drawing-trans', 'pog-make', 'pog-trans', 'glossary'];
const ACCESS = {
  admin: { views: [...STAFF_VIEWS, 'accounts'], edit: ALL_EDIT },
  pog: { views: STAFF_VIEWS, edit: ['pog-make'] },
  vmd: { views: STAFF_VIEWS, edit: ['drawing'] },
  global: { views: STAFF_VIEWS, edit: ['drawing-trans', 'pog-trans', 'glossary'] },
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
  return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '';
};
// POG 원본 이름. 칸이 여러 개인 매대는 '(1/2)'처럼 몇 번째 칸인지 붙임
const origName = fx => (fx.mdName || '') + (fx.bayCount > 1 ? ` (${fx.bayNo}/${fx.bayCount})` : '');
const displayName = fx => fx.kind === 'free' ? (fx.headerName || '추가 페이지') : (fx.headerName || origName(fx));
const glossaryOf = cat => state.glossary.filter(g => g.cat === cat).sort((a, b) => (a.ko || '').localeCompare(b.ko || '', 'ko'));

const state = {
  user: null, level: null, view: 'home', roles: [], glLang: '',
  pogs: [], managers: [], glossary: [], glCat: CATS[0],
  currentPog: null, fixtures: new Map(), pageEls: new Map(), lockKey: null, unsubPog: null, unsubFx: null,
  viewer: { unsubPog: null, unsubFx: null, pog: null, fixtures: [] },
};

let edThumbs, vwThumbs; // 아래 썸네일 함수가 정의된 뒤 만들어짐

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
    renderPogList(); renderOnlineList(); scheduleTeamSync();
  }, e => toast('POG 목록을 읽지 못했어요: ' + e.code)));
  if (state.level === 'admin') unsubs.push(onSnapshot(collection(db, 'roles'), s => {
    state.roles = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAccounts();
  }));
  if (!isStaff()) return; // 바이어·매장 계정: 사전·담당자는 필요 없음
  unsubs.push(onSnapshot(query(collection(db, 'managers'), orderBy('name')), s => {
    state.managers = s.docs.map(d => ({ id: d.id, ...d.data() }));
    refreshManagerSelect();
  }));
  unsubs.push(onSnapshot(collection(db, 'glossary'), s => {
    state.glossary = s.docs.map(d => ({ id: d.id, ...d.data() }));
    glLoaded = true;
    refreshGlossaryLists(); renderGlossary(); scheduleTeamSync();
  }));
}
function stopListeners() { unsubs.forEach(u => u()); unsubs = []; closePog(); closeViewer(); }

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
  const items = fx.items || [], props = fx.props || [], panels = fx.panels || [];
  const wrap = h('div', { class: 'cv', style: `width:${W}px;height:${H}px` });
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
  // 매대 뒤 회색 바탕: 선반·파이프·배경판의 가로 범위 × 전체 높이
  const frame = [...props, ...panels.filter(p => p.w >= 40)];
  if (frame.length) {
    const fx0 = Math.min(...frame.map(o => o.x)), fx1 = Math.max(...frame.map(o => o.x + o.w));
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
function buildCover(pog, { editable }) {
  const title = h('input', { class: 'f cover-title' });
  if (!editable) title.disabled = true;
  else title.addEventListener('input', () => savePog(pog.id, 'coverTitle', title.value));
  const page = h('div', { class: 'page cover' },
    h('div', { class: 'ph' }),
    h('div', { class: 'cover-gap' }),
    h('div', { class: 'cover-body' }, title, h('div', { class: 'cover-pog' }, 'POG')),
    h('div', { class: 'pf1' }, 'POG 담당자 ', h('span', { class: 'pf-mgr' })),
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
      if (on && !t.classList.contains('on')) t.scrollIntoView({ block: 'nearest' });
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
const slideEntries = (cover, pog, fixtures, blockOf) => [
  { id: '__cover', block: cover, name: coverTitle(pog) || '표지' },
  ...fixtures.map(fx => ({ id: fx.id, block: blockOf(fx), name: displayName(fx), fx })),
];
edThumbs = makeThumbs($('#ed-thumbs'), $('#ed-pages'), id => { state.edActive = id; renderSidePanel(); });
vwThumbs = makeThumbs($('#vw-thumbs'), $('#vw-pages'));
$$('.list-toggle').forEach(b => b.onclick = () => b.closest('.split').classList.toggle('list-off'));

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

  if (fx.kind === 'free') return buildFreePage(fx, pog, { editable, field });
  const page = h('div', { class: 'page' },
    h('div', { class: 'ph' },
      field('headerName', h('input', { class: 'ph-name', placeholder: origName(fx) || '매대명' })),
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

  return finishBlock(fx, pog, page, editable);
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
function buildFreePage(fx, pog, { editable, field }) {
  const page = h('div', { class: 'page free' },
    h('div', { class: 'ph' }, field('headerName', h('input', { class: 'ph-name', placeholder: '제목 (예: 3단 각고리 참고사진)' }))),
    h('div', { class: 'pb free-body' }),
    h('div', { class: 'pf1' }, 'POG 담당자 ', h('span', { class: 'pf-mgr' })),
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
    else if (n.t === 'text') el = h('div', { class: 'nt nt-text', style: st + `background:${n.bg || 'transparent'};color:${n.color || '#222'};font-size:${n.fs || 14}px;border:${n.border ? '2px solid ' + n.border : '0'}` }, n.text || '');
    else if (n.t === 'img') el = h('div', { class: 'nt nt-img', style: st }, h('img', { src: n.url, alt: '', draggable: 'false' }));
    else continue;
    el.dataset.id = n.id;
    if (sel) el.classList.add('sel');
    if (ed) {
      el.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'move'));
      if (n.t === 'text') el.addEventListener('dblclick', () => block._bar?.querySelector('.nb-text')?.focus());
      if (sel) { const hd = h('div', { class: 'nh nh-se' }); hd.addEventListener('pointerdown', e => startNoteDrag(e, block, n, 'size')); el.append(hd); }
    }
    layer.append(el);
  }
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
    else if (mode === 'size') {
      n.w = Math.max(16, Math.round(o.w + dx));
      n.h = n.t === 'img' && ev.shiftKey === false ? Math.max(16, Math.round(n.w * o.h / o.w)) : Math.max(16, Math.round(o.h + dy)); // 사진은 비율 유지
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
      n.text = ta.value; renderNotes(block);
      const el = block.querySelector(`.nt-text[data-id="${n.id}"]`); // 글이 넘치면 상자를 아래로 늘림
      if (el && el.scrollHeight > el.clientHeight + 1) { n.h = el.scrollHeight + 4; renderNotes(block); }
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
  const typing = !!block._bar && block._bar.querySelector('.nb-text') === document.activeElement;
  if (!block._dragging && !typing && !pendingKey(`${fx.id}|notes`) && JSON.stringify(fx.notes || []) !== JSON.stringify(block._notes)) {
    block._notes = structuredClone(fx.notes || []);
    if (!block._notes.some(n => n.id === block._sel)) block._sel = null;
    renderNotes(block); renderNoteBar(block);
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
  const br = $('#ed-branch'); if (br !== document.activeElement) br.value = p.branchName || '';
  refreshManagerSelect();
  const final = p.status === 'final';
  const editable = !final && canEdit('pog-make'); // POG팀·관리자만 편집, 나머지는 보기
  state.edEditable = editable;
  $('#ed-status').textContent = final ? '최종' : canEdit('pog-make') ? '작성 중' : '작성 중 · 보기 전용';
  $('#ed-status').className = 'badge ' + (final ? 'final' : canEdit('pog-make') ? 'draft' : 'ro');
  $('#ed-final').textContent = final ? '잠금 해제 (다시 수정)' : '최종 POG 내보내기';
  $('#ed-final').classList.toggle('primary', !final);
  br.disabled = !editable; $('#ed-manager').disabled = !editable;
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
  for (const [id, el] of state.pageEls) if (!state.fixtures.has(id)) { el.remove(); state.pageEls.delete(id); }
  const order = [...state.fixtures.values()].sort((a, b) => a.order - b.order);
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
    const selIt = block._selItem && (fx.items || []).find(it => String(it.id) === block._selItem);
    if (ed && selIt) nodes.push(sec('선택한 제품', h('div', { class: 'se-item' }, selIt.img ? h('img', { src: selIt.img, alt: '', referrerpolicy: 'no-referrer' }) : null,
      h('div', {}, h('b', {}, selIt.name), h('div', { class: 'mut' }, selIt.code))),
      h('div', { class: 'se-btns' }, btn('맨 앞으로', () => moveItemZ(pog.id, fx, selIt.id, 1)), btn('맨 뒤로', () => moveItemZ(pog.id, fx, selIt.id, -1)),
        btn('선택 해제', () => selectItem(block, null), 'ghost')),
      h('p', { class: 'se-help' }, '겹친 제품 중 어느 것이 앞에 보일지만 바꿔요. 위치는 그대로예요.')));
    if (ed && block._bar) nodes.push(sec('메모 넣기', block._bar));
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

$('#ed-branch').addEventListener('input', e => {
  const p = state.currentPog; if (!p) return;
  p.branchName = e.target.value; savePog(p.id, 'branchName', e.target.value);
  state.pageEls.forEach(el => $('.pf-branch', el).textContent = footStore(p));
  if (state.coverEl) syncCover(state.coverEl, p);
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
  const noName = [...state.fixtures.values()].filter(f => f.kind !== 'free' && !f.headerName).length;
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
      shelfPipe: autoShelfPipe(sh, pi),
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
    if (!o.shelfPipe || o.shelfPipe === autoShelfPipe(o.shelfCount, o.pipeCount)) patch.shelfPipe = pg.shelfPipe; // 손댄 값은 그대로
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
}
function renderViewer() {
  const v = state.viewer; if (!v.pog?.status) return;
  $('#vw-title').textContent = `${v.pog.branchName || v.pog.storeName || ''} · 최종 ${fmtDate(v.pog.finalizedAt)}${v.pog.manager ? ' · ' + v.pog.manager : ''}`;
  const wrap = $('#vw-pages'); wrap.innerHTML = '';
  const cover = buildCover(v.pog, { editable: false }); syncCover(cover, v.pog); wrap.append(cover);
  const blocks = new Map();
  v.fixtures.forEach(fx => { const el = buildPage(fx, v.pog, { editable: false, onItem: showItem }); syncPage(el, fx, v.pog); wrap.append(el); blocks.set(fx.id, el); });
  vwThumbs.sync(slideEntries(cover, v.pog, v.fixtures, fx => blocks.get(fx.id)));
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
const catOrder = c => { const i = CATS.indexOf(c); return i < 0 ? CATS.length : i; };
const oldCats = () => [...new Set(state.glossary.map(g => g.cat).filter(c => c && !CATS.includes(c)))];
const catLabel = c => CATS.includes(c) ? c : `${c} (예전)`;
// 한국어·영어 말고 추가된 언어들 (각 단어의 tr: { 언어이름: 번역 })
const glLangs = () => [...new Set(state.glossary.flatMap(g => Object.keys(g.tr || {})))].sort((a, b) => a.localeCompare(b));
function glSearch(q) {
  const n = norm(q);
  return state.glossary.filter(g => [g.ko, g.en, ...Object.values(g.tr || {})].some(t => norm(t).includes(n)))
    .sort((a, b) => catOrder(a.cat) - catOrder(b.cat) || (a.ko || '').localeCompare(b.ko || '', 'ko'));
}
// 편집 기록: glossaryLog에 누가 언제 무엇을 바꿨는지 남김 (화면에는 '변경 기록'·ⓘ로만 작게)
const me = () => state.user.email.toLowerCase();
const logEntry = (g, action, changes = []) => ({ gid: g.id, cat: g.cat || '', ko: g.ko || '', action, changes, by: me(), at: serverTimestamp() });
const glLog = (g, action, changes) => addDoc(collection(db, 'glossaryLog'), logEntry(g, action, changes)).catch(() => { });
const fieldLabel = f => ({ ko: '한국어', en: 'English', cat: '분류' }[f] || f.replace(/^tr\./, ''));

let glDirty = false;
function refreshGlossaryLists() {
  const dl = $('#dl-fixtureType'); dl.innerHTML = '';
  glossaryOf('매대타입').forEach(g => dl.append(h('option', { value: g.ko })));
  $$('select.hook-sel').forEach(sel => fillHookSelect(sel, sel.value));
}
function setGlCat(c) {
  state.glCat = c;
  if (CATS.includes(c)) $('#gl-add-cat').value = c;
}

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
  $('#gl-head').innerHTML = '';
  $('#gl-head').append(h('tr', {}, q ? h('th', { class: 'gl-cat-col' }, '분류') : null, h('th', {}, '한국어'), h('th', {}, 'English'), lang ? h('th', {}, lang) : null, h('th', {})));

  body.innerHTML = '';
  if (!rows.length) body.append(h('tr', {}, h('td', { colspan: 3 + (q ? 1 : 0) + (lang ? 1 : 0), class: 'mut pad' },
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
    body.append(h('tr', {}, catCell, h('td', {}, inp('ko')), h('td', {}, inp('en')), lang ? h('td', {}, trInp()) : null,
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
$('#gl-add-cat').addEventListener('change', e => { if (!$('#gl-q').value.trim()) { state.glCat = e.target.value; renderGlossary(); } });
$('#gl-add').ko.addEventListener('input', renderGlHint);
$('#gl-q').addEventListener('input', renderGlossary);
$('#gl-q-clear').onclick = () => { $('#gl-q').value = ''; renderGlossary(); $('#gl-q').focus(); };
$('#gl-body').addEventListener('focusout', () => setTimeout(() => { if (glDirty) renderGlossary(); }, 50));
$('#gl-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, cat = f.cat.value, ko = f.ko.value.trim(), en = f.en.value.trim();
  if (!ko) return;
  const same = state.glossary.filter(g => norm(g.ko) === norm(ko));
  if (same.some(g => g.cat === cat)) {
    toast(`'${cat}'에 이미 있는 단어예요. 아래에서 수정하세요`);
    $('#gl-q').value = ko; renderGlossary(); return;
  }
  if (same.length && !confirm(`'${same.map(g => g.cat).join(', ')}' 분류에 같은 단어가 있어요. '${cat}'에도 추가할까요?`)) return;
  const r = await addDoc(collection(db, 'glossary'), { cat, ko, en, createdAt: serverTimestamp(), createdBy: me() });
  glLog({ id: r.id, cat, ko }, 'add', [{ f: 'en', from: '', to: en }]);
  toast('추가했어요');
  f.ko.value = ''; f.en.value = ''; f.ko.focus(); renderGlHint();
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
const GL_FIXED = { id: 'ID (지우지 마세요)', cat: '분류', ko: '한국어', en: 'English' };
const isFixedHead = t => /^id\b/i.test(t) || ['분류', '한국어', 'english', '영어'].includes(t.toLowerCase());

$('#gl-lang').addEventListener('change', e => { state.glLang = e.target.value; renderGlossary(); });
$('#gl-export').onclick = async () => {
  try {
    const X = await loadXLSX(), langs = glLangs();
    const rows = [...state.glossary].sort((a, b) => catOrder(a.cat) - catOrder(b.cat) || (a.ko || '').localeCompare(b.ko || '', 'ko'));
    const aoa = [[GL_FIXED.id, GL_FIXED.cat, GL_FIXED.ko, GL_FIXED.en, ...langs],
      ...rows.map(g => [g.id, g.cat, g.ko || '', g.en || '', ...langs.map(l => g.tr?.[l] || '')])];
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 24 }, { wch: 24 }, ...langs.map(() => ({ wch: 24 }))];
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
    en: col(t => ['english', '영어'].includes(t.toLowerCase())),
  };
  if (ci.ko < 0) throw new Error("첫 줄에 '한국어' 열이 없어요. 내보낸 엑셀 양식을 그대로 써주세요.");
  const langCols = head.map((t, i) => [t, i]).filter(([t]) => t && !isFixedHead(t));
  const known = new Set(glLangs());
  const plan = { updates: [], adds: [], warns: [], newLangs: langCols.map(([t]) => t).filter(t => !known.has(t)), langs: langCols.map(([t]) => t) };
  const byId = new Map(state.glossary.map(g => [g.id, g])), seen = new Set();
  aoa.slice(1).forEach((row, ri) => {
    const v = i => (i >= 0 ? String(row[i] ?? '').trim() : '');
    const line = ri + 2, id = v(ci.id), ko = v(ci.ko), cat = v(ci.cat), en = v(ci.en);
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
      if (cat && cat !== g.cat && CATS.includes(cat)) ch.cat = cat;
      if (Object.keys(ch).length || Object.keys(tr).length) plan.updates.push({ g, ch, tr });
    } else {
      if (!cat) { plan.warns.push(`${line}번째 줄: 새 단어 '${ko}'에 분류가 없어요`); return; }
      if (plan.adds.some(a => a.cat === cat && norm(a.ko) === norm(ko))) return;
      plan.adds.push({ cat, ko, en, tr });
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
