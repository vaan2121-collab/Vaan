'use strict';

/* =====================================================================
   Пиксельные текстуры 16×16 в духе Minecraft (рисуются на canvas)
   ===================================================================== */
function rng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}
function tint(rgb, k) {
  return 'rgb(' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v * k)))).join(',') + ')';
}
function makeTexture(seed, paint, size = 16) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const px = (x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); };
  paint(px, rng(seed));
  return c.toDataURL();
}

function planksTex(seed, base) {
  return makeTexture(seed, (px, rnd) => {
    const shift = Math.floor(rnd() * 8);
    for (let y = 0; y < 16; y++) {
      const row = y >> 2;
      const seam = ((row % 2 ? 4 : 12) + shift) % 16;
      for (let x = 0; x < 16; x++) {
        let k = 0.88 + rnd() * 0.14;
        if (y % 4 === 3) k = 0.62;
        else if (x === seam) k = 0.68;
        else if (rnd() < 0.08) k = 0.8;
        px(x, y, tint(base, k));
      }
    }
  });
}

function stoneTex(seed, base) {
  return makeTexture(seed, (px, rnd) => {
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push([rnd() * 16, rnd() * 16, 0.82 + rnd() * 0.3]);
    const owner = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let best = 0, bd = 1e9;
        pts.forEach((p, j) => {
          const dx = Math.min(Math.abs(x - p[0]), 16 - Math.abs(x - p[0]));
          const dy = Math.min(Math.abs(y - p[1]), 16 - Math.abs(y - p[1]));
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = j; }
        });
        owner[y * 16 + x] = best;
      }
    }
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const o = owner[y * 16 + x];
        const edge = owner[y * 16 + (x + 1) % 16] !== o || owner[((y + 1) % 16) * 16 + x] !== o;
        const k = edge ? 0.55 : pts[o][2] * (0.92 + rnd() * 0.12);
        px(x, y, tint(base, k));
      }
    }
  });
}

function noiseTex(seed, base) {
  return makeTexture(seed, (px, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const r = rnd();
        const k = r < 0.1 ? 0.65 : r > 0.94 ? 1.2 : 0.85 + rnd() * 0.2;
        px(x, y, tint(base, k));
      }
    }
  });
}

function blockTex(seed, base, speck) {
  return makeTexture(seed, (px, rnd) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let k = 0.92 + rnd() * 0.14;
        if (x === 0 || y === 0 || x === 15 || y === 15) k = 0.62;
        else if (x === 1 || y === 1) k = 1.2;
        else if (x === 14 || y === 14) k = 0.78;
        else if (rnd() < 0.09) { px(x, y, speck); continue; }
        px(x, y, tint(base, k));
      }
    }
  });
}

const CROWN = [
  '............',
  '............',
  '.Y...YY...Y.',
  '.YY..YY..YY.',
  '.YYY.YY.YYY.',
  '.YYYYYYYYYY.',
  '.YRYYBBYYRY.',
  '.YYYYYYYYYY.',
  '.DDDDDDDDDD.',
  '............',
  '............',
  '............'
];
function crownTex() {
  const colors = { Y: '#ffd83d', D: '#b8860b', R: '#e0202a', B: '#3cd3ff' };
  return makeTexture(1, px => {
    const filled = (x, y) => CROWN[y] && CROWN[y][x] && CROWN[y][x] !== '.';
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) {
        if (filled(x, y)) continue;
        if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) px(x, y, '#1a1000');
      }
    }
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 12; x++) if (filled(x, y)) px(x, y, colors[CROWN[y][x]]);
    }
  }, 12);
}

const plankTiles = [11, 22, 33].map(s => planksTex(s, [184, 143, 88]));
const stoneTiles = [44, 55, 66].map(s => stoneTex(s, [104, 104, 108]));

