import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword,
  sendPasswordResetEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, where, limit,
  writeBatch, serverTimestamp, arrayUnion, arrayRemove, deleteField, getDocs, getDoc, getCountFromServer, startAfter, FieldPath
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
const LEVELS = { admin: '관리자', pog: 'POG팀', vmd: 'VMD팀', global: '글로벌사업부', buyer: '바이어', finder: '제품 찾기만', editor: '편집 (예전 레벨)', none: '권한 없음', blocked: '접속 막힘' };
const ASSIGNABLE = ['admin', 'pog', 'vmd', 'global', 'buyer', 'finder']; // editor는 예전 레벨: 그대로 동작하지만 새로 고를 수는 없음
// 레벨마다 볼 수 있는 화면(views)과 편집할 수 있는 부분(edit). 진짜 차단은 firestore.rules / storage.rules가 함
const STAFF_VIEWS = ['home', 'stores', 'barcodes', 'drawing', 'dw-up', 'dw-tr', 'dw-online', 'pog-home', 'pog-make', 'pog-trans', 'pog-online', 'glossary', 'finder'];
const ALL_EDIT = ['calc', 'stores', 'barcodes', 'drawing', 'drawing-trans', 'pog-make', 'pog-trans', 'glossary'];
const ACCESS = {
  admin: { views: [...STAFF_VIEWS, 'accounts'], edit: ALL_EDIT },
  pog: { views: STAFF_VIEWS, edit: ['pog-make'] },
  vmd: { views: STAFF_VIEWS, edit: ['drawing'] },
  global: { views: STAFF_VIEWS, edit: ['calc', 'stores', 'barcodes', 'drawing-trans', 'pog-trans', 'glossary'] },
  buyer: { views: ['home', 'drawing', 'dw-online', 'pog-home', 'pog-online', 'finder'], edit: [] }, // 최종본만 (규칙에서도 막음)
  finder: { views: ['finder'], edit: [] },
  editor: { views: STAFF_VIEWS, edit: ALL_EDIT },
  none: { views: [], edit: [] },    // 관리자가 만들지 않은(레벨 문서가 없는) 계정: 아무것도 못 봄
  blocked: { views: [], edit: [] }, // 관리자가 접속을 막은 계정
};
const access = () => ACCESS[state.level] || ACCESS.none;
// 바이어 계정: roles 문서의 prefix(매장코드 앞 4자리)와 같은 매장의 최종 POG·도면만 봄. pogs·drawings 문서에 storePrefix를 같이 저장
const codePrefix = code => String(code ?? '').trim().slice(0, 4);
const canSee = v => access().views.includes(v);
const canEdit = area => access().edit.includes(area);
const isStaff = () => canSee('glossary'); // 내부 직원 (초안 POG·용어 사전을 볼 수 있음)
function applyAccess() {
  $$('[data-view], [data-go]').forEach(el => el.classList.toggle('hidden', !canSee(el.dataset.view || el.dataset.go)));
  $$('[data-edit]').forEach(el => el.classList.toggle('hidden', !canEdit(el.dataset.edit)));
  $('#subnav').classList.toggle('hidden', !canSee('pog-make'));
  $('#subnav-dw').classList.toggle('hidden', !canSee('dw-up'));
  $$('[data-staff]').forEach(el => el.classList.toggle('hidden', !isStaff()));
  $$('[data-admin]').forEach(el => el.classList.toggle('hidden', state.level !== 'admin')); // 관리자만 보이는 버튼
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
function toast(msg, action) { // action = [버튼 글자, 누르면 할 일] (예: 되돌리기)
  const t = $('#toast'); t.replaceChildren(msg);
  if (action) t.append(h('button', { class: 'toast-act', onclick: () => { t.classList.remove('on'); action[1](); } }, action[0]));
  t.classList.add('on'); t.classList.toggle('act', !!action);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), action ? 7000 : 2600);
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
      if (!d.exists()) console.warn(`roles/${user.email.toLowerCase()} 문서가 없어서 아무 화면도 열지 않아요 (계정 관리에서 레벨을 받아야 해요)`);
      else if (!LEVELS[lv]) console.warn(`roles/${user.email.toLowerCase()}의 level 값 '${lv}'을 알 수 없어요`);
      const pf = String(d.data()?.prefix || '').trim();
      if (pf !== state.prefix) { state.prefix = pf; if (state.level === 'buyer') { stopListeners(); startListeners(); } }
      setLevel(LEVELS[lv] && d.exists() ? lv : 'none');
    },
    e => {
      setLevel('none');
      alert(`계정 레벨을 읽지 못했어요.\n(${e.code || e.message})\n\nFirebase 콘솔 → Firestore Database → 규칙 탭에 firestore.rules 내용이 게시돼 있는지 확인해주세요.`);
    });
});
function setLevel(lv) {
  if (lv === state.level) return;
  state.level = lv;
  document.body.dataset.level = lv || '';
  $('#me-level').textContent = lv ? LEVELS[lv] : '';
  if (!lv) return;
  applyAccess();
  stopListeners(); if (access().views.length) startListeners();
  $('#na-msg').textContent = lv === 'blocked' ? '관리자가 이 계정의 접속을 막았어요. 다시 쓰려면 관리자에게 말해주세요.' : '아직 사용 권한이 없는 계정이에요. 관리자에게 계정 관리에서 레벨을 받아주세요.';
  go(state.view);
}
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('#login-err').textContent = '';
  try { await signInWithEmailAndPassword(auth, $('#login-email').value.trim(), $('#login-pw').value); }
  catch { $('#login-err').textContent = '로그인 실패: 이메일 또는 비밀번호를 확인해주세요.'; }
});
$('#logout').onclick = () => signOut(auth);
auth.languageCode = 'ko'; // 비밀번호 재설정 메일을 한국어로
$('#login-forgot').onclick = async e => {
  e.preventDefault();
  const email = (prompt('가입한 이메일을 넣어주세요. 비밀번호를 바꾸는 메일을 보내드려요.', $('#login-email').value.trim()) || '').trim();
  if (!email) return;
  try { await sendPasswordResetEmail(auth, email); alert(`${email}(으)로 비밀번호 재설정 메일을 보냈어요.\n메일의 링크를 눌러 새 비밀번호를 정해주세요. (안 보이면 스팸함도 확인해주세요)`); }
  catch (err) { alert(err.code === 'auth/invalid-email' ? '이메일 형식이 맞지 않아요.' : '메일을 보내지 못했어요: ' + (err.code || err.message)); }
};
// 내 비밀번호 바꾸기 (지금 비밀번호 확인 → 새 비밀번호)
$('#btn-pw').onclick = () => {
  const cur = h('input', { type: 'password', placeholder: '지금 비밀번호', autocomplete: 'current-password' });
  const n1 = h('input', { type: 'password', placeholder: '새 비밀번호 (6자 이상)', autocomplete: 'new-password' });
  const n2 = h('input', { type: 'password', placeholder: '새 비밀번호 한 번 더', autocomplete: 'new-password' });
  const err = h('div', { class: 'err' }), go_ = h('button', { class: 'btn primary', type: 'submit' }, '바꾸기');
  const form = h('form', { class: 'pw-form' }, h('h3', {}, '비밀번호 바꾸기'), cur, n1, n2, err, h('div', { class: 'modal-act' }, go_));
  const close = modal(form);
  form.onsubmit = async ev => {
    ev.preventDefault(); err.textContent = '';
    if (n1.value.length < 6) { err.textContent = '새 비밀번호는 6자 이상이에요.'; return; }
    if (n1.value !== n2.value) { err.textContent = '새 비밀번호 두 칸이 달라요.'; return; }
    go_.disabled = true;
    try {
      const u = auth.currentUser || state.user;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur.value));
      await updatePassword(u, n1.value);
      close(); toast('비밀번호를 바꿨어요');
    } catch (e2) { err.textContent = /wrong-password|invalid-credential/.test(e2.code || '') ? '지금 비밀번호가 맞지 않아요.' : '바꾸지 못했어요: ' + (e2.code || e2.message); go_.disabled = false; }
  };
  cur.focus();
};

/* ---------- 실시간 구독 ---------- */
let unsubs = [];
function startListeners() {
  stopListeners();
  // 바이어·매장 계정은 최종 POG만 읽을 수 있음 (규칙도 같음). 정렬은 여기서 (색인 없이)
  const buyer = state.level === 'buyer';
  const pq = isStaff() ? query(collection(db, 'pogs'), orderBy('createdAt', 'desc'))
    : buyer ? query(collection(db, 'pogs'), where('status', '==', 'final'), where('storePrefix', '==', state.prefix || '#'))
    : query(collection(db, 'pogs'), where('status', '==', 'final'));
  if (buyer && !state.prefix) toast('이 바이어 계정에 매장코드 4자리가 없어서 볼 수 있는 매장이 없어요. 관리자에게 알려주세요.');
  if (!isStaff()) unsubs.push(onSnapshot(buyer ? query(collection(db, 'drawings'), where('status', '==', 'final'), where('storePrefix', '==', state.prefix || '#')) : query(collection(db, 'drawings'), where('status', '==', 'final')), s => {
    state.dwMap = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderDwList(); renderFdStores();
  }, e => toast('도면 목록을 읽지 못했어요: ' + e.code)));
  unsubs.push(onSnapshot(pq, s => {
    state.pogs = s.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderPogList(); renderOnlineList(); renderTrList(); scheduleTeamSync(); fillPrefixes(); renderFdStores();
  }, e => toast('POG 목록을 읽지 못했어요: ' + e.code)));
  if (state.level === 'admin') unsubs.push(onSnapshot(collection(db, 'roles'), s => {
    state.roles = s.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAccounts();
  }));
  if (!isStaff()) return; // 바이어·매장 계정: 사전·담당자는 필요 없음
  unsubs.push(onSnapshot(collection(db, 'stores'), s => {
    state.stores = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    renderStores(); renderDwList(); if (tr.pog) subTrDw(); fillPrefixes();
  }, e => toast('매장 목록을 읽지 못했어요: ' + e.code)));
  unsubs.push(onSnapshot(collection(db, 'drawings'), s => {
    state.dwMap = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    renderStores(); renderDwList(); fillPrefixes(); renderFdStores();
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
const secOf = v => v.startsWith('dw-') ? 'dw' : v; // 도면 업로드·번역·온라인 도면은 같은 화면(#v-dw)
function go(v) {
  if (!$('#v-' + secOf(v))) v = 'home';
  if (!canSee(v)) v = canSee('home') ? 'home' : canSee('finder') ? 'finder' : 'noaccess';
  state.view = v;
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v || (!!b.dataset.group && v.startsWith(b.dataset.group))));
  $('#subnav').classList.toggle('on', v.startsWith('pog-') && v !== 'pog-home');
  $('#subnav-dw').classList.toggle('on', v.startsWith('dw-'));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + secOf(v)));
  if (v.startsWith('dw-')) setDwMode({ 'dw-up': 'up', 'dw-tr': 'tr', 'dw-online': 'on' }[v]);
  window.scrollTo(0, 0);
  if (v === 'finder') { if (!fd.langSet && state.level === 'buyer') fd.lang = 'English'; fdStep(1); renderFdStores(); } // 제품 찾기는 늘 매장 고르기부터 (바이어는 영어부터)
  if (v === 'barcodes') { bcCount(); bcList(true); } else bcReport([], '', 0); // 건너뛴 줄 알림은 이 화면을 나가면 사라짐
}
$$('#nav button').forEach(b => b.onclick = () => go(b.dataset.view));
$$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
$('#btn-accounts').onclick = () => go('accounts');