(function applyTextures() {
  const root = document.documentElement.style;
  const set = (name, data) => root.setProperty(name, `url("${data}")`);
  set('--tex-dirt', noiseTex(7, [134, 96, 67]));
  set('--tex-button', stoneTex(8, [125, 125, 125]));
  set('--tex-darkoak', planksTex(9, [96, 66, 38]));
  set('--tex-diamond', blockTex(10, [94, 226, 220], '#e4fffd'));
  set('--tex-redstone', blockTex(12, [178, 26, 10], '#5e0d04'));
  set('--tex-crown', crownTex());
})();

/* =====================================================================
   Правила русских шашек
   Доска — массив из 64 клеток. 1 / 2 — шашка / дамка игрока (внизу),
   -1 / -2 — шашка / дамка компьютера. Ход: { from, path, captured }.
   ===================================================================== */
const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const at = (r, c) => r * 8 + c;
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const promoRow = side => (side === 1 ? 0 : 7);

function initialBoard() {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) b[at(r, c)] = -1;
      else if (r > 4) b[at(r, c)] = 1;
    }
  }
  return b;
}

// Варианты взятия с клетки pos: для каждого направления — кого бьём и куда можно встать
function captureOptions(b, pos, king, side, captured) {
  const res = [];
  const r = pos >> 3, c = pos & 7;
  for (const [dr, dc] of DIRS) {
    let r1 = r + dr, c1 = c + dc;
    if (king) while (onBoard(r1, c1) && b[at(r1, c1)] === 0) { r1 += dr; c1 += dc; }
    if (!onBoard(r1, c1)) continue;
    const over = at(r1, c1);
    // своя шашка или уже побитая (турецкий удар запрещён) — дальше нельзя
    if (b[over] * side >= 0 || captured.includes(over)) continue;
    const lands = [];
    let r2 = r1 + dr, c2 = c1 + dc;
    while (onBoard(r2, c2) && b[at(r2, c2)] === 0) {
      lands.push(at(r2, c2));
      if (!king) break;
      r2 += dr; c2 += dc;
    }
    if (lands.length) res.push({ over, lands });
  }
  return res;
}

function captureStep(b, pos, king, side, path, captured, out) {
  const opts = captureOptions(b, pos, king, side, captured);
  if (!opts.length) {
    if (captured.length) out.push({ from: path[0], path: path.slice(), captured: captured.slice() });
    return;
  }
  for (const o of opts) {
    const cap2 = captured.concat(o.over);
    let lands = o.lands;
    // дамка обязана встать туда, откуда можно бить дальше
    if (king && lands.length > 1) {
      const cont = lands.filter(L => captureOptions(b, L, true, side, cap2).length > 0);
      if (cont.length) lands = cont;
    }
    for (const L of lands) {
      const k2 = king || (L >> 3) === promoRow(side); // дошла до края во время взятия — сразу дамка
      path.push(L);
      captureStep(b, L, k2, side, path, cap2, out);
      path.pop();
    }
  }
}

function getMoves(b, side) {
  const caps = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p * side <= 0) continue;
    b[i] = 0;
    captureStep(b, i, Math.abs(p) === 2, side, [i], [], caps);
    b[i] = p;
  }
  if (caps.length) return caps;

  const moves = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p * side <= 0) continue;
    const r = i >> 3, c = i & 7;
    const king = Math.abs(p) === 2;
    for (const [dr, dc] of DIRS) {
      if (!king) {
        if (dr !== -side) continue;
        if (onBoard(r + dr, c + dc) && b[at(r + dr, c + dc)] === 0) {
          moves.push({ from: i, path: [i, at(r + dr, c + dc)], captured: [] });
        }
      } else {
        let r2 = r + dr, c2 = c + dc;
        while (onBoard(r2, c2) && b[at(r2, c2)] === 0) {
          moves.push({ from: i, path: [i, at(r2, c2)], captured: [] });
          r2 += dr; c2 += dc;
        }
      }
    }
  }
  return moves;
}