/* ---------- 저장 (디바운스) ---------- */
const timers = {}; let pending = 0;
function setSaving() {
  for (const el of [$('#ed-saving'), $('#tr-saving'), $('#dw-saving')]) if (el) el.textContent = pending > 0 ? '저장 중…' : '저장됨';
}
const queued = {}; // 기다리는 저장 (되돌리기 전에 먼저 저장해 둠)
function queueWrite(key, fn) {
  if (!timers[key]) { pending++; setSaving(); }
  clearTimeout(timers[key]);
  queued[key] = fn;
  timers[key] = setTimeout(() => runQueued(key), 500);
}
async function runQueued(key) {
  const fn = queued[key]; clearTimeout(timers[key]); delete timers[key]; delete queued[key];
  if (!fn) return;
  try { await fn(); } catch (e) { toast('저장 실패: ' + e.message); }
  pending--; setSaving();
}
const flushWrites = () => Promise.all(Object.keys(queued).map(runQueued));
const pendingKey = key => !!timers[key];
// gk = 되돌리기 묶음 이름 (여러 칸을 한 번에 바꿀 때 같은 이름이면 한 번에 되돌림)
const saveFx = (pogId, fxId, f, v, gk) => { track(pogId, fxId, [f], gk || `${fxId}|${f}`); queueWrite(`${fxId}|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId, 'fixtures', fxId), { [f]: v, updatedAt: serverTimestamp(), updatedBy: state.user.email })); };
const savePog = (pogId, f, v) => { track(pogId, '__pog', [f], `__pog|${f}`); queueWrite(`${pogId}|${f}`, () =>
  updateDoc(doc(db, 'pogs', pogId), { [f]: v, updatedAt: serverTimestamp() })); };

/* ---------- 되돌리기 (POG 만들기: Ctrl+Z 되돌리기, Ctrl+Y 다시 하기, 툴바 ↶ ↷) ----------
   바꾸기 직전 값(state.fxRaw = 서버에서 받은 그대로)을 한 단계씩 기억. 같은 칸을 1.5초 안에 계속 고치면 한 단계.
   what = 바꾼 칸 이름들 | '*'(페이지 삭제: 문서 통째로) | 'new'(새로 만든 페이지). 되돌릴 때는 그 칸만 예전 값으로 씀 */
const undo = { steps: [], redo: [], pogId: null };
let undoBusy = false;
function track(pogId, docKey, what, gk) {
  if (undoBusy || !state.edEditable || state.currentPog?.id !== pogId) return;
  if (undo.pogId !== pogId) { undo.steps = []; undo.redo = []; undo.pogId = pogId; }
  const now = Date.now();
  let st = undo.steps.at(-1);
  if (!st || !gk || st.key !== gk || now - st.t > 1500) {
    st = { key: gk || now + Math.random(), t: now, ops: new Map() };
    undo.steps.push(st); if (undo.steps.length > 100) undo.steps.shift();
  }
  st.t = now; undo.redo = [];
  const raw = docKey === '__pog' ? state.pogRaw : state.fxRaw.get(docKey);
  let op = st.ops.get(docKey);
  if (!op) { op = what === 'new' ? { whole: true, before: null } : what === '*' ? { whole: true, before: raw || null } : { whole: false, before: {}, fields: new Set() }; st.ops.set(docKey, op); }
  if (!op.whole) for (const f of what) if (!op.fields.has(f)) { op.fields.add(f); op.before[f] = raw && f in raw ? structuredClone(raw[f]) : undefined; }
  updateUndoBtns();
}
const undoGroup = () => 'g' + Date.now() + Math.random();
async function applyStep(st) { // 이 단계 전 상태로 되돌리고, 반대로 갈 단계(지금 상태)를 돌려줌
  const pogId = undo.pogId, rev = { key: undoGroup(), t: 0, ops: new Map() }, b = writeBatch(db);
  for (const [k, op] of st.ops) {
    const ref = k === '__pog' ? doc(db, 'pogs', pogId) : doc(db, 'pogs', pogId, 'fixtures', k);
    const cur = k === '__pog' ? state.pogRaw : state.fxRaw.get(k);
    if (op.whole) {
      rev.ops.set(k, { whole: true, before: cur || null });
      if (op.before) b.set(ref, op.before); else if (cur) b.delete(ref);
    } else {
      const patch = {}, rb = {};
      for (const f of op.fields) { rb[f] = cur && f in cur ? structuredClone(cur[f]) : undefined; patch[f] = op.before[f] === undefined ? deleteField() : op.before[f]; }
      rev.ops.set(k, { whole: false, before: rb, fields: new Set(op.fields) });
      if (cur) b.update(ref, patch);
    }
  }
  await b.commit();
  return rev;
}
async function doUndo(redo = false) {
  if (undoBusy || !state.edEditable || undo.pogId !== state.currentPog?.id) return;
  const from = redo ? undo.redo : undo.steps, to = redo ? undo.steps : undo.redo;
  undoBusy = true;
  try {
    await flushWrites(); // 아직 안 보낸 저장을 먼저 보내고
    const st = from.pop();
    if (!st) { toast(redo ? '다시 할 것이 없어요' : '되돌릴 것이 없어요'); return; }
    to.push(await applyStep(st));
    toast(redo ? '다시 했어요 (Ctrl+Y)' : '되돌렸어요 (Ctrl+Z)');
  } catch (e) { alert('되돌리지 못했어요: ' + (e.code || e.message)); }
  finally { undoBusy = false; updateUndoBtns(); }
}
function updateUndoBtns() {
  const ok = undo.pogId === state.currentPog?.id && state.edEditable;
  const u = $('#ed-undo'), r = $('#ed-redo'); if (!u) return;
  u.disabled = !ok || !undo.steps.length; r.disabled = !ok || !undo.redo.length;
}
$('#ed-undo').onclick = () => doUndo(false);
$('#ed-redo').onclick = () => doUndo(true);
const clearUndo = () => { undo.steps = []; undo.redo = []; undo.pogId = state.currentPog?.id || null; updateUndoBtns(); };
document.addEventListener('keydown', e => {
  if (state.view !== 'pog-make' || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
  const a = document.activeElement;
  if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return; // 글 쓰는 중이면 그 칸의 되돌리기
  if ($('#modal-root')?.children.length) return;
  e.preventDefault();
  doUndo(k === 'y' || e.shiftKey);
});

/* ---------- 매대 그리기 ---------- */
// 겹친 제품의 앞뒤: POG 사이트 값(it.z), POG 만들기에서 '맨 앞으로/맨 뒤로' 한 값(fx.itemZ)이 우선
const itemZ = (fx, it) => 1000 + (fx.itemZ?.[it.id] ?? it.z ?? 0);
function applyItemZ(block, fx) {
  const byId = new Map((fx.items || []).map(it => [String(it.id), it]));
  block.querySelectorAll('.page .cv-item').forEach(el => { const it = byId.get(el.dataset.id); if (it) el.style.zIndex = itemZ(fx, it); });
}
/* 제품 사진 (img.artbox.kr): 가끔 늦거나 실패함 → 자동으로 다시 불러오기 (조금 기다렸다가 2번, 그다음 referrer를 바꿔서 1번).
   그래도 안 되면 깨진 아이콘 대신 제품명 글자 (PDF에도 글자로 나옴) */
function prodImg(src, name = '', { lazy = false, fallback = true } = {}) {
  const img = h('img', { src, alt: '', referrerpolicy: 'no-referrer', loading: lazy ? 'lazy' : null });
  img.dataset.src0 = src; img.dataset.name = name; img.dataset.fb = fallback ? '1' : '';
  img.addEventListener('error', () => imgRetry(img));
  return img;
}
function imgRetry(img) {
  const n = +(img.dataset.try || 0), src = img.dataset.src0;
  img.dataset.try = n + 1;
  if (n < 2) { setTimeout(() => { img.src = src + (src.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 700 * (n + 1)); return; }
  if (n === 2) { img.referrerPolicy = 'strict-origin-when-cross-origin'; img.src = src; return; }
  img.dataset.failed = '1';
  if (img.dataset.fb) img.replaceWith(h('span', { class: 'cv-noimg', title: '사진을 불러오지 못했어요' }, img.dataset.name || ''));
  else img.style.visibility = 'hidden';
  img.dispatchEvent(new Event('gaveup'));
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
  for (const [g, frame] of groups) {
    const c = core(frame), fx0 = Math.min(...c.map(o => o.x)), fx1 = Math.max(...c.map(o => o.x + o.w));
    const back = h('div', { class: 'cv-back', style: `left:${fx0 - x0 + pad}px;top:${pad}px;width:${fx1 - fx0}px;height:${y1 - y0}px` });
    const part = (fx._parts || [fx])[g] || fx;
    if (!panels.some(p => p.bg && (p._g || 0) === g)) holesOn(back, perfOf(part, fx1 - fx0), fx0 - x0 + pad, pad); // 타공판: 매대 뒤에 구멍
    inner.append(back);
  }
  for (const p of panels) {
    // 배경판은 POG 사이트 색과 상관없이 연한 회색 (진하게 칠하면 선반·파이프와 구분이 안 됨 · 사용자). 무늬(타공판)가 있으면 그 간격대로 구멍
    const pe = h('div', { class: 'cv-panel', style: `left:${p.x - x0 + pad}px;top:${p.y - y0 + pad}px;width:${p.w}px;height:${p.h}px` });
    if (p.bg) holesOn(pe, bgPitch(p.bg), 0, 0, p.bg);
    inner.append(pe);
  }
  for (const p of props) {
    const color = p.color && !/rgba\(0, 0, 0, 0\)|transparent/.test(p.color) ? p.color : '#7d7d7d';
    inner.append(h('div', { class: 'cv-prop', title: p.kind || '',
      style: `left:${p.x - x0 + pad}px;top:${p.y - y0 + pad}px;width:${p.w}px;height:${Math.max(p.h || 0, 4)}px;background:${color}` }));
  }
  for (const it of items) {
    const el = h('div', { class: 'cv-item' + (onItem ? ' click' : ''), 'data-code': it.code, 'data-id': it.id, title: `[${it.code}] ${it.name}`,
      style: `left:${it.x - x0 + pad}px;top:${it.y - y0 + pad}px;width:${it.w}px;height:${it.h}px;z-index:${itemZ(fx, it)}` },
      it.img ? prodImg(it.img, it.name, { lazy }) : h('span', {}, it.name));
    if (onItem) el.onclick = () => onItem(it, fx);
    inner.append(el);
  }
  wrap.append(inner);
  return wrap;
}

/* 타공판 구멍: POG 사이트의 배경 무늬(타공판 그림) 크기를 구멍 간격으로 씀. 그림을 그대로 쓰지 않고 구멍을 직접 그림 (다른 사이트 그림이 막혀도 보이게)
   무늬를 못 읽은 예전 데이터는 매대명·매대 타입에 '타공'이 있으면 기본 간격으로 그림 */
const imgSize = new Map(); // 무늬 그림 주소 → { w, h } (크기가 'auto'일 때 그림 크기가 간격)
const bgUrl = img => (String(img || '').match(/url\(["']?(.*?)["']?\)/) || [])[1] || '';
function bgPitch(bg) {
  const m = String(bg?.size || '').match(/([\d.]+)px(?:\s+([\d.]+)px)?/);
  if (m) return { x: +m[1], y: +(m[2] || m[1]) };
  const u = bgUrl(bg?.img), z = u && imgSize.get(u);
  return z && z.w ? { x: z.w, y: z.h } : u ? { url: u } : null;
}
function perfOf(f, frameW) {
  const b = f.board && (f.board.holes ? { x: f.board.holes.px, y: f.board.holes.py } : bgPitch(f.board));
  if (b) return { ...b, bg: f.board };
  if (/타공/.test(`${f.mdName || ''} ${f.fixtureType || ''} ${f.headerName || ''}`)) {
    const mm = +((f.mdName || '').match(/_(\d{3,4})(?:\D*)$/) || [])[1]; // 매대명 끝 숫자 = 폭(mm)일 때 25mm 간격으로
    const p = mm >= 300 && mm <= 3000 && frameW ? frameW / mm * 25 : 10;
    return { x: Math.max(5, Math.min(p, 30)), y: Math.max(5, Math.min(p, 30)) };
  }
  return null;
}
function holesOn(el, pitch, ox, oy, bg) {
  if (!pitch) return;
  if (pitch.url) { // 그림 크기를 아직 모름 → 불러와서 크기를 안 뒤에 그림
    const im = new Image();
    im.onload = () => { imgSize.set(pitch.url, { w: im.naturalWidth, h: im.naturalHeight }); holesOn(el, { x: im.naturalWidth, y: im.naturalHeight }, ox, oy, bg); };
    im.referrerPolicy = 'no-referrer'; im.src = pitch.url;
    return;
  }
  const px = Math.max(3, pitch.x), py = Math.max(3, pitch.y), r = Math.max(0.7, Math.min(px, py) * 0.16);
  el.classList.add('perf');
  el.style.backgroundImage = `radial-gradient(circle, #9e9e9e ${r}px, transparent ${r + 0.5}px)`;
  el.style.backgroundSize = `${px}px ${py}px`;
  el.style.backgroundPosition = bg?.pos && /px/.test(bg.pos) ? bg.pos : `${px / 2}px ${py / 2}px`;
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
function makeThumbs(box, scroller, onActive, tools = null) { // tools = { can(), del(id), move(id, dir), place(id, beforeId) } : POG 만들기에서만
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
  if (tools) { // 끌어다 놓을 자리: 마우스가 썸네일 위쪽 반이면 그 앞, 아래쪽 반이면 그 뒤
    const spot = ev => { const t = ev.target.closest('.thumb'); if (!t || !t._fxId) return null; const r = t.getBoundingClientRect(); return { t, after: ev.clientY > r.top + r.height / 2 }; };
    box.addEventListener('dragover', ev => {
      if (!ev.dataTransfer.types.includes('text/x-page')) return;
      ev.preventDefault(); const sp = spot(ev);
      $$('.thumb.drop-before, .thumb.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after'));
      if (sp) sp.t.classList.add(sp.after ? 'drop-after' : 'drop-before');
    });
    box.addEventListener('drop', ev => {
      const id = ev.dataTransfer.getData('text/x-page'), sp = spot(ev);
      $$('.thumb.drop-before, .thumb.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after'));
      if (!id || !sp) return; ev.preventDefault();
      const ids = [...els.keys()].filter(k => els.get(k)._fxId), i = ids.indexOf(sp.t._fxId);
      tools.place(id, sp.after ? ids[i + 1] ?? null : sp.t._fxId);
    });
  }
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
          if (tools && e.fx) { // 페이지 위로·아래로·삭제 + 끌어서 순서 바꾸기
            const ab = (txt, title, fn, cls = '') => h('button', { type: 'button', class: cls, title, onclick: ev => { ev.stopPropagation(); fn(); } }, txt);
            $('.th-page', t).append(h('div', { class: 'th-act no-print' },
              ab('▲', '앞으로', () => tools.move(e.id, -1)), ab('▼', '뒤로', () => tools.move(e.id, 1)), ab('🗑', '이 페이지 삭제', () => tools.del(e.id), 'del')));
            t.draggable = true;
            t.addEventListener('dragstart', ev => { if (!tools.can()) { ev.preventDefault(); return; } ev.dataTransfer.setData('text/x-page', e.id); ev.dataTransfer.effectAllowed = 'move'; t.classList.add('dragging'); });
            t.addEventListener('dragend', () => { t.classList.remove('dragging'); $$('.thumb.drop-before, .thumb.drop-after', box).forEach(x => x.classList.remove('drop-before', 'drop-after')); });
          }
          els.set(e.id, t);
        }
        t._block = e.block; t._fxId = e.fx ? e.id : null;
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
      box.classList.toggle('editing', !!tools?.can());
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
  const out = { ...host, items: [...(host.items || [])], props: [...(host.props || [])], panels: [...(host.panels || [])], _kids: kids.map(k => k.id), _parts: [host, ...kids] };
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
  const b = writeBatch(db), ids = [kid.id, ...(kid.merged || [])], g = undoGroup();
  track(pogId, host.id, ['merged'], g); ids.forEach(id => track(pogId, id, ['mergedInto', 'merged'], g));
  b.update(doc(db, 'pogs', pogId, 'fixtures', host.id), { merged: [...(host.merged || []), ...ids], updatedAt: serverTimestamp() });
  ids.forEach(id => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { mergedInto: host.id }));
  if ((kid.merged || []).length) b.update(doc(db, 'pogs', pogId, 'fixtures', kid.id), { merged: [] });
  await b.commit();
  toast(`'${displayName(kid)}'을(를) 이 페이지에 붙였어요`, ['↶ 되돌리기', () => undoMerge(pogId, host.id, ids, kid)]);
}
// 붙이기 되돌리기: 방금 붙인 매대(그 매대에 붙어 있던 것까지)를 원래대로
async function undoMerge(pogId, hostId, ids, kid) {
  const host = state.fixtures.get(hostId); if (!host) return;
  const b = writeBatch(db), g = undoGroup();
  track(pogId, hostId, ['merged'], g); [kid.id, ...(kid.merged || [])].forEach(id => track(pogId, id, ['mergedInto', 'merged'], g));
  b.update(doc(db, 'pogs', pogId, 'fixtures', hostId), { merged: (host.merged || []).filter(x => !ids.includes(x)), updatedAt: serverTimestamp() });
  b.update(doc(db, 'pogs', pogId, 'fixtures', kid.id), { mergedInto: '', merged: kid.merged || [] });
  (kid.merged || []).forEach(id => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { mergedInto: kid.id }));
  await b.commit();
  toast('붙이기를 되돌렸어요');
}
async function unmerge(pogId, host, kidId) {
  const b = writeBatch(db), g = undoGroup();
  track(pogId, host.id, ['merged'], g); track(pogId, kidId, ['mergedInto'], g);
  b.update(doc(db, 'pogs', pogId, 'fixtures', host.id), { merged: (host.merged || []).filter(x => x !== kidId), updatedAt: serverTimestamp() });
  b.update(doc(db, 'pogs', pogId, 'fixtures', kidId), { mergedInto: '' });
  await b.commit();
  toast('떼어냈어요. 다시 따로 한 페이지가 돼요');
}

const slideEntries = (cover, pog, fixtures, blockOf) => [
  { id: '__cover', block: cover, name: coverTitle(pog) || '표지' },
  ...fixtures.map(fx => ({ id: fx.id, block: blockOf(fx), name: displayName(fx), fx })),
];
edThumbs = makeThumbs($('#ed-thumbs'), $('#ed-pages'), id => { state.edActive = id; renderSidePanel(); }, {
  can: () => !!state.edEditable,
  del: id => { const fx = state.fixtures.get(id); if (fx) deletePage(state.currentPog.id, fx); },
  move: (id, dir) => movePage(state.currentPog.id, id, dir),
  place: (id, beforeId) => placePage(state.currentPog.id, id, beforeId),
});
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
    h('div', { class: 'pf1' }, L.mgr + ' ', h('span', { class: 'pf-mgr' }), editable ? mgrSelect(fx, pog) : null),
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
  const save = () => { const g = `${block._fx}|sp`; saveFx(block._pog, block._fx, 'sp', structuredClone(list), g); saveFx(block._pog, block._fx, 'shelfPipe', spText(list), g); };
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
    h('div', { class: 'pf1' }, L.mgr + ' ', h('span', { class: 'pf-mgr' }), editable ? mgrSelect(fx, pog) : null),
    h('div', { class: 'pf2' }, h('span', { class: 'pf-branch' })));
  return finishBlock(fx, pog, page, editable);
}
const sortedFx = () => [...state.fixtures.values()].sort((a, b) => a.order - b.order);
async function addFreePage(pogId, afterOrder) {
  const list = sortedFx(), next = list.find(f => f.order > afterOrder);
  const order = next ? (afterOrder + next.order) / 2 : afterOrder + 1; // 사이에 끼워 넣기
  const id = 'free_' + Date.now().toString(36);
  track(pogId, id, 'new');
  try {
    await setDoc(doc(db, 'pogs', pogId, 'fixtures', id), {
      kind: 'free', order, headerName: '', notes: [], items: [], props: [], memo: '', photos: [],
      teamName: '', mdName: '', createdAt: serverTimestamp(), createdBy: me(),
    });
    toast('빈 페이지를 추가했어요');
    setTimeout(() => { state.pageEls.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setEdActive(id); }, 300);
  } catch (e) { toast('추가 실패: ' + e.message); }
}
// 페이지 순서 바꾸기 (화면에 보이는 페이지 기준. 붙인 매대는 붙은 페이지를 따라감). 바뀐 순서대로 order를 1, 2, 3… 다시 매김
async function reorderPages(pogId, ids) {
  const changed = ids.map((id, i) => [id, i + 1]).filter(([id, o]) => state.fixtures.get(id)?.order !== o), g = undoGroup();
  changed.forEach(([id]) => track(pogId, id, ['order'], g));
  try {
    for (let i = 0; i < changed.length; i += 400) {
      const b = writeBatch(db);
      changed.slice(i, i + 400).forEach(([id, o]) => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { order: o }));
      await b.commit();
    }
  } catch (e) { alert('순서를 바꾸지 못했어요: ' + (e.code || e.message)); }
}
const shownIds = () => [...(state.edComposed?.keys() || [])];
function movePage(pogId, fxId, dir) {
  const ids = shownIds(), i = ids.indexOf(fxId), j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return reorderPages(pogId, ids);
}
function placePage(pogId, fxId, beforeId) { // beforeId 앞으로 (null이면 맨 뒤)
  if (fxId === beforeId) return;
  const ids = shownIds().filter(x => x !== fxId), k = beforeId ? ids.indexOf(beforeId) : ids.length;
  ids.splice(k < 0 ? ids.length : k, 0, fxId);
  return reorderPages(pogId, ids);
}
// 페이지 삭제 (매대 페이지·추가 페이지 모두). 붙여 둔 매대가 있으면 떼어서 따로 페이지로 남김
async function deletePage(pogId, fx) {
  const kids = (fx.merged || []).filter(id => state.fixtures.get(id)?.mergedInto === fx.id);
  const msg = fx.kind === 'free' ? `'${displayName(fx)}' 페이지를 삭제할까요?`
    : `'${displayName(fx)}' 페이지를 삭제할까요?\n입력한 매대명·고리·이외집기·메모도 함께 지워져요.${kids.length ? `\n붙여 둔 매대 ${kids.length}개는 떼어져서 따로 페이지로 남아요.` : ''}\n(나중에 POG 사이트에서 다시 가져오면 이 매대가 맨 뒤에 다시 생길 수 있어요)`;
  if (!confirm(msg)) return;
  try {
    const b = writeBatch(db), g = undoGroup();
    kids.forEach(id => track(pogId, id, ['mergedInto'], g)); track(pogId, fx.id, '*', g); track(pogId, '__pog', ['fixtureCount'], g);
    kids.forEach(id => b.update(doc(db, 'pogs', pogId, 'fixtures', id), { mergedInto: '' }));
    b.delete(doc(db, 'pogs', pogId, 'fixtures', fx.id));
    if (fx.kind !== 'free') b.update(doc(db, 'pogs', pogId), { fixtureCount: Math.max(0, (state.currentPog?.fixtureCount || 1) - 1), updatedAt: serverTimestamp() });
    await b.commit();
    toast('페이지를 삭제했어요 · Ctrl+Z로 되돌릴 수 있어요'); // 메모 사진 파일은 되돌릴 수 있게 남겨 둠
  } catch (e) { alert('삭제하지 못했어요: ' + (e.code || e.message)); }
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
  // POG 만들기: 표지에서 고른 '이 POG에서 쓸 고리'만 (아무것도 안 골랐으면 전부)
  const pick = sel.closest('#ed-pages') ? state.currentPog?.hooks : null;
  const opts = glossaryOf('고리타입').map(g => g.ko).filter(o => !pick?.length || pick.includes(o));
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
  $('.pf-mgr', block).textContent = fx.manager || pog.manager || ''; // 페이지마다 다른 담당자를 정할 수 있음 (비우면 POG 담당자)
  const ms = $('.pf-mgr-sel', block); if (ms) fillMgrSelect(ms, fx, pog);
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
  state.currentPog = null; state.fixtures = new Map(); state.fxRaw = new Map(); state.pogRaw = null; clearUndo(); state.pageEls = new Map(); state.lockKey = null; state.coverEl = null; state.edActive = null;
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
    state.currentPog = { id: d.id, ...d.data() }; state.pogRaw = d.data();
    applyPogDoc(); updateUndoBtns();
  });
  state.unsubFx = onSnapshot(query(collection(db, 'pogs', id, 'fixtures'), orderBy('order')), s => {
    const ids = new Set();
    state.fxRaw = new Map(s.docs.map(d => [d.id, d.data()])); // 되돌리기용 서버 원본
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
// 표지 패널: 이 POG에서 쓸 고리 고르기 (pog.hooks). 고른 고리만 각 페이지 고리타입 칸에 나옴. 아무것도 안 고르면 사전의 고리 전부
function hookPicker(pog, ed) {
  const all = glossaryOf('고리타입').map(g => g.ko);
  const picked = new Set((pog.hooks || []).filter(x => all.includes(x)));
  const used = new Set([...state.fixtures.values()].map(f => f.hookType).filter(Boolean));
  const apply = () => {
    const arr = all.filter(x => picked.has(x));
    pog.hooks = arr; savePog(pog.id, 'hooks', arr);
    $$('#ed-pages select.hook-sel').forEach(sel => fillHookSelect(sel, sel.value));
    count.textContent = arr.length ? `${arr.length}개 고름` : '안 고름 (전부 보임)';
  };
  const count = h('span', { class: 'mut' }, picked.size ? `${picked.size}개 고름` : '안 고름 (전부 보임)');
  const q = h('input', { class: 'nb-sel hk-q', placeholder: '고리 찾기' });
  const list = h('div', { class: 'hk-list' });
  const draw = () => {
    const k = norm(q.value);
    list.replaceChildren(...all.filter(x => !k || norm(x).includes(k)).map(x => {
      const cb = h('input', { type: 'checkbox', checked: picked.has(x), disabled: !ed });
      cb.onchange = () => { cb.checked ? picked.add(x) : picked.delete(x); apply(); };
      return h('label', { class: 'hk-item' }, cb, h('span', {}, x), used.has(x) ? h('small', { class: 'mut' }, '사용 중') : null);
    }));
    if (!all.length) list.append(h('p', { class: 'se-help' }, "용어 사전 '고리타입' 탭에 고리가 아직 없어요."));
  };
  q.oninput = draw; draw();
  return h('section', { class: 'se-sec' }, h('h4', {}, '이 POG에서 쓸 고리 ', count),
    h('p', { class: 'se-help' }, '체크한 고리만 각 페이지 고리타입 칸에 나와요. 하나도 체크하지 않으면 전부 나와요.'),
    all.length > 8 ? q : null, list,
    ed && all.length ? h('div', { class: 'se-btns' },
      h('button', { class: 'btn small ghost', onclick: () => { all.forEach(x => picked.add(x)); apply(); draw(); } }, '모두 체크'),
      h('button', { class: 'btn small ghost', onclick: () => { picked.clear(); apply(); draw(); } }, '모두 해제'),
      used.size ? h('button', { class: 'btn small ghost', onclick: () => { used.forEach(x => all.includes(x) && picked.add(x)); apply(); draw(); } }, '쓰는 고리 체크') : null) : null);
}
// 관리자용: 북마클릿이 이 매대 화면에서 찾은 타공판 단서 (POG 사이트가 타공판을 어떻게 그리는지 확인용)
function lookInfo(fx) {
  const L = fx.src?.look, b = fx.board, p = perfOf(fx, 0);
  const rows = [
    h('div', {}, '구멍 그리기: ', h('b', {}, p ? `${Math.round(p.x)}×${Math.round(p.y)}px 간격` : '안 그림')),
    h('div', { class: 'mut' }, '판 정보: ', b ? (b.holes ? `구멍 요소 간격 ${b.holes.px}×${b.holes.py}` : `${b.from || '배경'} · 크기 ${b.size || '-'}`) : '없음'),
  ];
  if (!L) rows.push(h('div', { class: 'mut' }, '단서 없음 — 새 북마클릿으로 이 매대를 다시 가져와 주세요.'));
  else {
    rows.push(h('div', { class: 'mut' }, `매대 범위 요소 ${L.n}개 · 무늬·그림 ${L.bg.length}개 · 작은 구멍 ${L.holes ? `${L.holes.n}개(${L.holes.size}, 간격 ${L.holes.px}×${L.holes.py})` : '없음'}`));
    L.bg.slice(0, 8).forEach(x => rows.push(h('div', { class: 'look-row' }, `${x.tag}${x.cls ? '.' + x.cls : ''}${x.ps || ''} ${x.w}×${x.h} · ${x.size || ''} · ${String(x.img || '').slice(0, 70)}`)));
    if (L.err) rows.push(h('div', { class: 'mut' }, '오류: ' + L.err));
  }
  return h('details', { class: 'se-sec look' }, h('summary', {}, '타공판 정보 (확인용 · 관리자만)'), ...rows);
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
    nodes.push(hookPicker(pog, ed));
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
    if (ed && selIt) nodes.push(sec('선택한 제품', h('div', { class: 'se-item' }, selIt.img ? prodImg(selIt.img, '', { fallback: false }) : null,
      h('div', {}, h('b', {}, selIt.name), h('div', { class: 'mut' }, selIt.code))),
      h('div', { class: 'se-btns' }, btn('맨 앞으로', () => moveItemZ(pog.id, view, selIt.id, 1)), btn('맨 뒤로', () => moveItemZ(pog.id, view, selIt.id, -1)),
        btn('선택 해제', () => selectItem(block, null), 'ghost')),
      h('p', { class: 'se-help' }, '겹친 제품 중 어느 것이 앞에 보일지만 바꿔요. 위치는 그대로예요.')));
    if (state.level === 'admin' && !free) nodes.push(lookInfo(fx));
    if (ed && block._bar) nodes.push(sec('메모 넣기', block._bar));
    if (ed && !free) {
      const list = [...state.edComposed.values()], i = list.findIndex(f => f.id === id), next = list.slice(i + 1).find(f => f.kind !== 'free');
      const kids = (fx.merged || []).map(k => state.fixtures.get(k)).filter(Boolean);
      nodes.push(sec('매대 붙이기', h('p', { class: 'se-help' }, '얇은 매대 두 개를 한 페이지에 나란히 넣어요. 붙인 매대 페이지는 따로 안 나와요.'),
        ...kids.map(k => h('div', { class: 'se-kid' }, h('span', {}, '붙인 매대: ', h('b', {}, displayName(k))), btn('↶ 붙이기 취소', () => unmerge(pog.id, fx, k.id), 'ghost'))),
        next ? h('div', { class: 'se-btns' }, btn(`⇣ 다음 매대 '${displayName(next)}' 붙이기`, () => mergeNext(pog.id, fx, state.fixtures.get(next.id)))) : null));
    }
    if (ed) nodes.push(sec('페이지', h('div', { class: 'se-btns' },
      btn('▲ 앞으로', () => movePage(pog.id, fx.id, -1), 'ghost'),
      btn('▼ 뒤로', () => movePage(pog.id, fx.id, 1), 'ghost'),
      free ? null : btn('↻ 이 매대만 다시 가져오기', () => openRegrab(fx), 'ghost'),
      btn('+ 이 뒤에 빈 페이지 추가', () => addFreePage(pog.id, fx.order), 'ghost'),
      btn('이 페이지 삭제', () => deletePage(pog.id, fx), 'ghost danger'))));
  }
  if (!ed) nodes.push(h('p', { class: 'se-help' }, pog.status === 'final' ? '최종 POG라 잠겨 있어요.' : '보기 전용이에요.'));
  box.replaceChildren(...nodes);
}
// 매대 밖이라 뺀 제품을 이 페이지에 다시 넣기
async function restoreOutside(pogId, fx) {
  const out = fx.outsideItems || [];
  if (!out.length || !confirm(`매대 밖이라 뺀 제품 ${out.length}개를 이 페이지에 되살릴까요?`)) return;
  const items = [...(fx.items || []), ...out];
  track(pogId, fx.id, ['items', 'outsideItems', 'itemCount']);
  await updateDoc(doc(db, 'pogs', pogId, 'fixtures', fx.id), { items, outsideItems: [], itemCount: items.length, updatedAt: serverTimestamp(), updatedBy: me() });
  toast(`${out.length}개를 되살렸어요`);
}

// 페이지 아래 'POG 담당자' 옆에서 이 페이지 담당자를 바로 고름 (비우면 위쪽 담당자)
function mgrSelect(fx, pog) {
  const sel = h('select', { class: 'pf-mgr-sel no-print', title: '이 페이지 POG 담당자' });
  sel.addEventListener('change', async () => {
    let v = sel.value;
    if (v === '__new') { v = await addManager(); if (!v) { fillMgrSelect(sel, fx, state.currentPog || pog); return; } }
    fx.manager = v; saveFx(pog.id, fx.id, 'manager', v);
    const blk = sel.closest('.page-block'), sp = blk && $('.pf-mgr', blk); if (sp) sp.textContent = v || state.currentPog?.manager || '';
    fillMgrSelect(sel, fx, state.currentPog || pog);
  });
  fillMgrSelect(sel, fx, pog);
  return sel;
}
function fillMgrSelect(sel, fx, pog) {
  if (sel === document.activeElement) return;
  const names = [...new Set([...state.managers.map(m => m.name), fx.manager].filter(Boolean))];
  sel.replaceChildren(h('option', { value: '' }, pog.manager ? `${pog.manager} (전체)` : '(전체 담당자)'), ...names.map(n => h('option', { value: n }, n)), h('option', { value: '__new' }, '+ 새 담당자 추가'));
  sel.value = fx.manager || '';
}
async function addManager() {
  const name = (prompt('새 POG 담당자 이름') || '').trim();
  if (!name) return '';
  if (!state.managers.some(m => m.name === name)) await addDoc(collection(db, 'managers'), { name, createdAt: serverTimestamp() });
  toast(`담당자 '${name}'을(를) 추가했어요`);
  return name;
}
$('#ed-mgr-add').onclick = () => addManager();
function refreshManagerSelect() {
  const sel = $('#ed-manager'); if (!sel) return;
  const cur = state.currentPog?.manager || '';
  const names = state.managers.map(m => m.name);
  if (cur && !names.includes(cur)) names.push(cur);
  sel.innerHTML = '';
  sel.append(h('option', { value: '' }, '선택'), ...names.map(n => h('option', { value: n }, n)), h('option', { value: '__new' }, '+ 새 담당자 추가'));
  sel.value = cur;
  state.pageEls?.forEach((blk, id) => { const ms = $('.pf-mgr-sel', blk), fx = state.fixtures.get(id); if (ms && fx && state.currentPog) fillMgrSelect(ms, fx, state.currentPog); });
}
$('#ed-manager').addEventListener('change', async e => {
  const p = state.currentPog; if (!p) return;
  let v = e.target.value;
  if (v === '__new') {
    v = await addManager();
    if (!v) { e.target.value = p.manager || ''; return; }
  }
  track(p.id, '__pog', ['manager']);
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
  try { await deletePogAll(p.id); } catch (e) { alert('삭제하지 못했어요: ' + (e.code || e.message)); return; }
  closePog(); renderPogList(); toast('삭제했어요');
};
// 문서 여러 개 지우기 (400개씩)
async function deleteDocs(refs) {
  for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(db); refs.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
}
// POG 통째로: 페이지(사진·메모 사진 파일 포함)·번역·POG 문서
async function deletePogAll(pogId) {
  const [fxs, trs] = await Promise.all([getDocs(collection(db, 'pogs', pogId, 'fixtures')), getDocs(collection(db, 'pogs', pogId, 'translations'))]);
  for (const d of fxs.docs) for (const ph of [...(d.data().photos || []), ...(d.data().notes || []).filter(n => n.path)]) { if (ph.path) try { await deleteObject(sRef(st, ph.path)); } catch { } }
  await deleteDocs([...fxs.docs.map(d => d.ref), ...trs.docs.map(d => d.ref)]);
  await deleteDoc(doc(db, 'pogs', pogId));
}
// 도면 통째로: 모든 버전(SVG 파일 포함)·번역·도면 문서
async function deleteDrawingAll(storeId) {
  const [vs, trs] = await Promise.all([getDocs(collection(db, 'drawings', storeId, 'versions')), getDocs(collection(db, 'drawings', storeId, 'translations'))]);
  for (const d of vs.docs) for (const pth of [d.data().path, d.data().basePath]) { if (pth) try { await deleteObject(sRef(st, pth)); } catch { } }
  await deleteDocs([...vs.docs.map(d => d.ref), ...trs.docs.map(d => d.ref)]);
  await deleteDoc(doc(db, 'drawings', storeId));
}
$('#ed-pdf').onclick = () => printPages($('#ed-pages'), state.currentPog);

/* ---------- PDF (인쇄) ---------- */
async function printPages(container, pog) {
  const old = document.title;
  document.title = `POG_${pog?.branchName || pog?.storeName || ''}_${fmtDate(new Date())}`.replace(/[\\/:*?"<>|]/g, '');
  const done = () => { document.title = old; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  // 아직 안 불러온 사진·실패한 사진: 다시 불러오고, 끝날 때까지(최대 20초) 기다렸다가 인쇄
  const imgs = $$('img', container);
  imgs.forEach(i => { i.loading = 'eager'; if (i.complete && !i.naturalWidth && i.dataset.src0 && !i.dataset.failed) imgRetry(i); });
  const wait = imgs.filter(i => !(i.complete && i.naturalWidth) && !i.dataset.failed && i.isConnected);
  if (wait.length) {
    let left = wait.length;
    toast(`사진 불러오는 중… (${left}장)`);
    await Promise.race([
      Promise.all(wait.map(i => new Promise(r => {
        const fin = () => { toast(`사진 불러오는 중… (${--left}장 남음)`); r(); };
        i.addEventListener('load', fin, { once: true }); i.addEventListener('gaveup', fin, { once: true });
      }))),
      new Promise(r => setTimeout(r, 20000)),
    ]);
  }
  const bad = $$('.cv-noimg', container).length;
  if (bad) toast(`사진 ${bad}장은 불러오지 못해서 제품명으로 나와요`);
  window.print();
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
    h('p', { class: 'mut' }, '매대 옆으로 완전히 벗어난 제품(매대 밖에 빼둔 제품)은 가져오지 않아요.'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true; go.textContent = '가져오는 중…';
    const ok = await doImport(ta.value);
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
function pagesFromGrab(f, i) {
  const panels = f.panels || [];
  const { inside, outside } = splitOutside(f.items || [], f.props || [], panels); // 매대 밖 제품은 버림 (사용자 결정: 아예 안 가져옴)
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
      items: bay.items, props: bay.props, panels: bay.panels || [], board: f.board || null, src: f.src || null, // src = POG 계산기용 원본 정보 (매대 크기 mm·메모 등)
      shelfPipe: autoShelfPipe(sh, pi), sp: autoSp(sh, pi),
    };
  });
  return { pages, outN: outside.length };
}

async function doImport(text) {
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
      const r = pagesFromGrab(f, i);
      pages.push(...r.pages); outN += r.outN; if (r.pages.length > 1) splitN++;
    }
    ref = await addDoc(collection(db, 'pogs'), {
      storeCode: data.storeCode || '', storeName: data.storeName || '', saup: data.saup || '00', storePrefix: codePrefix(data.storeCode),
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
$('#vw-calc').onclick = () => exportCalc(state.viewer.pog, state.viewer.fixtures);
$('#vw-nobc').onclick = () => exportNoBarcode(state.viewer.pog, state.viewer.fixtures);
// 관리자용: 이 POG 제품 중 바코드 등록이 안 된 제품코드만 엑셀로 (바코드 업로드 양식과 같은 열: 제품코드 · 바코드 · 제품명)
async function exportNoBarcode(pog, fixtures) {
  if (!pog) return;
  const names = new Map();
  for (const f of fixtures) if (f.kind !== 'free') for (const it of f.items || []) { const c = code8(String(it.code || '').trim()); if (c && !names.has(c)) names.set(c, it.name || ''); }
  if (!names.size) { alert('이 POG에 제품이 없어요.'); return; }
  const b = $('#vw-nobc'), t0 = b.textContent; b.disabled = true; b.textContent = '확인하는 중…';
  try {
    const codes = [...names.keys()], has = new Set();
    for (let i = 0; i < codes.length; i += 30) { // 한 번에 30개씩 (Firestore 'in' 한도)
      const part = codes.slice(i, i + 30);
      const snap = await getDocs(query(collection(db, 'barcodes'), where('code', 'in', part)));
      snap.docs.forEach(d => { const c = String(d.data().code); if (part.includes(c)) has.add(c); });
      b.textContent = `확인하는 중… ${Math.min(codes.length, i + 30)} / ${codes.length}`;
    }
    const miss = codes.filter(c => !has.has(c)).sort();
    if (!miss.length) { alert(`이 POG의 제품 ${codes.length.toLocaleString()}종 모두 바코드가 등록돼 있어요.`); return; }
    const X = await loadXLSX(), ws = X.utils.aoa_to_sheet([['제품코드', '바코드', '제품명'], ...miss.map(c => [c, '', names.get(c)])]);
    miss.forEach((_, i) => { const k = 'A' + (i + 2); if (ws[k]) ws[k].t = 's'; }); // 앞의 0이 안 빠지게 글자로
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 36 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '바코드');
    X.writeFile(wb, `바코드없음_${(pog.storeName || pog.storeCode || 'POG').replace(/[\\/:*?"<>|]/g, '')}_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
    toast(`바코드 없는 제품 ${miss.length.toLocaleString()}종 (전체 ${codes.length.toLocaleString()}종 중). 바코드 칸을 채워서 바코드 등록에 올리면 돼요`);
  } catch (e) { alert('만들지 못했어요: ' + (e.code || e.message)); }
  finally { b.disabled = false; b.textContent = t0; }
}
/* POG 계산기(POG-calculator2)용 파일: 계산기의 수집 파일(POG_FL_DATA)과 같은 모양. 상품 상세정보(뎁스·팩킹수량)는 비어 있고,
   계산기에서 '상품 상세정보 채우기'로 POG 사이트에서 가져온다. 칸으로 나눈 페이지는 POG 사이트 매대(mdidx)별로 다시 합침 */
function exportCalc(pog, fixtures) {
  if (!pog) return;
  const by = new Map();
  for (const f of [...fixtures].sort((a, b) => a.order - b.order)) {
    if (f.kind === 'free' || !f.mdidx) continue;
    if (!by.has(f.mdidx)) by.set(f.mdidx, []);
    by.get(f.mdidx).push(f);
  }
  let noSrc = 0;
  const mds = [...by.entries()].map(([mdidx, parts]) => {
    const f0 = parts[0], src = parts.find(p => p.src)?.src;
    if (!src) noSrc++;
    const seenI = new Set(), seenP = new Set(), items = [], props = [];
    for (const p of parts) {
      for (const it of p.items || []) if (!seenI.has(String(it.id))) {
        seenI.add(String(it.id));
        const gp = String(it.group || '').split('_'), dims = gp.length >= 4 && gp.slice(-3).every(x => /^\d+(\.\d+)?$/.test(x)) ? { w: +gp.at(-3), h: +gp.at(-2), d: +gp.at(-1) } : null;
        items.push({ objidx: String(it.id), code: it.code, name: it.name, price: it.price || 0, group: dims ? gp.slice(0, -3).join('_') : it.group || '', dims, image: it.img || '', x: it.x, y: it.y, w: it.w, h: it.h, z: it.z || 0 });
      }
      (p.props || []).forEach((pr, i) => { const key = pr.id != null && pr.id !== '' ? String(pr.id) : `${p.id}#${i}`; if (seenP.has(key)) return;
        seenP.add(key);
        props.push({ objidx: pr.id != null ? String(pr.id) : '', kind: pr.opt !== undefined && pr.opt !== '' ? (pr.opt === 'Y' ? '파이프' : '선반') : (/파이프/.test(pr.kind || '') ? '파이프' : '선반'), x: pr.x, y: pr.y, w: pr.w, h: pr.h });
      });
    }
    return { mdidx, team: f0.teamName || '', mdname: f0.mdName || '', note: '', mdtype: src?.mdtype || '', listItem: String(items.length), url: '',
      detail: { title: f0.mdName || '', mdidx, mdtype: src?.mdtype || '', mdcnt: src?.mdcnt || 1, bays: src?.bays || [], bodies: src?.bodies || [], items, props, memos: src?.memos || [] } };
  });
  if (!mds.length) { alert('계산기로 보낼 매대가 없어요.'); return; }
  if (noSrc && !confirm(`매대 ${noSrc}개는 예전에 가져와서 계산기용 정보(매대 크기 mm 등)가 없어요.\n계산기에서 매대 모양·추천 수량이 정확하지 않을 수 있어요. 정확하게 하려면 POG 만들기에서 '↻ 다시 가져오기'를 한 번 해주세요.\n그래도 받을까요?`)) return;
  const payload = { type: 'POG_FL_DATA', version: 1, source: 'global-pog', collectedAt: pog.grabbedAt || new Date().toISOString(),
    store: { code: pog.storeCode || '', name: pog.storeName || '', saup: pog.saup || '00' }, mds, products: {} };
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' })),
    download: `pog_${(pog.storeName || pog.storeCode || 'store').replace(/[^\w가-힣]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  toast('계산기용 파일을 받았어요. POG 계산기에 올린 뒤 \'상품 상세정보 채우기\'를 눌러주세요');
}

/* ---------- POG 사이트에서 다시 가져오기 (POG팀이 일부 매대만 고쳤을 때) ----------
   고유번호(mdidx)로 이 POG의 페이지를 찾아 제품·집기 모양만 최신으로 바꾼다.
   매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로. 선반/파이프 칸은 손대지 않았을 때만 새 값으로.
   칸 수가 늘면 페이지를 그 뒤에 추가, 줄면 남는 페이지를 지움(미리보기에서 알려줌). 처음 보는 매대는 맨 뒤에 추가. */
function openRegrab(hintFx) {
  const pog = state.currentPog; if (!pog) return;
  if (!state.edEditable) { toast(pog.status === 'final' ? '최종 POG예요. 잠금 해제한 뒤 다시 가져올 수 있어요' : '편집 권한이 없어요'); return; }
  const ta = h('textarea', { class: 'import-ta', placeholder: '여기에 붙여넣기 (Ctrl+V)' });
  const go = h('button', { class: 'btn primary' }, '미리보기');
  const close = modal(h('div', {},
    h('h3', {}, 'POG 사이트에서 다시 가져오기'),
    h('p', { class: 'mut' }, '이미 입력한 매대명·매대 타입·고리·이외집기·메모·사진·메모 상자는 그대로 두고, 제품과 집기만 최신으로 바꿔요.'),
    h('ol', { class: 'steps' },
      h('li', {}, hintFx ? `POG 사이트에서 '${hintFx.mdName}' 매대 보기 화면을 열고 북마크(📥 POG 가져오기)를 누르세요.`
        : 'POG 사이트에서 고친 매대의 보기 화면을 열고 북마크(📥 POG 가져오기)를 누르세요. 여러 개면 매대 목록에서 체크하고 누르세요.'),
      h('li', {}, "'복사하기'를 누르고 아래 칸에 붙여넣으세요.")),
    ta, h('p', { class: 'mut' }, '매대 밖에 빼둔 제품은 가져오지 않아요.'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = () => {
    let data;
    try { data = JSON.parse(ta.value.trim()); } catch { toast('붙여넣은 내용이 올바르지 않아요'); return; }
    if (!data || data.source !== 'pog.artbox.kr' || !Array.isArray(data.fixtures) || !data.fixtures.length) { toast('POG 데이터가 아니에요'); return; }
    close(); showRegrabPreview(pog, planRegrab(pog, data));
  };
}
const countDiff = (a, b) => { const m = new Map(); b.forEach(x => m.set(x, (m.get(x) || 0) + 1)); let n = 0; a.forEach(x => { const c = m.get(x) || 0; if (c) m.set(x, c - 1); else n++; }); return n; };
function planRegrab(pog, data) {
  const all = sortedFx();
  const plan = { rows: [], updates: [], creates: [], deletes: [], adds: [], warn: '' };
  if (data.storeCode && pog.storeCode && String(data.storeCode) !== String(pog.storeCode))
    plan.warn = `매장이 달라요. 붙여넣은 데이터: ${data.storeName} (${data.storeCode}) / 이 POG: ${pog.storeName} (${pog.storeCode})`;
  data.fixtures.forEach((f, i) => {
    if (!(f.items || []).length && !(f.props || []).length && !(f.panels || []).length) return; // 빈 줄
    const { pages } = pagesFromGrab(f, i);
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
  await flushWrites(); clearUndo();
  const all = sortedFx(), ids = new Set(all.map(x => x.id));
  const freeId = id => { let v = id; while (ids.has(v)) v = `${id}_${Date.now().toString(36)}`; ids.add(v); return v; };
  const blank = { headerName: '', fixtureType: '', hookType: '', hookCount: '', otherFixtures: '', memo: '', photos: [], notes: [] };
  let b = writeBatch(db), n = 0;
  const flush = async () => { if (n) { await b.commit(); b = writeBatch(db); n = 0; } };
  const put = async (fn) => { fn(); if (++n >= 400) await flush(); };
  for (const { o, pg } of plan.updates) {
    const keep = new Set(pg.items.map(it => String(it.id)));
    const patch = {
      items: pg.items, props: pg.props, panels: pg.panels, board: pg.board || null, src: pg.src || null, outsideItems: [],
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
// 도면 문서에 매장 정보 (바이어는 매장 목록을 못 읽어서 이름도 같이 둠)
const dwStoreInfo = st => ({ storeCode: st?.code || '', storeName: storeName(st), partner: st?.partner || '', branch: st?.branch || '', storePrefix: codePrefix(st?.code) });
// 제품 찾기 매장 이름: '업체 (매장명)' (사용자)
const partnerBranch = (partner, branch) => partner && branch ? `${partner} (${branch})` : partner || branch || '';
// 예전 문서에 storePrefix가 없으면 채움 (쓸 권한이 있는 사람 화면에서 한 번씩)
let prefixTimer = null;
function fillPrefixes() {
  clearTimeout(prefixTimer);
  prefixTimer = setTimeout(() => {
    if (canEdit('pog-make')) for (const p of state.pogs) if (p.storeCode && p.storePrefix !== codePrefix(p.storeCode)) updateDoc(doc(db, 'pogs', p.id), { storePrefix: codePrefix(p.storeCode) }).catch(() => { });
    if (canEdit('drawing')) for (const d of state.dwMap.values()) {
      const st = state.stores.find(x => x.id === d.id); if (!st) continue;
      const info = dwStoreInfo(st);
      if (d.storePrefix !== info.storePrefix || d.storeName !== info.storeName || d.storeCode !== info.storeCode || d.partner !== info.partner || d.branch !== info.branch) setDoc(doc(db, 'drawings', d.id), info, { merge: true }).catch(() => { });
    }
  }, 1500);
}
// 매장 삭제: 이 매장의 POG(매장코드가 같거나 이어진 것)·도면을 모두 지움. '매장 삭제하겠습니다'를 똑같이 써야 지워짐
const STORE_DEL_WORD = '매장 삭제하겠습니다';
function deleteStoreAll(st) {
  const pogs = state.pogs.filter(p => p.storeId === st.id || (st.code && String(p.storeCode || '').trim() === String(st.code).trim()));
  const d = state.dwMap.get(st.id);
  const inp = h('input', { class: 'del-confirm', placeholder: STORE_DEL_WORD, autocomplete: 'off' });
  const go_ = h('button', { class: 'btn danger', disabled: true }, '모두 삭제');
  inp.addEventListener('input', () => { go_.disabled = inp.value.trim() !== STORE_DEL_WORD; });
  const close = modal(h('div', { class: 'del-box' },
    h('h3', {}, `'${storeName(st)}' (${st.code}) 매장 삭제`),
    h('p', {}, '아래가 모두 함께 지워지고 되돌릴 수 없어요.'),
    h('ul', { class: 'steps' },
      h('li', {}, '매장 정보'),
      h('li', {}, pogs.length ? `POG ${pogs.length}개 (모든 페이지·번역·메모 사진): ${pogs.map(p => `${p.storeName || p.storeCode || ''}${p.status === 'final' ? ' (최종)' : ' (작성 중)'}`).join(', ')}` : 'POG 없음'),
      h('li', {}, d?.latestNo ? `도면 (ver.${d.latestNo}까지 모든 버전·번역·파일)` : '도면 없음')),
    h('p', {}, '지우려면 아래 칸에 ', h('b', {}, STORE_DEL_WORD), '를 똑같이 써주세요.'),
    inp, h('div', { class: 'modal-act' }, go_)));
  inp.focus();
  go_.onclick = async () => {
    if (inp.value.trim() !== STORE_DEL_WORD) return;
    go_.disabled = true; inp.disabled = true;
    try {
      for (const [i, p] of pogs.entries()) { go_.textContent = `POG 지우는 중… (${i + 1}/${pogs.length})`; if (state.currentPog?.id === p.id) closePog(); await deletePogAll(p.id); }
      if (d) { go_.textContent = '도면 지우는 중…'; if (dw.id === st.id) closeDw(); await deleteDrawingAll(st.id); }
      await deleteDoc(doc(db, 'stores', st.id));
      close(); toast(`매장을 삭제했어요 · POG ${pogs.length}개${d ? ' · 도면' : ''}도 함께 지웠어요`);
    } catch (e) { alert('지우다가 멈췄어요: ' + (e.code || e.message) + '\n다시 누르면 남은 것을 이어서 지워요.'); go_.textContent = '모두 삭제'; go_.disabled = false; inp.disabled = false; }
  };
}
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
      // 매장 삭제는 관리자만 (규칙도 같음). 이 매장의 POG·도면도 함께 지움 (deleteStoreAll)
      h('td', { class: 'tc' }, state.level === 'admin' ? h('button', { class: 'btn ghost danger small', onclick: () => deleteStoreAll(st) }, '삭제') : null)));
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
// 화면: up = 도면 업로드(VMD), tr = 도면 번역(글사부), on = 온라인 도면(최종본 보기, 한/영)
const dwf = { pog: undefined, jump: false }; // 도면 찾기 (아래 dwFindHits)
const DW_TITLE = { up: '도면 업로드', tr: '도면 번역', on: '온라인 도면' };
function setDwMode(m) {
  if (dw.tab === m && dw.modeSet) return;
  dw.modeSet = true; dw.tab = m; dw.showKo = m === 'on' && isStaff(); // 온라인 도면: 직원은 한국어부터, 바이어는 영어부터
  $('#dw-mode-title').textContent = DW_TITLE[m];
  const id = dw.id; closeDw(); renderDwList();
  if (id && dwListRows().some(x => x.id === id)) openDw(id);
}
// 알약 모양 버튼 (한국어 | English …): 누르면 바로 바뀜
function segButtons(box, items, cur, onPick) {
  box.replaceChildren(...items.map(([v, label]) => h('button', { type: 'button', class: v === cur ? 'on' : '', onclick: () => { if (v !== cur) onPick(v); } }, label)));
  box.classList.toggle('hidden', items.length < 2);
}
$('#dw-search').addEventListener('input', renderDwList);
// 바이어는 매장 목록을 못 읽음 → 도면 문서의 매장 정보로 목록을 만듦
const dwStores = () => isStaff() ? state.stores : [...state.dwMap.values()].map(d => ({ id: d.id, code: d.storeCode || '', partner: d.storeName || '', branch: '' }));
function dwListRows() {
  const q = $('#dw-search').value.trim().toLowerCase();
  return dwStores().filter(st => {
    const d = state.dwMap.get(st.id);
    if (dw.tab !== 'up' && !(d?.status === 'final')) return false; // 번역·온라인 도면은 내보낸 도면만
    return !q || [st.code, st.partner, st.branch].join(' ').toLowerCase().includes(q);
  });
}
function renderDwList() {
  const list = $('#dw-list'); if (!list) return;
  const rows = dwListRows();
  list.innerHTML = '';
  if (!rows.length) list.append(h('div', { class: 'mut pad' }, dw.tab !== 'up' ? '내보낸 도면이 있는 매장이 없어요.' : '등록된 매장이 없어요. 처음 화면의 \'매장 등록\'에서 먼저 등록해주세요.'));
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
    : [h('div', {}, dw.tab === 'on' ? '볼 매장을 고르세요.' : '번역할 매장을 고르세요.'), h('div', { class: 'mut' }, 'VMD실이 내보낸 도면만 나와요.')]));
}
function closeDw() {
  dw.unsubs.forEach(u => u()); dw.unsubs = []; dw.id = null; dw.doc = null; dw.versions = []; dw.vId = null; dw.tr = {}; dw.sel = null;
  $('#dw-body')?.classList.add('hidden'); $('#dw-empty')?.classList.remove('hidden');
  $('#v-dw .split')?.classList.remove('list-off');
}
function openDw(id) {
  closeDw();
  dw.id = id; $('#dw-find').value = ''; dwf.pog = undefined;
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
  if (dw.tab === 'up' || !dw.id) return;
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
  dw.vId = dw.tab !== 'up' ? (dwFinal(dw.doc) && exported.some(v => v.id === dwFinal(dw.doc)) ? dwFinal(dw.doc) : exported.at(-1)?.id)
    : dw.versions.at(-1)?.id || null;
}
function renderDw() {
  if (!dw.id) return;
  const st = dwStores().find(x => x.id === dw.id);
  pickDefaultVersion();
  const v = curVersion(), up = dw.tab === 'up';
  $('#dw-title').textContent = `${storeName(st)} (${st?.code || ''})`;
  const area = $('#dw-area'); area.disabled = !up || !canEdit('drawing');
  if (area !== document.activeElement) area.value = dw.doc?.area ?? '';
  area.classList.toggle('need', up && canEdit('drawing') && !(Number(area.value) > 0));
  $('#dw-area-f').classList.toggle('hidden', !up && !dw.doc?.area);
  $('#dw-seg').classList.toggle('hidden', up);
  if (!up) {
    const langs = trLangs(); if (!langs.includes(dw.lang)) dw.lang = 'English';
    segButtons($('#dw-seg'), [['ko', dw.tab === 'tr' ? '한글 원본' : '한국어'], ...langs.map(l => [l, l])], dw.showKo ? 'ko' : dw.lang, v => {
      if (v === 'ko') dw.showKo = true; else { dw.showKo = false; if (v !== dw.lang) { dw.lang = v; dw.tr = {}; subDwTr(); } }
      renderDw();
    });
    $('#dw-seg').classList.remove('hidden');
  }
  $('#dw-side').classList.toggle('hidden', dw.tab === 'on'); // 온라인 도면은 보기만
  $('#dw-find-box').classList.toggle('hidden', up);
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
  e.target.classList.toggle('need', !(Number(e.target.value) > 0));
  const id = dw.id, st = state.stores.find(x => x.id === id), val = e.target.value === '' ? '' : Number(e.target.value);
  queueWrite(`dw|${id}|area`, () => setDoc(doc(db, 'drawings', id), { ...dwStoreInfo(st), storeId: id, area: val, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true }));
});
// 평수는 꼭 적어야 올리기·내보내기가 됨 (사용자)
function needArea() {
  const a = $('#dw-area'), ok = a.value.trim() !== '' && Number(a.value) > 0;
  a.classList.toggle('need', !ok);
  if (!ok) { alert('평수를 먼저 적어주세요. 평수가 있어야 도면을 저장할 수 있어요.'); a.focus(); }
  return ok;
}
$('#dw-upload').onclick = () => { if (needArea()) $('#dw-file').click(); };
$('#dw-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await uploadDrawing(f); };
// 도면 파일을 화면에 끌어다 놓아도 올라감 (도면 업로드 화면, VMD·관리자)
const canDrop = () => dw.id && dw.tab === 'up' && canEdit('drawing') && state.view === 'dw-up';
const dropZone = $('#dw-body');
dropZone.addEventListener('dragover', e => { if (!canDrop() || ![...e.dataTransfer.types].includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; dropZone.classList.add('dropping'); });
dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dropping'); });
dropZone.addEventListener('drop', async e => {
  dropZone.classList.remove('dropping');
  if (!canDrop()) return;
  e.preventDefault();
  const f = e.dataTransfer.files[0]; if (!f) return;
  if (!needArea()) return;
  await uploadDrawing(f);
});
// 다른 곳에 떨어뜨려도 브라우저가 파일을 열어 사이트를 떠나지 않게
window.addEventListener('dragover', e => { if (state.view === 'dw-up' && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => { if (state.view === 'dw-up') e.preventDefault(); });
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
    await setDoc(doc(db, 'drawings', id), { ...dwStoreInfo(store), storeId: id, latestNo: no, latestExported: false, updatedAt: serverTimestamp(), updatedBy: me() }, { merge: true });
    dw.vId = vId;
    toast(`ver.${no} 올렸어요 · 매대명 ${an.groups.length}개 읽음. 다 되면 '내보내기'를 눌러주세요`);
  } catch (e) { toast('올리기 실패: ' + e.message); }
}
$('#dw-export').onclick = async () => {
  const v = curVersion(); if (!v || v.exported) return;
  if (!needArea()) return;
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
  if (!isStaff()) { // 바이어: 사전을 못 읽으니 글사부 화면에서 저장해 둔 최종 번역(pub)을 씀
    const value = m.text || prev || trDoc?.pub?.[vId]?.[g.id] || '';
    return { m, prev, a, value, show: value || g.ko, need: false, status: value ? 'saved' : 'missing' };
  }
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
function drawingView(v, mode, { onPick, onPickMany, used, selId, picks, onLab, plain, ctx, only, hits } = {}) {
  const wrap = h('div', { class: 'dw-canvas', style: `aspect-ratio:${v.w} / ${v.h}` }, h('img', { src: mode === 'en' ? v.baseUrl : v.url, alt: '', draggable: 'false' }));
  const pct = (n, of) => `${(n / of * 100).toFixed(3)}%`;
  for (const g of v.groups || []) {
    if (mode === 'en') {
      const s0 = ctx ? dwRowState(g, ctx.vId, ctx.trDoc, ctx.lang) : dwRowState(g), m = s0.m, sc = m.sc || 1;
      const look = dw.tab === 'on' || !onLab; // 보기만 (온라인 도면·PDF): 점선·끌기 없음
      const el = h('div', { class: 'dw-lab' + (s0.need && !look ? ' need' : '') + (g.id === selId && !look ? ' on' : '') + (!look && canEdit('drawing-trans') ? ' edit' : ''),
        style: `left:${pct(g.x + g.w / 2 + (m.dx || 0), v.w)};top:${pct(g.y + (m.dy || 0), v.h)};font-size:${(g.fs * 0.82 * sc / v.w * 100).toFixed(4)}cqw` },
        (s0.show || g.ko).replace(/ ?\/ ?/g, '/'));
      el.title = g.ko;
      if (!look) el.addEventListener('pointerdown', e => dragLabel(e, g, wrap, v));
      wrap.append(el);
    } else if (only) { if (g.id === only) wrap.append(h('div', { class: 'dw-box fd-on', style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko }));
    } else if (!plain) {
      const el = h('div', { 'data-gid': g.id, class: 'dw-box' + (onPick ? ' pick' : '') + (used?.has(g.id) ? ' used' : '') + (g.id === selId || picks?.has(g.id) ? ' on' : ''),
        style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko });
      if (onPick) el.onclick = () => onPick(g);
      wrap.append(el);
    }
  }
  // 빈 곳을 끌면 네모 안에 걸친 칸을 한꺼번에 고름 (도면 업로드: 묶음 고치기)
  if (onPickMany) wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.dw-box')) return;
    e.preventDefault();
    const r0 = wrap.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const band = h('div', { class: 'dw-band' }); wrap.append(band);
    const box = ev => ({ l: Math.min(sx, ev.clientX), t: Math.min(sy, ev.clientY), r: Math.max(sx, ev.clientX), b: Math.max(sy, ev.clientY) });
    const mv = ev => { const b = box(ev); Object.assign(band.style, { left: b.l - r0.left + 'px', top: b.t - r0.top + 'px', width: b.r - b.l + 'px', height: b.b - b.t + 'px' }); };
    const up = ev => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); band.remove();
      const b = box(ev); if (b.r - b.l < 4 && b.b - b.t < 4) return;
      const ids = $$('.dw-box', wrap).filter(el => { const q = el.getBoundingClientRect(); return q.right >= b.l && q.left <= b.r && q.bottom >= b.t && q.top <= b.b; }).map(el => el.dataset.gid);
      if (ids.length) onPickMany(ids);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  if (only && mode === 'en') { const g = (v.groups || []).find(x => x.id === only); if (g) wrap.append(h('div', { class: 'dw-box fd-on', style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}` })); }
  // 찾기 결과: 빨간 칸 (누르기는 그 아래 글자로 통과)
  if (hits?.size) for (const g of v.groups || []) if (hits.has(g.id))
    wrap.append(h('div', { class: 'dw-box fd-on dw-find', style: `left:${pct(g.x, v.w)};top:${pct(g.y, v.h)};width:${pct(g.w, v.w)};height:${pct(g.h, v.h)}`, title: g.ko }));
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
      h('div', { class: 'mut' }, canEdit('drawing') ? "평수를 적고, 한글 도면 SVG 파일을 여기에 끌어다 놓거나 위의 '도면 파일 올리기'를 눌러주세요." : 'VMD실이 아직 도면을 올리지 않았어요.')));
    return;
  }
  const en = dw.tab !== 'up' && !dw.showKo;
  const legend = dw.tab === 'up'
    ? h('div', { class: 'dw-legend' }, `파란 칸 = 사이트가 읽은 매대명 ${v.groups?.length || 0}개. 파란 칸이 없는 글자는 윤곽선이 된 글자라 번역할 수 없어요.${canEdit('drawing') ? ' 칸을 누르거나 빈 곳을 끌어서 여러 칸을 고르고, 오른쪽에서 합치기(한 매대로)·나누기를 해요.' : ''}`,
      !v.groups?.length ? h('span', { class: 'warn' }, ' 글자를 하나도 못 읽었어요!') : null)
    : dw.tab === 'on' ? h('div', { class: 'dw-legend' }, `${$('#dw-ver').textContent} · ${en ? dw.lang : '한국어'}`)
    : h('div', { class: 'dw-legend' }, en ? '글자를 끌어서 옮길 수 있어요. 누르면 오른쪽에서 고쳐요. 회색 점선 = 아직 번역 안 된 글자' : '한글 원본이에요.');
  const pickable = dw.tab === 'up' && canEdit('drawing');
  const hits = pickable ? null : dwFindHits(v);
  box.replaceChildren(legend, drawingView(v, en ? 'en' : 'ko', pickable ? { picks: dwPicks(), onPick: g => togglePick(g.id), onPickMany: ids => { const p = dwPicks(); ids.forEach(i => p.add(i)); renderDwStage(); renderDwSide(); } } : { selId: dw.sel, onLab: dw.tab === 'tr', plain: dw.tab !== 'up', hits }));
  if (hits && dwf.jump) { dwf.jump = false; setTimeout(() => $('.dw-find', box)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 30); }
}
// 도면 찾기: 매대명(한글·번역) + 제품(그 매장 최종 POG에서 그 제품이 있는 페이지의 '도면에서 고르기' 매대)
function dwFindHits(v) {
  const q = findNorm($('#dw-find').value), n = $('#dw-find-n');
  if (!q) { n.textContent = ''; return null; }
  const hits = new Set();
  for (const g of v.groups || []) if (findNorm(g.ko).includes(q) || findNorm(dwRowState(g).show).includes(q)) hits.add(g.id);
  let items = 0;
  if (dwf.pog === undefined) loadDwFindPog();
  for (const f of dwf.pog?.fixtures || []) {
    const its = (f.items || []).filter(it => findNorm(it.name).includes(q) || findNorm(it.code).includes(q));
    const fxHit = findNorm([f.teamName, f.fixtureType].join('|')).includes(q);
    if (!its.length && !fxHit) continue;
    const r = f.drawingRef; if (!r || r.storeId !== dw.id) continue;
    const g = (v.groups || []).find(x => r.vId === v.id ? x.id === r.gid : x.ko === r.ko);
    if (g) { hits.add(g.id); items += its.length; }
  }
  n.textContent = hits.size ? `매대 ${hits.size}곳${items ? ` · 제품 ${items}개` : ''}` : (dwf.pog === null ? '없어요' : dwf.pog ? '없어요' : '찾는 중…');
  n.classList.toggle('none', !hits.size);
  return hits;
}
// 이 매장의 최종 POG 페이지를 한 번만 읽어 둠 (제품·카테고리 찾기용)
async function loadDwFindPog() {
  const id = dw.id, st = dwStores().find(x => x.id === id);
  const p = state.pogs.filter(p => p.status === 'final' && (p.storeId === id || (st?.code && String(p.storeCode) === String(st.code))))
    .sort((a, b) => (b.finalizedAt?.toMillis?.() || 0) - (a.finalizedAt?.toMillis?.() || 0))[0];
  dwf.pog = p ? false : null;
  if (!p) return;
  try {
    const s = await getDocs(query(collection(db, 'pogs', p.id, 'fixtures'), orderBy('order')));
    if (dw.id !== id) return;
    dwf.pog = { id: p.id, fixtures: s.docs.map(d => ({ id: d.id, ...d.data() })) };
  } catch { dwf.pog = null; }
  if ($('#dw-find').value.trim()) renderDwStage();
}
let dwFindT = 0;
$('#dw-find').addEventListener('input', () => { clearTimeout(dwFindT); dwFindT = setTimeout(() => { dwf.jump = true; renderDwStage(); }, 250); });
$('#dw-find').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dwf.jump = true; renderDwStage(); } });
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
  if (dw.tab === 'on') { box.replaceChildren(); return; }
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
    if (ed && glLoaded) publishDw(v, states);
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
// 지금 보이는 번역(저장·이전 버전·사전 자동)을 pub에 저장 → 바이어 화면에 씀
function publishDw(v, states) {
  const pub = Object.fromEntries(states.filter(([, s0]) => s0.value).map(([g, s0]) => [g.id, s0.value]));
  const id = dw.id, lang = dw.lang, k = `dwpub|${id}|${lang}|${v.id}`;
  if (JSON.stringify(pub) === JSON.stringify(dw.tr?.pub?.[v.id] || {}) || pendingKey(k)) return;
  ((dw.tr ||= {}).pub ||= {})[v.id] = pub;
  queueWrite(k, () => updateDoc(doc(db, 'drawings', id, 'translations', lang), { [`pub.${v.id}`]: pub }).catch(() => setDoc(doc(db, 'drawings', id, 'translations', lang), { lang, pub: { [v.id]: pub } }, { merge: true })));
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
    const ord = sel.slice().sort((a, b) => a.y - b.y || a.x - b.x), first = ord[0];
    // 합친 묶음 = 매대 하나. 이름은 고른 칸 글자를 '/'로 이어 씀 (POG 헤더에도 'A/B'로 들어감 · 사용자)
    const names = ord.map(g => String(g.ko || '').trim().replace(/^\/+|\/+$/g, '')).filter(Boolean);
    const one = { id: first.id, ...makeGroup(sel.flatMap(g => g.parts.map(p => ({ ...p })))), ko: names.join('/'), lines: names };
    save([...groups.filter(x => !picks.has(x.id)), one], `${sel.length}개를 '${one.ko}'로 합쳤어요`);
  };
  const g1 = sel.length === 1 ? sel[0] : null;
  return h('section', { class: 'se-sec' }, h('h4', {}, '매대명 묶음 고치기'),
    h('p', { class: 'se-help' }, '도면에서 파란 칸을 누르거나, 빈 곳을 끌어 네모로 여러 칸을 한 번에 고르세요. 한 매대인 글자들을 골라 [합치기]하면 한 묶음(매대 하나)이 되고, POG에는 \'글자1/글자2\'처럼 /로 이어져 들어가요. 한 칸에 여러 매대가 들어갔으면 [나누기].'),
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
      const ug = undoGroup(); saveFx(pog.id, fx.id, 'headerName', g.ko, ug); saveFx(pog.id, fx.id, 'drawingRef', ref, ug);
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
  closeViewer(); $('#vw-find').value = '';
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
    if (v.lang !== 'ko' && !v.trs[v.lang]) v.lang = 'ko';
    renderVwSeg(); renderViewer();
  }, () => { });
}
function renderVwSeg() {
  const v = state.viewer;
  segButtons($('#vw-seg'), [['ko', '한국어'], ...Object.keys(v.trs || {}).map(l => [l, l])], v.lang, l => { v.lang = l; renderVwSeg(); renderViewer(); });
}
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
  v.blocks = blocks; vwFind();
}