function applyMove(b, m) {
  const nb = b.slice();
  let p = nb[m.from];
  nb[m.from] = 0;
  for (const c of m.captured) nb[c] = 0;
  const side = Math.sign(p);
  if (Math.abs(p) === 1 && m.path.some(s => (s >> 3) === promoRow(side))) p = 2 * side;
  nb[m.path[m.path.length - 1]] = p;
  return nb;
}

/* =====================================================================
   Компьютер
   ===================================================================== */
const ABORT = {};
let deadline = 0, nodes = 0;

// Оценка с точки зрения игрока (+ хорошо для игрока)
function evaluate(b, full) {
  let s = 0, count = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    count++;
    const r = i >> 3, c = i & 7;
    const v = Math.abs(p) === 2 ? 300 : 100;
    s += p > 0 ? v : -v;
    if (!full) continue;
    if (p === 1) {
      s += (7 - r) * 4;
      if (r === 7) s += 6;
      if (c >= 2 && c <= 5 && r >= 3 && r <= 4) s += 5;
      if (c === 0 || c === 7) s -= 3;
    } else if (p === -1) {
      s -= r * 4;
      if (r === 0) s -= 6;
      if (c >= 2 && c <= 5 && r >= 3 && r <= 4) s -= 5;
      if (c === 0 || c === 7) s += 3;
    } else if (r + c === 7) {
      s += p > 0 ? 15 : -15; // дамка на большаке
    }
  }
  // при перевесе выгодно меняться
  if (full && Math.abs(s) >= 100) s += Math.sign(s) * (24 - count) * 3;
  return s;
}