/* ---------- 찾기 (온라인 POG·온라인 도면) ----------
   제품명·제품코드, 매대명(한글·번역)·카테고리(팀명)·매대 타입. 띄어쓰기·대소문자 무시 */
const findNorm = s => String(s ?? '').toLowerCase().replace(/\s+/g, '');
const vf = { hits: [], i: -1 };
function vwFind(jump = 0) {
  const v = state.viewer, q = findNorm($('#vw-find').value), pages = $('#vw-pages');
  $$('.fd-dim', pages).forEach(x => x.classList.remove('fd-dim'));
  $$('.fd-hit', pages).forEach(x => x.classList.remove('fd-hit'));
  $$('.find-page', pages).forEach(x => x.classList.remove('find-page'));
  $$('#vw-thumbs .thumb.find-hit').forEach(x => x.classList.remove('find-hit'));
  const n = $('#vw-find-n'), prev = vf.hits[vf.i];
  vf.hits = []; vf.i = -1;
  $('#vw-find-prev').classList.toggle('hidden', !q); $('#vw-find-next').classList.toggle('hidden', !q);
  if (!q) { n.textContent = ''; return; }
  const out = v.lang !== 'ko' ? v.trs?.[v.lang]?.out : null;
  let items = 0;
  for (const f of composeFx(v.fixtures || [])) {
    const blk = v.blocks?.get(f.id); if (!blk) continue;
    const t = out?.[f.id] || {};
    const fxHit = findNorm([displayName(f), f.mdName, f.teamName, f.fixtureType, t.headerName, t.cat, t.fixtureType].join('|')).includes(q);
    const its = (f.items || []).filter(it => findNorm(it.name).includes(q) || findNorm(it.code).includes(q));
    if (!fxHit && !its.length) continue;
    vf.hits.push(f.id); items += its.length;
    if (fxHit) blk.classList.add('find-page');
    const cv = $('.pcanvas .cv', blk);
    if (its.length && cv) { cv.classList.add('fd-dim'); its.forEach(it => cv.querySelector(`.cv-item[data-id="${CSS.escape(String(it.id))}"]`)?.classList.add('fd-hit')); }
  }
  $$('#vw-thumbs .thumb').forEach(t => { if (vf.hits.includes(t._fxId)) t.classList.add('find-hit'); });
  n.textContent = vf.hits.length ? `${vf.hits.length}쪽${items ? ` · 제품 ${items}개` : ''}` : '없어요';
  n.classList.toggle('none', !vf.hits.length);
  vf.i = Math.max(0, vf.hits.indexOf(prev));
  if (jump && vf.hits.length) {
    vf.i = prev && vf.hits.includes(prev) ? (vf.hits.indexOf(prev) + jump + vf.hits.length) % vf.hits.length : 0;
    v.blocks.get(vf.hits[vf.i])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
let vwFindT = 0;
$('#vw-find').addEventListener('input', () => { clearTimeout(vwFindT); vwFindT = setTimeout(() => { vf.hits = []; vwFind(1); }, 250); });
$('#vw-find').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); vwFind(e.shiftKey ? -1 : 1); } });
$('#vw-find-next').onclick = () => vwFind(1);
$('#vw-find-prev').onclick = () => vwFind(-1);
$('#vw-pdf').onclick = () => printPages($('#vw-pages'), state.viewer.pog);
function showItem(it, fx) {
  modal(h('div', { class: 'item-pop' },
    h('div', { class: 'ip-img' }, it.img ? prodImg(it.img, '', { fallback: false }) : null),
    h('div', { class: 'ip-info' },
      h('h3', {}, it.name),
      h('table', {},
        h('tr', {}, h('th', {}, '제품코드'), h('td', {}, it.code)),
        h('tr', {}, h('th', {}, '가격'), h('td', {}, it.price ? '₩' + Number(it.price).toLocaleString() : '-')),
        h('tr', {}, h('th', {}, '바코드'), bcCell(it.code)),
        h('tr', {}, h('th', {}, '매대'), h('td', {}, displayName(fx)))))));
}

/* ---------- 바코드 등록 ----------
   barcodes/{바코드} = { code: 제품코드, name?: 제품명 }. 바코드 하나에 제품 하나, 제품 하나에 바코드 여럿도 됨.
   제품명은 이 화면에서만 보여줌 (제품 찾기에서는 POG의 제품명을 씀). 엑셀 머리글: 제품코드 · 바코드 · (제품명) */
const bcClean = v => String(v ?? '').replace(/\s+/g, '').replace(/^'/, '');
// 엑셀 칸 값 → 글자. 숫자 칸이면 지수 표기 없이. 제품코드는 POG 사이트처럼 8자리 (숫자 칸이라 앞의 0이 빠졌으면 채움)
// 제품코드는 늘 8자리: 숫자로만 된 코드가 짧으면(엑셀에서 앞의 0이 빠진 경우) 앞에 0을 채움 (사용자)
const code8 = c => /^\d{1,7}$/.test(c) ? c.padStart(8, '0') : c;
const cellText = (v, pad = 0) => typeof v === 'number' ? (Number.isInteger(v) ? BigInt(Math.round(v)).toString() : String(v)).padStart(pad, '0') : bcClean(v);
function bcCell(code) {
  const td = h('td', { class: 'mut' }, '…');
  if (!code) { td.textContent = '-'; return td; }
  getDocs(query(collection(db, 'barcodes'), where('code', '==', String(code)), limit(5)))
    .then(s => { td.textContent = s.docs.map(d => d.id).join(', ') || '등록 안 됨'; td.classList.toggle('mut', !s.size); })
    .catch(() => { td.textContent = '-'; });
  return td;
}
async function bcCount() {
  const el = $('#bc-count'); if (!el) return;
  try { const c = await getCountFromServer(collection(db, 'barcodes')); el.textContent = `등록된 바코드 ${c.data().count.toLocaleString()}개`; }
  catch { el.textContent = ''; }
}
// 찾는 글자가 없으면 등록된 바코드 목록 (제품코드 순, 100개씩 '더 보기')
const bcl = { rows: [], last: null, done: false, busy: false };
async function bcList(reset) {
  if (bcl.busy) return;
  if (reset) { bcl.rows = []; bcl.last = null; bcl.done = false; }
  if (bcl.done) return;
  bcl.busy = true;
  try {
    const qs = [collection(db, 'barcodes'), orderBy('code'), ...(bcl.last ? [startAfter(bcl.last)] : []), limit(100)];
    const s = await getDocs(query(...qs));
    bcl.rows.push(...s.docs.map(d => ({ id: d.id, ...d.data() })));
    bcl.last = s.docs.at(-1) || bcl.last; bcl.done = s.docs.length < 100;
  } catch (e) { toast('바코드 목록을 읽지 못했어요: ' + (e.code || e.message)); }
  bcl.busy = false;
  if (!bcClean($('#bc-search').value)) bcRows(bcl.rows, true);
}
function bcRows(rows, listing = false) {
  const body = $('#bc-body'), ed = canEdit('barcodes');
  body.replaceChildren(...(rows.length ? rows.map(r => h('tr', {},
    h('td', {}, r.id), h('td', {}, r.code || ''), h('td', {}, r.name || ''),
    h('td', { class: 'tc' }, ed ? h('button', { class: 'btn ghost danger small', onclick: async () => {
      if (!confirm(`바코드 ${r.id}를 지울까요?`)) return;
      try { await deleteDoc(doc(db, 'barcodes', r.id)); toast('지웠어요'); bcl.rows = bcl.rows.filter(x => x.id !== r.id); bcSearch(); bcCount(); } catch (e) { toast('지우지 못했어요: ' + e.code); }
    } }, '삭제') : null))) : [h('tr', {}, h('td', { colspan: 4, class: 'mut pad' }, $('#bc-search').value.trim() ? '찾는 바코드·제품코드가 없어요.' : bcl.busy ? '불러오는 중…' : '등록된 바코드가 없어요.'))]),
    ...(listing && !bcl.done && rows.length ? [h('tr', {}, h('td', { colspan: 4, class: 'tc' }, h('button', { class: 'btn small ghost', onclick: () => bcList() }, `더 보기 (지금 ${rows.length.toLocaleString()}개)`)))] : []));
}
async function bcSearch() {
  const q = bcClean($('#bc-search').value);
  if (!q) { bcRows(bcl.rows, true); return; }
  try {
    const [one, byCode] = await Promise.all([getDoc(doc(db, 'barcodes', q)), getDocs(query(collection(db, 'barcodes'), where('code', '==', code8(q)), limit(50)))]);
    const m = new Map();
    if (one.exists()) m.set(one.id, { id: one.id, ...one.data() });
    byCode.docs.forEach(d => m.set(d.id, { id: d.id, ...d.data() }));
    bcRows([...m.values()]);
  } catch (e) { toast('찾지 못했어요: ' + (e.code || e.message)); }
}
$('#bc-search').addEventListener('keydown', e => { if (e.key === 'Enter') bcSearch(); });
$('#bc-search').addEventListener('input', e => { if (!e.target.value.trim()) bcRows(bcl.rows, true); });
$('#bc-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, bc = bcClean(f.barcode.value), code = code8(bcClean(f.code.value)), name = f.name.value.trim();
  if (!bc || !code) return;
  if (bc.includes('/')) { toast('바코드에 / 는 쓸 수 없어요'); return; }
  try {
    const [one, same] = await Promise.all([getDoc(doc(db, 'barcodes', bc)), getDocs(query(collection(db, 'barcodes'), where('code', '==', code), limit(1)))]);
    if (one.exists()) { alert(`이미 있는 바코드예요 (등록된 제품코드 ${one.data().code}).\n바꾸려면 찾기에서 지우고 다시 추가해주세요.`); return; }
    if (same.docs.length) { alert(`이미 있는 제품코드예요 (등록된 바코드 ${same.docs[0].id}).\n바꾸려면 찾기에서 지우고 다시 추가해주세요.`); return; }
    await setDoc(doc(db, 'barcodes', bc), { code, ...(name ? { name } : {}), updatedAt: serverTimestamp(), updatedBy: me() });
    toast('저장했어요'); f.reset(); $('#bc-search').value = bc; bcSearch(); bcCount(); bcList(true);
  } catch (err) { toast('저장하지 못했어요: ' + (err.code || err.message)); }
});
$('#bc-form').onclick = async () => {
  try {
    const X = await loadXLSX(), wb = X.utils.book_new();
    const ws = X.utils.aoa_to_sheet([['제품코드', '바코드', '제품명'], ['07005574', '8809000000000', '(선택) 제품명']]);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 30 }];
    X.utils.book_append_sheet(wb, ws, '바코드'); X.writeFile(wb, '바코드_양식.xlsx');
  } catch (e) { alert(e.message); }
};
$('#bc-export').onclick = async () => {
  const b = $('#bc-export'); b.disabled = true; b.textContent = '모으는 중…';
  try {
    const [X, s] = await Promise.all([loadXLSX(), getDocs(collection(db, 'barcodes'))]);
    const rows = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.code).localeCompare(String(b.code)) || a.id.localeCompare(b.id));
    const ws = X.utils.aoa_to_sheet([['제품코드', '바코드', '제품명'], ...rows.map(r => [r.code || '', r.id, r.name || ''])]);
    rows.forEach((_, i) => { for (const c of ['A', 'B']) { const k = c + (i + 2); if (ws[k]) ws[k].t = 's'; } }); // 앞의 0이 안 빠지게 글자로
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 30 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '바코드');
    X.writeFile(wb, `바코드_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
  } catch (e) { alert('엑셀로 저장하지 못했어요: ' + (e.code || e.message)); }
  b.disabled = false; b.textContent = '엑셀로 저장';
};
$('#bc-import').onclick = () => $('#bc-file').click();
$('#bc-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let rows;
  try {
    const X = await loadXLSX(), wb = X.read(await file.arrayBuffer());
    rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  } catch (err) { alert('엑셀을 읽지 못했어요: ' + err.message); return; }
  const head = (rows[0] || []).map(x => String(x).replace(/\s+/g, '').toLowerCase());
  const col = names => head.findIndex(x => names.includes(x));
  const iCode = col(['제품코드', '상품코드', 'code', 'productcode', 'itemcode']), iBc = col(['바코드', 'barcode']), iName = col(['제품명', '상품명', 'name', 'productname']) >= 0 ? col(['제품명', '상품명', 'name', 'productname']) : head.findIndex((x, i) => i !== iCode && i !== iBc && /제품명|상품명|품명|이름|name/.test(x)); // '제품명(한글)'처럼 써도 찾음
  if (iCode < 0 || iBc < 0) { alert("첫 줄(머리글)에 '제품코드'와 '바코드'가 있어야 해요.\n'빈 양식 받기'로 받은 파일에 붙여넣어 올려주세요."); return; }
  // 이미 있는 바코드·제품코드는 바꾸지 않고 건너뜀 (사용자). 건너뛴 줄은 이 화면에만 한 번 보여줌
  toast('지금 등록된 바코드를 확인하는 중…');
  let exBc, exCode, exName;
  try {
    const all = await getDocs(collection(db, 'barcodes'));
    exBc = new Map(all.docs.map(d => [d.id, d.data().code])); exName = new Map(all.docs.map(d => [d.id, d.data().name || ''])); exCode = new Map(all.docs.map(d => [String(d.data().code), d.id]));
  } catch (err) { alert('등록된 바코드를 읽지 못했어요: ' + (err.code || err.message)); return; }
  const map = new Map(), skip = [], seenBc = new Map(), seenCode = new Map(), nameUpd = new Map(); let sameN = 0;
  rows.slice(1).forEach((r, i) => {
    const line = i + 2, bc = cellText(r[iBc]), code = code8(cellText(r[iCode])), name = iName >= 0 ? String(r[iName] ?? '').trim() : '';
    if (!bc && !code) return;
    if (bc && code && exBc.get(bc) === code) { // 이미 똑같이 등록된 줄: 제품명만 새로 있으면 제품명만 채움 (바코드·제품코드는 그대로)
      if (name && name !== exName.get(bc) && !nameUpd.has(bc)) nameUpd.set(bc, name); else sameN++;
      return;
    }
    const why = !bc ? '바코드 없음' : !code ? '제품코드 없음' : bc.includes('/') ? '바코드에 / 있음'
      : exBc.has(bc) ? `이미 있는 바코드 (등록된 제품코드 ${exBc.get(bc)})`
      : exCode.has(code) ? `이미 있는 제품코드 (등록된 바코드 ${exCode.get(code)})`
      : seenBc.has(bc) ? `파일 안에 같은 바코드가 또 있음 (${seenBc.get(bc)}번째 줄)`
      : seenCode.has(code) ? `파일 안에 같은 제품코드가 또 있음 (${seenCode.get(code)}번째 줄)` : '';
    if (why) { skip.push({ line, bc, code, name, why }); return; }
    seenBc.set(bc, line); seenCode.set(code, line);
    map.set(bc, { code, name });
  });
  const kinds = {};
  skip.forEach(x => { const k = x.why.replace(/ \(.*\)$/, ''); kinds[k] = (kinds[k] || 0) + 1; });
  if (!map.size && !nameUpd.size) {
    bcReport(skip, file.name, 0, sameN);
    alert(skip.length ? `새로 올릴 줄이 없어요.${sameN ? `\n(${sameN.toLocaleString()}줄은 이미 똑같이 등록돼 있어요)` : ''}\n건너뛴 줄은 화면 아래 목록에서 볼 수 있어요.` : `파일의 ${sameN.toLocaleString()}줄이 모두 이미 똑같이 등록돼 있어요. 새로 올릴 것이 없어요.`);
    return;
  }
  const go = h('button', { class: 'btn primary' }, map.size ? `${map.size.toLocaleString()}개 올리기${nameUpd.size ? ` · 제품명 ${nameUpd.size.toLocaleString()}개 채우기` : ''}` : `제품명 ${nameUpd.size.toLocaleString()}개 채우기`);
  const close = modal(h('div', {}, h('h3', {}, '바코드 엑셀 올리기'),
    h('ul', { class: 'steps' },
      h('li', {}, `새로 올릴 바코드 ${map.size.toLocaleString()}개`),
      nameUpd.size ? h('li', {}, `이미 등록된 바코드에 제품명만 채우기 ${nameUpd.size.toLocaleString()}개 (바코드·제품코드는 그대로)`) : null,
      sameN ? h('li', { class: 'mut' }, `이미 똑같이 등록된 줄 ${sameN.toLocaleString()}개 (그대로 둬요)`) : null,
      skip.length ? h('li', { class: 'warn' }, `건너뛰는 줄 ${skip.length.toLocaleString()}개 (이미 있는 것은 바꾸지 않아요)`,
        h('div', { class: 'mut' }, Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(' · '))) : null,
      iName < 0 ? h('li', { class: 'mut' }, '제품명 열이 없어요 (괜찮아요)') : null),
    h('p', { class: 'mut' }, '건너뛴 줄은 올린 뒤 이 화면 아래에 목록으로 보여드려요 (다른 화면으로 가면 사라져요).'),
    h('div', { class: 'modal-act' }, go)));
  go.onclick = async () => {
    go.disabled = true;
    const list = [...[...map].map(([bc, r]) => ['set', bc, r]), ...[...nameUpd].map(([bc, n]) => ['name', bc, n])]; let done = 0;
    try {
      for (let i = 0; i < list.length; i += 400) {
        const b = writeBatch(db);
        for (const [op, bc, r] of list.slice(i, i + 400)) {
          if (op === 'set') b.set(doc(db, 'barcodes', bc), { code: r.code, ...(r.name ? { name: r.name } : {}), updatedAt: serverTimestamp(), updatedBy: me() });
          else b.update(doc(db, 'barcodes', bc), { name: r, updatedAt: serverTimestamp(), updatedBy: me() });
        }
        await b.commit(); done = Math.min(list.length, i + 400); go.textContent = `올리는 중… ${done.toLocaleString()} / ${list.length.toLocaleString()}`;
      }
      close(); toast([map.size ? `바코드 ${map.size.toLocaleString()}개를 올렸어요` : '', nameUpd.size ? `제품명 ${nameUpd.size.toLocaleString()}개를 채웠어요` : '', skip.length ? `${skip.length}개는 건너뜀` : ''].filter(Boolean).join(' · ')); bcCount(); bcList(true);
      bcReport(skip, file.name, map.size, sameN);
    } catch (err) { alert(`올리다가 멈췄어요 (${done.toLocaleString()}개까지 저장됨): ${err.code || err.message}`); go.disabled = false; go.textContent = '다시 올리기'; }
  };
});
// 건너뛴 줄 알림: 이 화면에만, 한 번만 (다른 화면으로 가거나 닫으면 사라지고 저장하지 않음)
function bcReport(skip, fileName, okN, sameN = 0) {
  const box = $('#bc-report'); if (!box) return;
  if (!skip.length) { box.replaceChildren(); box.classList.add('hidden'); return; }
  const dl = h('button', { class: 'btn small ghost', onclick: async () => {
    try {
      const X = await loadXLSX(), ws = X.utils.aoa_to_sheet([['줄', '바코드', '제품코드', '제품명', '건너뛴 이유'], ...skip.map(x => [x.line, x.bc, x.code, x.name, x.why])]);
      skip.forEach((_, i) => { for (const c of ['B', 'C']) { const k = c + (i + 2); if (ws[k]) ws[k].t = 's'; } });
      ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 24 }, { wch: 44 }];
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, '건너뛴 줄'); X.writeFile(wb, `바코드_건너뛴줄_${fmtDate(new Date()).replace(/\./g, '')}.xlsx`);
    } catch (e) { alert(e.message); }
  } }, '엑셀로 받기');
  box.replaceChildren(
    h('div', { class: 'bc-rep-head' }, h('b', {}, `'${fileName}' 에서 건너뛴 줄 ${skip.length.toLocaleString()}개`), h('span', { class: 'mut' }, ` · 올린 줄 ${okN.toLocaleString()}개${sameN ? ` · 이미 똑같이 등록된 줄 ${sameN.toLocaleString()}개` : ''}`),
      h('span', { class: 'sp' }), dl, h('button', { class: 'modal-x bc-rep-x', title: '닫기', onclick: () => bcReport([], '', 0) }, '×')),
    h('p', { class: 'mut' }, '이미 있는 바코드·제품코드는 바꾸지 않았어요. 바꾸려면 아래 찾기에서 지우고 다시 올려주세요. 이 목록은 다른 화면으로 가면 사라져요.'),
    h('div', { class: 'bc-rep-wrap' }, h('table', { class: 'gl-table' },
      h('thead', {}, h('tr', {}, h('th', { style: 'width:56px' }, '줄'), h('th', { style: 'width:150px' }, '바코드'), h('th', { style: 'width:100px' }, '제품코드'), h('th', {}, '이유'))),
      h('tbody', {}, ...skip.slice(0, 500).map(x => h('tr', {}, h('td', {}, x.line), h('td', {}, x.bc), h('td', {}, x.code), h('td', {}, x.why)))))),
    ...(skip.length > 500 ? [h('p', { class: 'mut' }, `앞의 500개만 보여요. 전부는 '엑셀로 받기'로 보세요.`)] : []));
  box.classList.remove('hidden');
}

/* ---------- 3. 제품 찾기 (휴대폰용) ----------
   매장 고르기 → 바코드 사진 찍기(또는 입력) → barcodes/{바코드}로 제품코드 → 그 매장 최종 POG의 items[].code에서 찾기
   → POG 위치(위에서 몇 번째 선반·파이프, 왼쪽에서 몇 번째) + 그림에 강조 + 도면에서 그 매대(drawingRef) 강조.
   바코드 읽기: 휴대폰 기본 기능(BarcodeDetector, 안드로이드 크롬) → 없으면 ZXing(아이폰 등, 누를 때만 불러옴) */
const fd = { pogId: null, fixtures: null, shown: [], trs: {}, lang: 'ko', last: null, dwCache: new Map() };
const FD_EN = () => fd.lang !== 'ko';
const T = (ko, en) => FD_EN() ? en : ko;
function fdStores() { // 최종 POG가 있는 매장 (매장코드마다 가장 최근 최종본)
  const m = new Map();
  for (const p of state.pogs) {
    if (p.status !== 'final') continue;
    const k = String(p.storeCode || p.id), o = m.get(k);
    if (!o || (p.finalizedAt?.toMillis?.() || 0) > (o.finalizedAt?.toMillis?.() || 0)) m.set(k, p);
  }
  return [...m.values()].map(p => {
    const st = state.stores.find(x => String(x.code) === String(p.storeCode));
    const dwd = [...state.dwMap.values()].find(d => String(d.storeCode) === String(p.storeCode) && d.status === 'final');
    return { pog: p, name: (st && partnerBranch(st.partner, st.branch)) || (dwd && partnerBranch(dwd.partner, dwd.branch)) || dwd?.storeName || p.branchName || p.storeName || p.storeCode, code: p.storeCode, dw: dwd };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
// 1단계: 매장 카드 목록 (마지막으로 고른 매장은 '최근'). 2단계: 그 매장에서 바코드 찍기
function renderFdStores() {
  const box = $('#fd-stores'); if (!box) return;
  const list = fdStores(); let last = null;
  try { last = localStorage.getItem('fd-store'); } catch { }
  box.replaceChildren(...(list.length ? list.map(x => h('button', { type: 'button', class: 'fd-store-card' + (x.pog.id === last ? ' recent' : ''), onclick: () => fdChoose(x.pog.id) },
    h('div', { class: 'fd-sc-name' }, x.name),
    h('div', { class: 'fd-sc-sub' }, [x.code, x.dw ? T('도면 있음', 'Floor plan') : T('도면 없음', 'No floor plan')].filter(Boolean).join(' · ')),
    x.pog.id === last ? h('span', { class: 'fd-sc-recent' }, T('최근', 'Recent')) : null,
    h('span', { class: 'fd-sc-go' }, '›'))) : [h('div', { class: 'fd-card mut' }, T('볼 수 있는 매장이 없어요. 최종 POG가 있는 매장만 나와요.', 'No store available. Only stores with a final POG are shown.'))]));
  if (fd.pogId && !list.some(x => x.pog.id === fd.pogId)) fdStep(1);
  renderFdSeg();
}
function fdChoose(pogId) {
  try { localStorage.setItem('fd-store', pogId); } catch { }
  if (pogId !== fd.pogId || !fd.fixtures) fdOpen(pogId);
  fdStep(2);
}
function fdStep(n) {
  fd.step = n;
  $('#fd-step1').classList.toggle('hidden', n !== 1); $('#fd-step2').classList.toggle('hidden', n !== 2);
  $('#fd-back').classList.toggle('hidden', n !== 2);
  if (n === 1) { fd.pogId = null; fd.fixtures = null; fd.last = null; $('#fd-result').replaceChildren(); $('#fd-q').value = ''; renderFdStores(); }
  else renderFdSeg();
  window.scrollTo(0, 0);
}
$('#fd-back').onclick = () => fdStep(1);
async function fdOpen(pogId) {
  fd.pogId = pogId || null; fd.fixtures = null; fd.trs = {}; fd.last = null;
  $('#fd-result').replaceChildren();
  if (!pogId) { renderFdSeg(); return; }
  try {
    const [fs, ts] = await Promise.all([getDocs(query(collection(db, 'pogs', pogId, 'fixtures'), orderBy('order'))), getDocs(collection(db, 'pogs', pogId, 'translations')).catch(() => ({ docs: [] }))]);
    if (fd.pogId !== pogId) return;
    fd.fixtures = fs.docs.map(d => ({ id: d.id, ...d.data() }));
    fd.shown = composeFx(fd.fixtures);
    fd.trs = Object.fromEntries(ts.docs.map(d => [d.id, d.data()]).filter(([, d]) => d.out));
  } catch (e) { toast(T('POG를 읽지 못했어요: ', 'Could not load POG: ') + (e.code || e.message)); }
  renderFdSeg();
}
function renderFdSeg() { // 언어: 한국어·English는 늘, 그 밖의 언어는 번역이 있는 POG일 때
  const langs = [...new Set(['English', ...Object.keys(fd.trs || {})])];
  segButtons($('#fd-seg'), [['ko', '한국어'], ...langs.map(l => [l, l])], fd.lang, l => { fd.lang = l; fd.langSet = true; renderFdSeg(); if (fd.step !== 2) renderFdStores(); if (fd.last) fdShow(fd.last); });
  renderFdStoresText();
}
function renderFdStoresText() {
  const cur = fd.pogId && fdStores().find(x => x.pog.id === fd.pogId);
  $('#fd-title').textContent = fd.step === 2 && cur ? cur.name : T('매장 선택', 'Choose a store');
  $('#fd-back-t').textContent = T('매장', 'Stores');
  $('#fd-pick-tip').textContent = T('제품을 찾을 매장을 골라주세요.', 'Choose the store to find products in.');
  $('#fd-cam-t').textContent = T('바코드 찍기', 'Scan barcode');
  $('#fd-q').placeholder = T('바코드 또는 제품코드', 'Barcode or item code');
  $('#fd-go').textContent = T('찾기', 'Find');
  $('#fd-tip').textContent = T('바코드가 화면에 크게, 흔들리지 않게 찍어주세요.', 'Take a close, steady photo of the barcode.');
}
// 사진에서 바코드 읽기
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
let zxP = null;
const loadZXing = () => zxP ||= new Promise((ok, no) => {
  if (window.ZXing) return ok(window.ZXing);
  const sc = h('script', { src: ZXING_URL }); sc.onload = () => ok(window.ZXing);
  sc.onerror = () => { zxP = null; no(new Error(T('바코드 읽기 도구를 불러오지 못했어요. 인터넷 연결을 확인해주세요.', 'Could not load the barcode reader. Check your connection.'))); };
  document.head.append(sc);
});
async function readBarcode(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error(T('사진을 열지 못했어요', 'Could not open the photo'));
  if ('BarcodeDetector' in window) {
    try { const r = await new window.BarcodeDetector().detect(bmp); if (r[0]?.rawValue) return r[0].rawValue; } catch { }
  }
  const Z = await loadZXing();
  // 크기를 몇 가지로 바꿔 가며 시도 (흰 여백을 붙여야 잘 읽힘)
  for (const max of [1200, 1800, 800, 2600]) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k), pad = 40;
    const c = h('canvas'); c.width = w + pad * 2; c.height = hh + pad * 2;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, pad, pad, w, hh);
    try {
      const rd = new Z.MultiFormatReader(); rd.setHints(new Map([[Z.DecodeHintType.TRY_HARDER, true]]));
      return rd.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))).getText();
    } catch { }
  }
  throw new Error(T('바코드를 읽지 못했어요. 더 가까이, 밝은 곳에서 다시 찍거나 숫자를 직접 넣어주세요.', 'Could not read the barcode. Try closer, in better light, or type the number.'));
}
$('#fd-photo').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!fd.pogId) { alert(T('먼저 매장을 골라주세요', 'Choose a store first')); return; }
  $('#fd-result').replaceChildren(h('div', { class: 'fd-card mut' }, T('바코드를 읽는 중…', 'Reading barcode…')));
  try { const code = await readBarcode(f); $('#fd-q').value = code; await fdFind(code); }
  catch (err) { $('#fd-result').replaceChildren(h('div', { class: 'fd-card fd-err' }, err.message)); }
});
$('#fd-form').addEventListener('submit', e => { e.preventDefault(); $('#fd-q').blur(); fdFind($('#fd-q').value); });
async function fdFind(q) {
  q = bcClean(q);
  if (!q) return;
  if (!fd.pogId) { alert(T('먼저 매장을 골라주세요', 'Choose a store first')); return; }
  if (!fd.fixtures) { toast(T('POG를 불러오는 중이에요', 'Loading POG…')); return; }
  let code = code8(q), barcode = null;
  try { const d = await getDoc(doc(db, 'barcodes', q)); if (d.exists()) { code = String(d.data().code); barcode = q; } } catch { }
  const hits = [];
  for (const fx of fd.shown) for (const it of fx.items || []) if (String(it.code) === code) hits.push({ fx, it });
  fd.last = { q, code, barcode, hits };
  fdShow(fd.last);
}
// POG 그림에서 몇 번째 단, 왼쪽에서 몇 번째인지
function fdPos(fx, it) {
  const g = it._g || 0, props = (fx.props || []).filter(p => (p._g || 0) === g && p.w >= 20);
  const cx = it.x + it.w / 2, bottom = it.y + it.h;
  const rows = [];
  for (const p of [...props].sort((a, b) => a.y - b.y)) { const last = rows.at(-1); if (last && Math.abs(last.y - p.y) <= 6) last.ps.push(p); else rows.push({ y: p.y, ps: [p] }); }
  const under = (r) => r.ps.some(p => cx >= p.x - 4 && cx <= p.x + p.w + 4);
  let best = null;
  rows.forEach((r, i) => {
    if (!under(r)) return;
    const pipe = r.ps.some(p => /파이프/.test(p.kind || '')), d = pipe ? it.y - r.y : r.y - bottom; // 선반: 제품 아래 / 파이프: 제품 위
    if (d >= -12 && (!best || d < best.d)) best = { i, d, pipe };
  });
  if (!best) return null;
  const row = rows[best.i];
  // 같은 단에 놓인 제품들의 가로 위치 → 왼쪽에서 몇 번째 (위아래로 쌓인 것은 한 칸)
  const onRow = (fx.items || []).filter(o => {
    if ((o._g || 0) !== g) return false;
    const ocx = o.x + o.w / 2, d = best.pipe ? o.y - row.y : row.y - (o.y + o.h);
    return d >= -12 && d < 60 && row.ps.some(p => ocx >= p.x - 4 && ocx <= p.x + p.w + 4);
  });
  const cols = [...new Set(onRow.map(o => Math.round((o.x + o.w / 2) / 8)))].sort((a, b) => a - b);
  const col = cols.indexOf(Math.round(cx / 8)) + 1;
  return { row: best.i + 1, rows: rows.length, pipe: best.pipe, col: col || null, cols: cols.length };
}
function fdShow({ q, code, barcode, hits }) {
  const box = $('#fd-result'), out = fd.lang !== 'ko' ? fd.trs[fd.lang]?.out : null;
  if (!hits.length) {
    box.replaceChildren(h('div', { class: 'fd-card fd-err' }, h('b', {}, q), h('div', {}, barcode
      ? T(`제품코드 ${code} · 이 매장 POG에 없는 제품이에요.`, `Item code ${code} · not in this store's POG.`)
      : T('등록된 바코드가 아니고, 이 매장 POG의 제품코드도 아니에요.', 'Not a registered barcode or an item code in this POG.'))));
    return;
  }
  const it0 = hits[0].it;
  const bcTd = h('span', {}, barcode || '…');
  if (!barcode) getDocs(query(collection(db, 'barcodes'), where('code', '==', code), limit(3))).then(s => { bcTd.textContent = s.docs.map(d => d.id).join(', ') || '-'; }).catch(() => { bcTd.textContent = '-'; });
  const nodes = [h('div', { class: 'fd-card fd-prod' },
    it0.img ? prodImg(it0.img, '', { fallback: false }) : h('div', { class: 'fd-noimg' }),
    h('div', { class: 'fd-pi' }, h('b', {}, it0.name || code),
      h('div', {}, T('제품코드 ', 'Item ') + code), h('div', {}, T('바코드 ', 'Barcode '), bcTd),
      it0.price ? h('div', {}, '₩' + Number(it0.price).toLocaleString()) : null,
      hits.length > 1 ? h('div', { class: 'fd-many' }, T(`이 매장에 ${hits.length}곳 있어요`, `${hits.length} locations in this store`)) : null))];
  hits.forEach(({ fx, it }, n) => {
    const part = (fx._parts || [fx])[it._g || 0] || fx, fxT = applyTr(fx, out?.[part.id] || out?.[fx.id]);
    const name = (out?.[part.id]?.headerName) || displayName(part), pos = fdPos(fx, it);
    const posTxt = !pos ? T('위치를 계산하지 못했어요 (집기 정보 없음)', 'Position unknown')
      : FD_EN() ? `${pos.pipe ? 'Pipe' : 'Shelf'} ${pos.row} from top${pos.col ? ` · ${ordinal(pos.col)} from left` : ''}`
      : `위에서 ${pos.row}번째 ${pos.pipe ? '파이프' : '선반'}${pos.col ? ` · 왼쪽에서 ${pos.col}번째` : ''}`;
    const W = Math.min(window.innerWidth - 56, 520), cv = buildCanvas(fxT, W, Math.round(W * 1.15));
    cv.classList.add('fd-dim');
    cv.querySelector(`.cv-item[data-id="${CSS.escape(String(it.id))}"]`)?.classList.add('fd-hit');
    const dwBox = h('div', { class: 'fd-dw' }, h('div', { class: 'mut' }, T('도면 불러오는 중…', 'Loading floor plan…')));
    nodes.push(h('div', { class: 'fd-card' },
      h('div', { class: 'fd-h' }, h('span', { class: 'fd-no' }, hits.length > 1 ? n + 1 : '📍'), h('div', {}, h('b', {}, name), h('div', { class: 'fd-pos' }, posTxt))),
      h('div', { class: 'fd-sub' }, 'POG'), h('div', { class: 'fd-cv' }, cv),
      h('div', { class: 'fd-sub' }, T('도면', 'Floor plan')), dwBox));
    fdDrawing(dwBox, part.drawingRef);
  });
  box.replaceChildren(...nodes);
  box.querySelector('.fd-card:nth-child(2)')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