function negamax(b, side, depth, alpha, beta, ply, full) {
  if (deadline && (++nodes & 511) === 0 && performance.now() > deadline) throw ABORT;
  const moves = getMoves(b, side);
  if (!moves.length) return -100000 + ply;
  const capture = moves[0].captured.length > 0;
  // на глубине 0 досчитываем взятия, чтобы не «зевать» шашки
  if (depth <= 0 && (!capture || depth <= -8)) return side * evaluate(b, full);
  if (capture && moves.length > 1) moves.sort((x, y) => y.captured.length - x.captured.length);
  let best = -Infinity;
  for (const m of moves) {
    const v = -negamax(applyMove(b, m), -side, depth - 1, -beta, -alpha, ply + 1, full);
    if (v > best) {
      best = v;
      if (v > alpha) { alpha = v; if (alpha >= beta) break; }
    }
  }
  return best;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function bestByDepth(b, side, moves, depth, noise) {
  deadline = 0;
  let best = null, bestV = -Infinity;
  for (const m of moves) {
    const v = -negamax(applyMove(b, m), -side, depth - 1, -Infinity, Infinity, 1, false) + Math.random() * noise;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

function iterativeSearch(b, side, moves, ms) {
  deadline = performance.now() + ms;
  nodes = 0;
  let order = shuffle(moves.slice());
  let best = order[0];
  try {
    for (let d = 1; d <= 20; d++) {
      let alpha = -Infinity, bestMove = null;
      const results = [];
      for (const m of order) {
        const v = -negamax(applyMove(b, m), -side, d - 1, -Infinity, -alpha, 1, true);
        results.push({ m, v });
        if (v > alpha) { alpha = v; bestMove = m; }
      }
      best = bestMove;
      results.sort((x, y) => y.v - x.v);
      order = results.map(x => x.m);
      if (Math.abs(alpha) > 90000) break; // найден форсированный выигрыш или проигрыш
    }
  } catch (e) {
    if (e !== ABORT) throw e;
  }
  deadline = 0;
  return best;
}

function chooseMove(b, side, level) {
  const moves = getMoves(b, side);
  if (moves.length === 1) return moves[0];
  if (level === 'easy') {
    if (Math.random() < 0.65) return moves[Math.floor(Math.random() * moves.length)];
    return bestByDepth(b, side, moves, 1, 30);
  }
  if (level === 'medium') return bestByDepth(b, side, moves, 3, 25);
  return iterativeSearch(b, side, moves, 900);
}

/* =====================================================================
   Интерфейс
   ===================================================================== */
const $ = id => document.getElementById(id);
const boardEl = $('board');
const cells = [];
const LEVEL_NAMES = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };
const wait = ms => new Promise(r => setTimeout(r, ms));

const store = {
  get(k, d) {
    try { const v = localStorage.getItem('mcc.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('mcc.' + k, JSON.stringify(v)); } catch (e) { /* хранилище недоступно */ }
  }
};

const state = {
  board: initialBoard(),
  turn: 1,
  level: store.get('level', 'medium'),
  legal: [],
  selected: null,
  prefix: [],
  busy: false,
  over: false,
  last: null,
  quiet: 0,
  gameId: 0
};
const stats = { wins: store.get('wins', 0), losses: store.get('losses', 0) };
let musicOn = store.get('music', true);
let sfxOn = store.get('sfx', true);

function buildBoard() {
  for (let i = 0; i < 64; i++) {
    const r = i >> 3, c = i & 7;
    const dark = (r + c) % 2 === 1;
    const cell = document.createElement('div');
    cell.className = 'cell ' + (dark ? 'dark' : 'light');
    cell.style.backgroundImage = `url("${dark ? stoneTiles[(r * 3 + c) % 3] : plankTiles[(r + c * 2) % 3]}")`;
    if (dark) cell.addEventListener('click', () => onCellTap(i));
    boardEl.appendChild(cell);
    cells.push(cell);
  }
}

function pieceEl(v) {
  const d = document.createElement('div');
  d.className = 'piece ' + (v > 0 ? 'you' : 'cpu') + (Math.abs(v) === 2 ? ' king' : '');
  return d;
}

function matchingMoves() {
  return state.legal.filter(m => m.from === state.selected && state.prefix.every((s, k) => m.path[k] === s));
}

function nextTargets() {
  const k = state.prefix.length;
  const set = new Set();
  for (const m of matchingMoves()) if (m.path.length > k) set.add(m.path[k]);
  return set;
}

// Доска с учётом недоделанной цепочки взятий игрока
function displayBoard() {
  const b = state.board.slice();
  const ghosts = new Set();
  const pr = state.prefix;
  if (pr.length > 1) {
    const m = matchingMoves()[0];
    let p = b[state.selected];
    b[state.selected] = 0;
    if (p === 1 && pr.some(s => (s >> 3) === 0)) p = 2;
    b[pr[pr.length - 1]] = p;
    for (let k = 0; k < pr.length - 1; k++) ghosts.add(m.captured[k]);
  }
  return { b, ghosts };
}

function mustCapture() {
  return state.turn === 1 && state.legal.length > 0 && state.legal[0].captured.length > 0;
}

function render() {
  boardEl.querySelectorAll('.floater').forEach(e => e.remove());
  const { b, ghosts } = displayBoard();
  const targets = state.selected !== null ? nextTargets() : new Set();
  const current = state.selected !== null ? state.prefix[state.prefix.length - 1] : null;
  const showMust = mustCapture() && state.selected === null && !state.busy && !state.over;
  const movable = new Set(state.legal.map(m => m.from));

  cells.forEach((cell, i) => {
    cell.replaceChildren();
    if (b[i]) cell.appendChild(pieceEl(b[i]));
    cell.classList.toggle('ghost', ghosts.has(i));
    cell.classList.toggle('target', targets.has(i));
    cell.classList.toggle('selected', current === i);
    cell.classList.toggle('must', showMust && movable.has(i));
    cell.classList.toggle('last', !!state.last && (state.last.from === i || state.last.to === i));
  });

  let you = 0, cpu = 0;
  for (const p of state.board) { if (p > 0) you++; else if (p < 0) cpu++; }
  $('count-you').textContent = you;
  $('count-cpu').textContent = cpu;
  $('wins').textContent = stats.wins;
  $('losses').textContent = stats.losses;

  let text;
  if (state.over) text = 'Игра окончена';
  else if (state.turn === -1) text = 'ПК думает…';
  else if (state.prefix.length > 1) text = 'Руби дальше!';
  else if (mustCapture()) text = 'Нужно бить!';
  else text = 'Твой ход';
  $('status').textContent = text;
}

async function animatePath(path, val) {
  const src = cells[path[0]].querySelector('.piece');
  if (src) src.style.visibility = 'hidden';
  const size = cells[0].offsetWidth;
  const pos = i => ({ x: cells[i].offsetLeft, y: cells[i].offsetTop });
  const p0 = pos(path[0]);
  const fl = document.createElement('div');
  fl.className = 'floater';
  fl.style.width = fl.style.height = size + 'px';
  fl.style.left = p0.x + 'px';
  fl.style.top = p0.y + 'px';
  fl.appendChild(pieceEl(val));
  boardEl.appendChild(fl);
  fl.getBoundingClientRect(); // зафиксировать стартовую позицию перед анимацией

  for (let k = 1; k < path.length; k++) {
    const prev = pos(path[k - 1]), p = pos(path[k]);
    const dist = Math.abs(p.x - prev.x) / size;
    const dur = 140 + dist * 60;
    fl.style.transitionDuration = dur + 'ms';
    fl.style.transform = `translate(${p.x - p0.x}px, ${p.y - p0.y}px)`;
    await wait(dur + 20);
    Sound.move();
  }
}

function burst(i, v) {
  const cell = cells[i];
  const size = cell.offsetWidth;
  const colors = v > 0 ? ['#4aedd9', '#2cb5a7', '#d5fffb', '#1d8b80'] : ['#e3260f', '#9e1b0b', '#ff6b4a', '#5e0d04'];
  for (let k = 0; k < 12; k++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const s = Math.max(3, size * (0.08 + Math.random() * 0.07));
    p.style.width = p.style.height = s + 'px';
    p.style.left = cell.offsetLeft + size * (0.3 + Math.random() * 0.4) + 'px';
    p.style.top = cell.offsetTop + size * (0.3 + Math.random() * 0.4) + 'px';
    p.style.background = colors[k % colors.length];
    p.style.setProperty('--dx', (Math.random() - 0.5) * size * 1.4 + 'px');
    p.style.setProperty('--dy', -Math.random() * size * 0.9 + 'px');
    boardEl.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
}

async function onCellTap(i) {
  if (state.busy || state.over || state.turn !== 1) return;
  const targets = state.selected !== null ? nextTargets() : new Set();
  if (targets.has(i)) { await stepTo(i); return; }
  if (state.prefix.length > 1) return; // цепочку взятий нужно довести до конца

  if (state.board[i] > 0 && state.legal.some(m => m.from === i)) {
    state.selected = state.selected === i ? null : i;
    state.prefix = state.selected === null ? [] : [i];
  } else {
    state.selected = null;
    state.prefix = [];
  }
  render();
}

async function stepTo(i) {
  const from = state.prefix[state.prefix.length - 1];
  const val = displayBoard().b[from];
  const id = state.gameId;
  state.busy = true;
  await animatePath([from, i], val);
  if (id !== state.gameId) return;
  state.busy = false;
  state.prefix.push(i);
  const done = matchingMoves().find(m => m.path.length === state.prefix.length);
  if (done) finishMove(done);
  else render();
}

function finishMove(m) {
  const p = state.board[m.from];
  const mover = Math.sign(p);
  if (m.captured.length) {
    m.captured.forEach(i => burst(i, state.board[i]));
    Sound.capture();
  }
  state.board = applyMove(state.board, m);
  const to = m.path[m.path.length - 1];
  if (Math.abs(p) === 1 && Math.abs(state.board[to]) === 2) Sound.levelUp();

  state.quiet = m.captured.length || Math.abs(p) === 1 ? 0 : state.quiet + 1;
  state.last = { from: m.from, to };
  state.selected = null;
  state.prefix = [];
  state.turn = -mover;
  state.legal = getMoves(state.board, state.turn);
  render();

  if (!state.legal.length) { endGame(state.turn === 1 ? 'lose' : 'win'); return; }
  if (state.quiet >= 30) { endGame('draw'); return; }
  if (state.turn === -1) cpuTurn();
}

function cpuTurn() {
  const id = state.gameId;
  state.busy = true;
  render();
  setTimeout(async () => {
    if (id !== state.gameId) return;
    const m = chooseMove(state.board, -1, state.level);
    if (id !== state.gameId) return;
    await animatePath(m.path, state.board[m.from]);
    if (id !== state.gameId) return;
    state.busy = false;
    finishMove(m);
  }, 450);
}

function endGame(result) {
  state.over = true;
  if (result === 'win') stats.wins++;
  if (result === 'lose') stats.losses++;
  store.set('wins', stats.wins);
  store.set('losses', stats.losses);
  render();

  const id = state.gameId;
  setTimeout(() => {
    if (id !== state.gameId) return;
    const end = $('end');
    end.classList.toggle('lose', result === 'lose');
    const level = LEVEL_NAMES[state.level];
    if (result === 'win') {
      $('end-title').textContent = 'Победа!';
      $('end-text').textContent = `Все блоки ПК разрушены. Уровень: ${level}`;
      Sound.win();
    } else if (result === 'lose') {
      $('end-title').textContent = 'Вы проиграли!';
      $('end-text').textContent = `ПК оказался хитрее. Уровень: ${level}`;
      Sound.lose();
    } else {
      $('end-title').textContent = 'Ничья';
      $('end-text').textContent = '15 ходов дамками без взятий';
    }
    end.hidden = false;
  }, 800);
}

function newGame() {
  state.gameId++;
  state.board = initialBoard();
  state.turn = 1;
  state.selected = null;
  state.prefix = [];
  state.busy = false;
  state.over = false;
  state.last = null;
  state.quiet = 0;
  state.legal = getMoves(state.board, 1);
  $('end').hidden = true;
  render();
}

function setLevel(level) {
  state.level = level;
  store.set('level', level);
  document.querySelectorAll('.diff-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.level === level));
}

function updateSoundButtons() {
  $('music-btn').textContent = 'Музыка: ' + (musicOn ? 'Вкл' : 'Выкл');
  $('sfx-btn').textContent = 'Звуки: ' + (sfxOn ? 'Вкл' : 'Выкл');
}

document.querySelectorAll('.diff-btn').forEach(btn => btn.addEventListener('click', () => setLevel(btn.dataset.level)));

$('play').addEventListener('click', () => {
  Sound.init(); // звук на телефонах разрешён только после касания
  Sound.setSfx(sfxOn);
  Sound.setMusic(musicOn);
  $('start').hidden = true;
});

$('new-game').addEventListener('click', newGame);
$('again').addEventListener('click', newGame);
$('look').addEventListener('click', () => { $('end').hidden = true; });

$('music-btn').addEventListener('click', () => {
  musicOn = !musicOn;
  store.set('music', musicOn);
  Sound.setMusic(musicOn);
  updateSoundButtons();
});
$('sfx-btn').addEventListener('click', () => {
  sfxOn = !sfxOn;
  store.set('sfx', sfxOn);
  Sound.setSfx(sfxOn);
  updateSoundButtons();
});

buildBoard();
setLevel(state.level in LEVEL_NAMES ? state.level : 'medium');
updateSoundButtons();
newGame();