async function fdDrawing(box, ref) {
  if (!ref?.storeId || !ref.vId) { box.replaceChildren(h('div', { class: 'mut' }, T('이 매대는 도면과 연결되지 않았어요.', 'This fixture is not linked to the floor plan.'))); return; }
  try {
    const key = `${ref.storeId}|${ref.vId}|${fd.lang}`;
    let c = fd.dwCache.get(key);
    if (!c) {
      const [v, t] = await Promise.all([getDoc(doc(db, 'drawings', ref.storeId, 'versions', ref.vId)),
        fd.lang !== 'ko' ? getDoc(doc(db, 'drawings', ref.storeId, 'translations', fd.lang)).catch(() => null) : null]);
      if (!v.exists()) throw new Error('no version');
      c = { v: { id: v.id, ...v.data() }, tr: t?.exists?.() ? t.data() : null }; fd.dwCache.set(key, c);
    }
    const en = fd.lang !== 'ko' && c.tr;
    box.replaceChildren(drawingView(c.v, en ? 'en' : 'ko', { only: ref.gid, plain: true, ctx: { vId: c.v.id, trDoc: c.tr || {}, lang: fd.lang } }));
    setTimeout(() => box.querySelector('.fd-on')?.scrollIntoView({ block: 'nearest', inline: 'center' }), 50);
  } catch { box.replaceChildren(h('div', { class: 'mut' }, T('도면을 불러오지 못했어요.', 'Could not load the floor plan.'))); }
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
// 새 계정 만들기: 관리자 로그인을 바꾸지 않도록 따로 띄운 Firebase(메모리에만)로 로그인 계정을 만들고 바로 로그아웃
const NEW_PW = '123456'; // 처음 비밀번호 (Firebase는 6자 이상만 됨). 각자 '비밀번호 바꾸기'로 바꿈
let makerAuth = null;
async function createLogin(email) {
  makerAuth ||= initializeAuth(initializeApp(firebaseConfig, 'account-maker'), { persistence: inMemoryPersistence });
  try { await createUserWithEmailAndPassword(makerAuth, email, NEW_PW); await signOut(makerAuth); return 'new'; }
  catch (e) { if (e.code === 'auth/email-already-in-use') return 'exists'; throw e; }
}
const levelSelect = v => {
  const keys = ASSIGNABLE.includes(v) ? ASSIGNABLE : [v, ...ASSIGNABLE];
  const sel = h('select', { class: 'acc-sel' }, ...keys.map(k => h('option', { value: k }, LEVELS[k])));
  sel.value = v; return sel;
};
function renderAccounts() {
  const body = $('#acc-body'); body.innerHTML = '';
  const me = state.user?.email.toLowerCase();
  const rows = [...state.roles].sort((a, b) => a.id.localeCompare(b.id));
  if (!rows.length) body.append(h('tr', {}, h('td', { colspan: 4, class: 'mut pad' }, '등록된 계정이 없어요.')));
  rows.forEach(r => {
    const sel = levelSelect(LEVELS[r.level] ? r.level : 'finder');
    sel.addEventListener('change', async () => {
      if (r.id === me && sel.value !== 'admin' && !confirm('내 계정의 관리자 권한을 내리면 계정 관리 화면에 다시 들어올 수 없어요. 계속할까요?')) { sel.value = r.level; return; }
      try { await updateDoc(doc(db, 'roles', r.id), { level: sel.value, updatedAt: serverTimestamp(), updatedBy: me }); toast('레벨을 바꿨어요'); }
      catch (e) { toast('저장 실패: ' + e.message); sel.value = r.level; }
    });
    // 바이어: 매장코드 앞 4자리 (그 4자리로 시작하는 매장의 최종 POG·도면만 보임)
    const pf = r.level === 'buyer' ? h('input', { class: 'acc-pf', maxlength: 4, placeholder: '앞 4자리', title: '매장코드 6자리 중 앞 4자리', value: r.prefix || '' }) : null;
    pf?.addEventListener('change', async () => {
      const v = pf.value.trim();
      if (!/^[0-9A-Za-z]{0,4}$/.test(v) || (v && v.length !== 4)) { toast('매장코드 앞 4자리를 넣어주세요 (숫자·영문 4글자)'); pf.value = r.prefix || ''; return; }
      try { await updateDoc(doc(db, 'roles', r.id), { prefix: v, updatedAt: serverTimestamp(), updatedBy: me }); toast(v ? `'${v}'로 시작하는 매장만 보여요` : '매장코드를 지웠어요 (아무 매장도 안 보여요)'); }
      catch (e) { toast('저장 실패: ' + e.message); pf.value = r.prefix || ''; }
    });
    body.append(h('tr', {},
      h('td', {}, r.id, r.id === me ? h('span', { class: 'acc-me' }, '나') : null,
        r.level === 'blocked' ? h('span', { class: 'acc-old' }, '접속 막힘 · 레벨을 고르면 다시 열려요') : ASSIGNABLE.includes(r.level) ? null : h('span', { class: 'acc-old' }, '레벨을 다시 골라주세요')),
      h('td', {}, sel),
      h('td', {}, pf || (r.level === 'buyer' ? null : h('span', { class: 'mut' }, '—')), r.level === 'buyer' && !r.prefix ? h('div', { class: 'acc-old' }, '4자리를 넣어야 매장이 보여요') : null),
      h('td', { class: 'tc acc-btns' },
        h('button', { class: 'btn ghost small', title: '이 사람에게 비밀번호를 새로 정하는 메일을 보내요', onclick: async () => {
          if (!confirm(`${r.id}(으)로 비밀번호 재설정 메일을 보낼까요?`)) return;
          try { await sendPasswordResetEmail(auth, r.id); toast('비밀번호 재설정 메일을 보냈어요'); } catch (e) { alert('보내지 못했어요: ' + (e.code || e.message)); }
        } }, '비밀번호 재설정 메일'),
        r.id === me ? null : r.level === 'blocked' ? null : h('button', { class: 'btn ghost danger small', onclick: async () => {
          if (!confirm(`'${r.id}' 계정의 접속을 막을까요?\n이 계정으로 로그인해도 아무것도 볼 수 없어요. 다시 쓰게 하려면 레벨을 다시 고르면 돼요.\n(로그인 계정 자체를 완전히 지우는 건 Firebase 콘솔에서만 돼요)`)) return;
          try { await updateDoc(doc(db, 'roles', r.id), { level: 'blocked', updatedAt: serverTimestamp(), updatedBy: me }); toast('접속을 막았어요'); } catch (e) { toast('저장 실패: ' + e.message); }
        } }, '삭제 (접속 막기)'))));
  });
}
$('#acc-add-level').append(...ASSIGNABLE.map(k => h('option', { value: k }, LEVELS[k])));
$('#acc-add-level').value = 'pog';
const accPf = () => $('#acc-add [name=prefix]').classList.toggle('hidden', $('#acc-add-level').value !== 'buyer');
$('#acc-add-level').addEventListener('change', accPf); accPf();
$('#acc-add').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, email = f.email.value.trim().toLowerCase();
  if (!email) return;
  if (state.roles.some(r => r.id === email && r.level !== 'blocked')) { toast('이미 있는 계정이에요. 목록에서 레벨을 바꾸세요'); return; }
  try {
    const pf = f.prefix.value.trim();
    if (f.level.value === 'buyer' && !/^[0-9A-Za-z]{4}$/.test(pf)) { toast('바이어는 매장코드 앞 4자리를 넣어주세요'); return; }
    const btn = f.querySelector('button'); btn.disabled = true;
    let made;
    try { made = await createLogin(email); } finally { btn.disabled = false; }
    await setDoc(doc(db, 'roles', email), { level: f.level.value, ...(f.level.value === 'buyer' ? { prefix: pf } : {}), createdAt: serverTimestamp(), updatedBy: state.user.email.toLowerCase() });
    f.email.value = ''; f.prefix.value = '';
    alert(made === 'new' ? `계정을 만들었어요.\n\n이메일: ${email}\n처음 비밀번호: ${NEW_PW}\n\n로그인한 뒤 오른쪽 위 '비밀번호 바꾸기'로 바꾸라고 알려주세요.`
      : `${email}은(는) 이미 로그인 계정이 있어서 레벨만 붙였어요.\n비밀번호를 모르면 목록에서 '비밀번호 재설정 메일'을 보내주세요.`);
  } catch (e) { alert(e.code === 'auth/invalid-email' ? '이메일 형식이 맞지 않아요.' : e.code === 'auth/admin-restricted-operation' || e.code === 'auth/operation-not-allowed' ? 'Firebase에서 계정 만들기가 꺼져 있어요. Firebase 콘솔 → Authentication → 설정 → 사용자 작업에서 \'만들기(가입) 사용 설정\'을 켜주세요.' : '만들지 못했어요: ' + (e.code || e.message)); }
});
