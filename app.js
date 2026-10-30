'use strict';
/*
  Pengawasan JPH - tanpa framework, tanpa backend PDF.

  ALUR (satu data, dua dokumen):
    1 Data pengawasan + tim   -> dipakai Instrumen dan BA
    2 Profil pelaku usaha     -> dipakai Instrumen (Bagian I) dan BA (data pelaku usaha, lokasi, PJ)
    3 Instrumen II-VI         -> Instrumen; ringkasannya menjadi "Hasil Pengawasan" di BA
    4 Saran dan Tindaklanjut  -> Instrumen saja (terpisah dari rekomendasi BA)
    5 BA                      -> hasil otomatis, rekomendasi manual + tanda tangan
    6 Cetak                   -> PDF Instrumen dan PDF BA (dialog cetak browser: "Simpan sebagai PDF")

  Data butir instrumen ada di instrumen.js. Tata letak cetak ada di styles.css (bagian "Area cetak").
  Logo kop adalah <img src="assets/logo.png"> biasa, jadi tampil juga saat index.html dibuka dari file://.
*/

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'bpjph_draft_v2';
const TIM_KEY = 'bpjph_tim_template_v2';
const LOGO_SRC = 'assets/logo.png'; // logo kop surat: path tetap
let toastTimer;
let pendingLoads = 0; // jumlah gambar yang sedang dimuat ke kanvas tanda tangan
let currentStep = 1;
const signatureHistory = new Map();
const signatureResizers = new Map();
let memberSignatureCount = -1;

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function todayIso() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function showToast(message, kind = 'ok') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}
function showStatus(message, kind = 'ok') { const el = $('status'); el.textContent = message; el.className = `status ${kind}`; }
function clearStatus() { $('status').className = 'status hidden'; }

// Normalisasi tanggal dari input form maupun Google Sheets.
// Cells tanggal yang sudah berformat Date dapat diterima sebagai objek Date/ISO datetime,
// bukan hanya string YYYY-MM-DD. Jangan menambahkan "T00:00:00" ke ISO datetime karena
// itu menghasilkan tanggal invalid dan memicu error "Invalid time value" pada Riwayat.
function parseDateValue(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Angka kecil dianggap serial date Google Sheets (epoch 30-12-1899).
    if (value > 100000) {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return Number.isNaN(utc.getTime()) ? null : new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
  }

  const text = String(value).trim();
  if (!text) return null;

  // ISO date-only dibuat sebagai tanggal lokal agar tidak bergeser zona waktu.
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
  }

  // ISO datetime dari Apps Script/JSON harus diparse sebagai instant, lalu
  // ditampilkan dalam zona waktu perangkat (mis. Asia/Jakarta). Nilai Date
  // Google Sheets sering terserialisasi sebagai 17:00Z pada hari sebelumnya.
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[Tt\s]/);
  if (match) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  // Format tanggal Indonesia yang mungkin pernah diketik/disimpan sebagai teks.
  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1]) ? date : null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateNarrative(value) {
  const d = parseDateValue(value);
  if (!d) return { weekday: '', day: '', month: '', year: '', full: '' };
  const month = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(d);
  const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(d);
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  return { weekday, day, month, year, full: `${day} ${month} ${year}` };
}

// "Rabu, 30 September 2026"
function tglPanjang(value) {
  const parts = formatDateNarrative(value);
  if (!parts.full) return '';
  const weekday = parts.weekday.charAt(0).toUpperCase() + parts.weekday.slice(1);
  return `${weekday}, ${parts.full}`;
}

const fileSafe = (s) => String(s || '').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'dokumen';

// ---------------------------------------------------------------------------
// State: satu-satunya sumber data untuk Instrumen dan BA
// ---------------------------------------------------------------------------
const freshState = () => ({
  meta: { tanggal: todayIso(), nomorSurat: '', tanggalSurat: '', tim: ['Imam Ardhi Rosyadi'] }, // tim[0] = Ketua Tim
  profil: {
    jenis: '', nama: '', lokasi: '', alamat: '', provinsi: 'Jawa Barat', kabkota: '', pj: '', hp: '',
    statusGerai: '', skala: '', dapur: '', gudang: '', penyelia: '', nik: '', sertifikat: ['']
  },
  nilai: {},                                            // id butir -> { v: 'S' | 'TS' | 'NA', ket }
  saran: [''],
  ba: { hasil: '', auto: true, rekom: '', ttdPJ: '', ttdTim: '', ttdAnggota: [], ttdDone: { ttdPJ: false, ttdTim: false, anggota: [] } },
  rec: { id: '', dibuat: '', diubah: '', pending: '' }, // data di Spreadsheet yang sedang diedit (kosong = data baru)
  dirty: false                                          // ada perubahan yang belum disimpan ke Spreadsheet
});
let S = freshState();

const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

// kolom teks sederhana: [id elemen, jalur di state, (opsional) pembersih nilai]
const BIND = [
  ['tanggalPengawasan', 'meta.tanggal'], ['nomorSuratTugas', 'meta.nomorSurat'], ['tanggalSuratTugas', 'meta.tanggalSurat'],
  ['profNama', 'profil.nama'], ['profLokasi', 'profil.lokasi'], ['profAlamat', 'profil.alamat'],
  ['profProvinsi', 'profil.provinsi'], ['profKabkota', 'profil.kabkota'],
  ['profPj', 'profil.pj'], ['profHp', 'profil.hp'], ['profPenyelia', 'profil.penyelia'],
  ['profNik', 'profil.nik', (v) => v.replace(/\D/g, '').slice(0, 16)]
];

const ketua = () => (S.meta.tim[0] || '').trim();
const timNames = () => S.meta.tim.map((s) => s.trim()).filter(Boolean);
const lokasiNama = () => S.profil.lokasi.trim() || S.profil.nama.trim();
const saranList = () => S.saran.map((s) => s.trim()).filter(Boolean);
const sertList = () => S.profil.sertifikat.map((s) => s.trim()).filter(Boolean);
const tahun = () => (S.meta.tanggal || todayIso()).slice(0, 4);

function merge(base, saved) {
  if (Array.isArray(base)) return Array.isArray(saved) && saved.length ? saved : base;
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = merge(base[k], saved && saved[k]);
    if (saved && typeof saved === 'object') for (const k of Object.keys(saved)) if (!(k in out)) out[k] = saved[k];
    return out;
  }
  return saved === undefined ? base : saved;
}

// ---------------------------------------------------------------------------
// Instrumen: persiapan data, penilaian, hitungan
// ---------------------------------------------------------------------------
function prepInstrumen() {
  const clean = (s) => s.replace(/^([a-z]\.|\u25CF)\s*/i, '').trim();
  const snippet = (s) => {
    const t = s.replace(/[.;]\s*$/, '');
    if (t.length <= 48) return t;
    const cut = t.slice(0, 48);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 30)).trim()}...`;
  };
  INSTRUMEN.forEach((sec) => {
    let parent = '', base = '';
    sec.baris.forEach((b, i) => {
      b.id = `${sec.kode}-${i + 1}`;
      const own = clean(b.uraian || '');
      if (b.no && own) parent = own.replace(/\s*\(.*?\)/g, '').trim();
      if (b.cont) { b.grup = base; b.nama = `${base}: ${snippet(b.spek)}`; }
      else {
        if (!b.no && own && parent) b.nama = `${parent} - ${own}`; else b.nama = own || snippet(b.spek);
        b.grup = b.nama; base = b.nama;
      }
    });
    sec.scored = sec.baris.filter((b) => b.scored);
    sec.groups = []; // baris lanjutan (cont) digabung dengan baris di atasnya
    sec.baris.forEach((b) => {
      if (b.cont && sec.groups.length) sec.groups[sec.groups.length - 1].push(b); else sec.groups.push([b]);
    });
  });
}

const nilaiOf = (id) => S.nilai[id] || { v: '', ket: '' };

function countSec(sec) {
  const c = { S: 0, TS: 0, NA: 0, belum: 0, total: sec.scored.length };
  sec.scored.forEach((b) => {
    const v = nilaiOf(b.id).v;
    if (v === 'S') c.S++; else if (v === 'TS') c.TS++; else if (v === 'NA') c.NA++; else c.belum++;
  });
  return c;
}
function countAll() {
  const t = { S: 0, TS: 0, NA: 0, belum: 0, total: 0 };
  INSTRUMEN.forEach((sec) => { const c = countSec(sec); for (const k in t) t[k] += c[k]; });
  return t;
}
function tsItems() {
  const out = [];
  INSTRUMEN.forEach((sec) => sec.scored.forEach((b) => {
    const n = nilaiOf(b.id);
    if (n.v === 'TS') out.push({ label: `${sec.kode}. ${b.nama}`, grup: `${sec.kode}. ${b.grup}`, ket: (n.ket || '').trim() });
  }));
  return out;
}

// "Hasil Pengawasan" BA: disusun otomatis dari penilaian Instrumen (tanpa input ulang)
function buildHasil() {
  const c = countAll();
  const parts = [`${c.S} butir sesuai`, `${c.TS} butir tidak sesuai`];
  if (c.NA + c.belum) parts.push(`${c.NA + c.belum} butir tidak berlaku/tidak dinilai`);
  const joined = parts.length === 3 ? `${parts[0]}, ${parts[1]}, dan ${parts[2]}` : `${parts[0]} dan ${parts[1]}`;
  const out = [`Pengawasan dilaksanakan melalui pengisian ${INSTRUMEN_NAMA_PANJANG} Tahun ${tahun()}. Dari ${c.total} butir pemeriksaan: ${joined}.`];
  const sert = sertList();
  if (sert.length) out.push(`Nomor Sertifikat Halal: ${sert.join(', ')}.`);
  const ts = tsItems();
  if (ts.length) {
    out.push('Butir yang tidak sesuai:');
    ts.forEach((t, i) => out.push(`${i + 1}. ${t.label}${t.ket ? ` - ${t.ket}` : ''}`));
  } else if (c.total - c.belum > 0) {
    out.push('Tidak ditemukan butir yang tidak sesuai.');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Formulir: daftar, chip, checklist
// ---------------------------------------------------------------------------
const LISTS = {
  tim: { box: 'timList', arr: () => S.meta.tim, placeholder: 'Nama anggota tim', first: 'Nama Ketua Tim', lockFirst: true },
  sert: { box: 'sertList', arr: () => S.profil.sertifikat, placeholder: 'Contoh: ID32110003387930523' },
  saran: { box: 'saranList', arr: () => S.saran, placeholder: 'Tulis saran / tindak lanjut', textarea: true }
};

function renderList(cfg) {
  const box = $(cfg.box);
  const arr = cfg.arr();
  box.textContent = '';
  arr.forEach((val, i) => {
    const input = h(cfg.textarea ? 'textarea' : 'input', {
      class: 'list-input', id: `${cfg.box}-${i}`, type: cfg.textarea ? null : 'text', rows: cfg.textarea ? 2 : null,
      placeholder: i === 0 && cfg.first ? cfg.first : cfg.placeholder, autocomplete: 'off'
    });
    input.value = val;
    input.addEventListener('input', () => { arr[i] = input.value; changed(); });
    const del = h('button', { class: 'btn small ghost', type: 'button', title: 'Hapus baris', 'aria-label': 'Hapus baris' }, '\u00D7');
    del.hidden = i === 0 && !!cfg.lockFirst;
    del.disabled = false;
    del.addEventListener('click', () => {
      if (cfg.box === 'timList' && i > 0) {
        collect();
        S.ba.ttdAnggota.splice(i - 1, 1);
        S.ba.ttdDone.anggota.splice(i - 1, 1);
      }
      if (arr.length <= 1) arr[i] = '';
      else arr.splice(i, 1);
      if (!arr.length) arr.push('');
      renderList(cfg);
      changed();
    });
    box.appendChild(h('div', { class: 'list-row' }, h('span', { class: 'list-no' }, `${i + 1}.`), input, del));
  });
}
const renderLists = () => Object.values(LISTS).forEach(renderList);

function addToList(cfg, text = '') {
  const arr = cfg.arr();
  const replacesBlank = !!(text && arr.length && !String(arr[arr.length - 1] || '').trim());
  if (replacesBlank) arr[arr.length - 1] = text; else arr.push(text);
  if (cfg.box === 'timList' && !replacesBlank && arr.length > 1) {
    S.ba.ttdAnggota.push('');
    S.ba.ttdDone.anggota.push(false);
  }
  renderList(cfg);
  changed();
  const inputs = $(cfg.box).querySelectorAll('.list-input');
  if (!text) inputs[inputs.length - 1].focus();
}

const CHIPS = [
  { box: 'chipJenis', path: 'profil.jenis', opts: () => OPSI.jenis, other: 'jenisLain' },
  { box: 'chipStatusGerai', path: 'profil.statusGerai', opts: () => OPSI.statusGerai },
  { box: 'chipSkala', path: 'profil.skala', opts: () => OPSI.skala },
  { box: 'chipDapur', path: 'profil.dapur', opts: () => OPSI.dapur, other: 'dapurLain' },
  { box: 'chipGudang', path: 'profil.gudang', opts: () => OPSI.gudang, other: 'gudangLain' }
];
const otherOpen = {};

function renderChips() {
  CHIPS.forEach((c) => {
    const box = $(c.box);
    const val = getPath(S, c.path) || '';
    const opts = c.opts();
    const otherOn = !!c.other && (otherOpen[c.box] || (val && !opts.includes(val)));
    box.textContent = '';
    opts.forEach((o) => {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(val === o) }, o);
      b.addEventListener('click', () => { setPath(S, c.path, val === o ? '' : o); otherOpen[c.box] = false; renderChips(); changed(); });
      box.appendChild(b);
    });
    if (c.other) {
      const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': String(otherOn) }, 'Lainnya\u2026');
      b.addEventListener('click', () => {
        otherOpen[c.box] = !otherOn;
        if (!otherOn) setPath(S, c.path, '');
        renderChips(); changed();
        if (!otherOn) $(c.other).focus();
      });
      box.appendChild(b);
      const inp = $(c.other);
      inp.classList.toggle('hidden', !otherOn);
      if (otherOn) inp.value = opts.includes(val) ? '' : val;
    }
  });
}

function renderChecklist() {
  const root = $('instrumenList');
  root.textContent = '';
  INSTRUMEN.forEach((sec, idx) => {
    const det = h('details', { class: 'sec', 'data-sec': sec.kode });
    if (idx === 0) det.open = true;
    det.appendChild(h('summary', null,
      h('span', { class: 'sec-kode' }, sec.kode),
      h('span', { class: 'sec-judul' }, sec.pendek),
      h('span', { class: 'sec-count', id: `cnt-${sec.kode}` })));
    det.appendChild(h('div', { class: 'sec-tools' },
      h('button', { type: 'button', class: 'btn small secondary', 'data-act': 'all', 'data-sec': sec.kode }, 'Semua Sesuai'),
      h('button', { type: 'button', class: 'btn small ghost', 'data-act': 'clear', 'data-sec': sec.kode }, 'Kosongkan')));
    const list = h('div', { class: 'chk-list' });
    sec.baris.forEach((b) => list.appendChild(b.scored ? chkRow(b) : chkHead(b)));
    det.appendChild(list);
    root.appendChild(det);
  });
}

function chkHead(b) {
  return h('div', { class: 'chk-head' }, [b.no, b.uraian].filter(Boolean).join(' '), b.spek ? h('div', { class: 'chk-spek' }, b.spek) : null);
}
function chkRow(b) {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Penilaian' },
    h('button', { type: 'button', 'data-v': 'S', 'aria-pressed': 'false', title: 'Sesuai' }, 'S'),
    h('button', { type: 'button', 'data-v': 'TS', 'aria-pressed': 'false', title: 'Tidak sesuai' }, 'TS'),
    h('button', { type: 'button', 'data-v': 'NA', 'aria-pressed': 'false', title: 'Tidak berlaku' }, '\u2013'));
  const ket = h('input', { type: 'text', class: 'chk-ket hidden', placeholder: 'Keterangan (temuan di lapangan)', autocomplete: 'off', 'data-ket': b.id });
  const label = [b.no, b.uraian].filter(Boolean).join(' ');
  return h('div', { class: 'chk-row', 'data-id': b.id, 'data-v': '' },
    h('div', { class: 'chk-main' }, label ? h('div', { class: 'chk-label' }, label) : null, h('div', { class: 'chk-spek' }, b.spek)),
    seg, ket);
}

function paintRow(id) {
  const row = document.querySelector(`.chk-row[data-id="${id}"]`);
  if (!row) return;
  const n = nilaiOf(id);
  row.dataset.v = n.v;
  row.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === n.v)));
  const k = row.querySelector('.chk-ket');
  if (document.activeElement !== k) k.value = n.ket || '';
  k.classList.toggle('hidden', !(n.v === 'TS' || n.ket));
}
const paintAll = () => INSTRUMEN.forEach((sec) => sec.scored.forEach((b) => paintRow(b.id)));

function setNilai(id, v) {
  const cur = nilaiOf(id);
  const next = cur.v === v ? '' : v; // ketuk lagi = batal
  if (next || cur.ket) S.nilai[id] = { v: next, ket: cur.ket }; else delete S.nilai[id];
  paintRow(id);
  changed();
}
function setKet(id, text) {
  const cur = nilaiOf(id);
  if (cur.v || text) S.nilai[id] = { v: cur.v, ket: text }; else delete S.nilai[id];
  changed();
}
function bulk(kode, act) {
  const secs = kode === 'ALL' ? INSTRUMEN : INSTRUMEN.filter((s) => s.kode === kode);
  secs.forEach((sec) => sec.scored.forEach((b) => {
    const cur = nilaiOf(b.id);
    if (act === 'all') { if (!cur.v) S.nilai[b.id] = { v: 'S', ket: cur.ket }; } // hanya yang belum dinilai
    else delete S.nilai[b.id];
    paintRow(b.id);
  }));
  changed();
}

function renderSummary() {
  const c = countAll();
  const bar = $('summaryBar');
  bar.textContent = '';
  bar.append(
    h('span', { class: 'pill s' }, `Sesuai ${c.S}`),
    h('span', { class: 'pill ts' }, `Tidak sesuai ${c.TS}`),
    h('span', { class: 'pill na' }, `Tidak berlaku ${c.NA}`),
    h('span', { class: 'pill belum' }, `Belum dinilai ${c.belum}`),
    h('div', { class: 'progress' }, h('i', { style: `width:${Math.round(((c.total - c.belum) / c.total) * 100)}%` })));
  INSTRUMEN.forEach((sec) => {
    const k = countSec(sec);
    const el = $(`cnt-${sec.kode}`);
    if (!el) return;
    el.textContent = `${k.total - k.belum}/${k.total} dinilai${k.TS ? ` \u00B7 TS ${k.TS}` : ''}`;
    el.classList.toggle('done', k.belum === 0);
    el.classList.toggle('has-ts', k.TS > 0);
  });
}

// Ringkasan BA: hasil mengikuti Instrumen; rekomendasi berasal dari isian manual BA.
function renderDerived() {
  renderSummary();
  if (S.ba.auto) { S.ba.hasil = buildHasil(); $('baHasil').value = S.ba.hasil; }
  $('hasilMode').textContent = S.ba.auto ? 'Mode: otomatis (ikut berubah bila Instrumen diubah)' : 'Mode: diedit manual';

  const dl = $('baDerived');
  dl.textContent = '';
  const row = (label, value) => dl.append(h('dt', null, label), h('dd', { class: value ? '' : 'miss' }, value || 'belum diisi'));
  const surat = S.meta.nomorSurat.trim();
  row('Tanggal pengawasan', tglPanjang(S.meta.tanggal));
  row('Nomor surat tugas', surat ? `${surat}${S.meta.tanggalSurat ? ` (${formatDateNarrative(S.meta.tanggalSurat).full})` : ''}` : '');
  row('Lokasi usaha', lokasiNama() ? `${lokasiNama()}${S.profil.alamat.trim() ? ` - ${S.profil.alamat.trim()}` : ''}` : '');
  row('Pelaku usaha', S.profil.nama.trim());
  row('Penanggung jawab', [S.profil.pj.trim(), S.profil.hp.trim()].filter(Boolean).join(' / '));
  row('Ketua Tim', ketua());

  const ol = $('baRekom');
  ol.textContent = '';
  const rekom = recommendationLines();
  if (rekom.length) rekom.forEach((line) => ol.appendChild(h('li', null, line)));
  else ol.appendChild(h('li', { class: 'empty' }, 'Belum ada rekomendasi. Tulis secara manual pada kolom di atas.'));
  syncMemberSignaturePads();
  updateSignatureLabels();
  renderRecordUi();
}

function renderSaranUmum() {
  const box = $('saranUmum');
  box.textContent = '';
  SARAN_UMUM.forEach((text) => {
    const b = h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false' }, text);
    b.addEventListener('click', () => {
      if (S.saran.some((s) => s.trim() === text)) { showToast('Saran ini sudah ada di daftar.'); return; }
      addToList(LISTS.saran, text);
    });
    box.appendChild(b);
  });
}

// ---------------------------------------------------------------------------
// Simpan / muat draf, template Tim
// ---------------------------------------------------------------------------
function collect() {
  if (pendingLoads === 0) {
    try {
      const read = (canvas, previous = '') => {
        if (!canvas) return previous;
        // Gambar yang menunggu halaman tanda tangan dibuka tetap dipertahankan.
        if (canvas.dataset.pendingImage) return canvas.dataset.pendingImage;
        if (canvas.dataset.signatureEmpty === '1') return '';
        return hasInk(canvas) ? signatureDataUrl(canvas) : previous;
      };
      S.ba.ttdPJ = read($('ttdPJ'), S.ba.ttdPJ || '');
      S.ba.ttdTim = read($('ttdTim'), S.ba.ttdTim || '');
      S.ba.ttdAnggota = S.meta.tim.slice(1).map((_, i) => read($(`ttdAnggota-${i}`), S.ba.ttdAnggota[i] || ''));
    } catch (e) { /* kanvas belum siap */ }
  }
  S.savedAt = new Date().toISOString();
}

function saveDraft(silent = true) {
  collect();
  try {
    if (S.submitted) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(S));
    if (!silent && !S.submitted) showToast('Draf disimpan di perangkat ini.');
    if (!silent && S.submitted) showToast('Data sudah dikirim. Perubahan berikutnya akan menjadi draf baru.');
  } catch (e) {
    showStatus('Draf tidak dapat disimpan (penyimpanan browser penuh/dinonaktifkan).', 'warn');
  }
}
const scheduleSave = debounce(() => saveDraft(true), 600);

function changed() { S.dirty = true; S.submitted = false; renderDerived(); scheduleSave(); }
function touch() { S.dirty = true; S.submitted = false; scheduleSave(); renderRecordUi(); } // perubahan non-teks (tanda tangan)

function readTimTemplate() {
  try {
    const cur = JSON.parse(localStorage.getItem(TIM_KEY) || 'null');
    if (cur) return cur;
    // Migrasi: template Tim dari versi BA-saja (satu nama + tanda tangan) dibawa otomatis
    const lama = JSON.parse(localStorage.getItem('bpjph_tim_template_v1') || 'null');
    if (lama && (lama.name || lama.signature)) return { names: lama.name ? [lama.name] : [], signature: lama.signature || '' };
  } catch (e) { /* template rusak: abaikan */ }
  return null;
}

function loadState() {
  S = freshState();
  const tpl = readTimTemplate();
  if (tpl) {
    if (tpl.names && tpl.names.length) S.meta.tim = tpl.names.slice();
    S.ba.ttdTim = tpl.signature || '';
  }
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      S = merge(S, saved);
      // Migrasi satu kali: rekomendasi lama disalin ke kolom BA, lalu berdiri sendiri.
      if (!saved.ba || !Object.prototype.hasOwnProperty.call(saved.ba, 'rekom')) {
        S.ba.rekom = (saved.saran || []).map((v) => String(v || '').trim()).filter(Boolean).join('\n');
      }
    }
  } catch (e) { /* draf rusak: abaikan */ }
  S.ba.ttdAnggota = Array.isArray(S.ba.ttdAnggota) ? S.ba.ttdAnggota : [];
  S.ba.ttdDone = S.ba.ttdDone || { ttdPJ: false, ttdTim: false, anggota: [] };
  S.ba.ttdDone.anggota = Array.isArray(S.ba.ttdDone.anggota) ? S.ba.ttdDone.anggota : [];
  if (!S.ba.ttdTim && tpl && tpl.signature) S.ba.ttdTim = tpl.signature;
}

function applyState() {
  S.meta.tim = Array.isArray(S.meta.tim) && S.meta.tim.length ? S.meta.tim : [''];
  S.ba.ttdAnggota = Array.isArray(S.ba.ttdAnggota) ? S.ba.ttdAnggota : [];
  S.ba.ttdDone = S.ba.ttdDone || { ttdPJ: false, ttdTim: false, anggota: [] };
  S.ba.ttdDone.anggota = Array.isArray(S.ba.ttdDone.anggota) ? S.ba.ttdDone.anggota : [];
  while (S.meta.tim.length > 1) {
    const lastMember = S.meta.tim.length - 2;
    if (String(S.meta.tim[S.meta.tim.length - 1] || '').trim() || S.ba.ttdAnggota[lastMember] || S.ba.ttdDone.anggota[lastMember]) break;
    S.meta.tim.pop();
    S.ba.ttdAnggota.pop();
    S.ba.ttdDone.anggota.pop();
  }
  BIND.forEach(([id, path]) => { $(id).value = getPath(S, path) || ''; });
  renderLists();
  renderChips();
  paintAll();
  $('baHasil').value = S.ba.hasil;
  $('baRekomInput').value = S.ba.rekom || '';
  clearCanvas($('ttdPJ'));
  clearCanvas($('ttdTim'));
  if (S.ba.ttdPJ) loadImageToCanvas(S.ba.ttdPJ, $('ttdPJ'));
  if (S.ba.ttdTim) loadImageToCanvas(S.ba.ttdTim, $('ttdTim'));
  memberSignatureCount = -1;
  renderDerived();
  refreshAllSignatureControls();
}

function saveTimTemplate() {
  const names = timNames();
  if (!names.length) { showStatus('Isi nama Ketua Tim terlebih dahulu.', 'warn'); return; }
  const item = { names, signature: hasInk($('ttdTim')) ? signatureDataUrl($('ttdTim')) : (S.ba.ttdTim || '') };
  try { localStorage.setItem(TIM_KEY, JSON.stringify(item)); showToast('Template Tim Pengawas disimpan di perangkat.'); }
  catch (e) { showStatus('Template tidak dapat disimpan di browser ini.', 'warn'); }
}

function deleteTimTemplate() {
  localStorage.removeItem(TIM_KEY);
  S.ba.ttdTim = '';
  setSignatureDoneState('ttdTim', false);
  clearCanvas($('ttdTim'));
  touch();
  showToast('Template Tim Pengawas dihapus.');
}

function restoreTimSignature() {
  const tpl = readTimTemplate();
  setSignatureDoneState('ttdTim', false);
  S.ba.ttdTim = tpl && tpl.signature ? tpl.signature : '';
  clearCanvas($('ttdTim'));
  if (tpl && tpl.signature) loadImageToCanvas(tpl.signature, $('ttdTim'));
}

function resetForm() {
  if (!confirm('Mulai form baru? Semua isian pengawasan saat ini akan dihapus (template Tim tetap tersimpan).')) return;
  localStorage.removeItem(DRAFT_KEY);
  Object.keys(otherOpen).forEach((k) => delete otherOpen[k]);
  loadState();
  signatureHistory.clear();
  memberSignatureCount = -1;
  applyState();
  showStep(1, false);
  clearStatus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast('Form baru siap diisi.');
}

// ---------------------------------------------------------------------------
// Tanda tangan (kanvas)
// ---------------------------------------------------------------------------
function signatureDataUrl(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const alpha = pixels[i + 3];
      const dark = pixels[i] < 238 || pixels[i + 1] < 238 || pixels[i + 2] < 238;
      if (alpha > 8 && dark) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return '';
  const padPx = Math.max(10, Math.round(Math.min(canvas.width, canvas.height) * 0.04));
  minX = Math.max(0, minX - padPx); minY = Math.max(0, minY - padPx);
  maxX = Math.min(canvas.width - 1, maxX + padPx); maxY = Math.min(canvas.height - 1, maxY + padPx);
  const cropW = maxX - minX + 1, cropH = maxY - minY + 1;
  const scale = Math.min(1200 / cropW, 500 / cropH, 1);
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cropW * scale));
  out.height = Math.max(1, Math.round(cropH * scale));
  const outCtx = out.getContext('2d');
  outCtx.clearRect(0, 0, out.width, out.height);
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

function hasInk(canvas) {
  if (!canvas.width || !canvas.height) return false;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 4) {
    // Piksel kosong bernilai (0,0,0,0): alpha harus ikut dicek agar kanvas kosong tidak dianggap bertanda tangan.
    if (data[i + 3] > 8 && (data[i] < 238 || data[i + 1] < 238 || data[i + 2] < 238)) return true;
  }
  return false;
}

function signatureDoneState(id) {
  S.ba.ttdDone = S.ba.ttdDone || { ttdPJ: false, ttdTim: false, anggota: [] };
  S.ba.ttdDone.anggota = S.ba.ttdDone.anggota || [];
  if (id.startsWith('ttdAnggota-')) {
    const idx = Number(id.split('-')[1]);
    return !!S.ba.ttdDone.anggota[idx];
  }
  return !!S.ba.ttdDone[id];
}

function setSignatureDoneState(id, value) {
  S.ba.ttdDone = S.ba.ttdDone || { ttdPJ: false, ttdTim: false, anggota: [] };
  S.ba.ttdDone.anggota = S.ba.ttdDone.anggota || [];
  if (id.startsWith('ttdAnggota-')) {
    const idx = Number(id.split('-')[1]);
    S.ba.ttdDone.anggota[idx] = !!value;
  } else S.ba.ttdDone[id] = !!value;
}

function signatureStack(id) {
  if (!signatureHistory.has(id)) signatureHistory.set(id, { undo: [], redo: [] });
  return signatureHistory.get(id);
}

function canvasSnapshot(canvas) {
  if (!canvas.width || !canvas.height) return null;
  try { return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); }
  catch (e) { return null; }
}

function restoreCanvasSnapshot(canvas, snapshot) {
  if (!snapshot || !canvas.width || !canvas.height) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(snapshot, 0, 0);
  if (hasInk(canvas)) delete canvas.dataset.signatureEmpty; else canvas.dataset.signatureEmpty = '1';
  updateSignatureLabels();
  updateSignatureControls(canvas.id);
  touch();
}

function updateSignatureControls(id) {
  const canvas = $(id);
  if (!canvas) return;
  const locked = signatureDoneState(id);
  canvas.classList.toggle('is-locked', locked);
  canvas.setAttribute('aria-disabled', String(locked));
  // Status terkunci juga menonaktifkan pointer; saat dibuka kembali kanvas aktif lagi.
  canvas.style.pointerEvents = (locked || canvas.dataset.loadingImage === '1') ? 'none' : '';
  const state = signatureStack(id);
  const undo = document.querySelector(`[data-undo="${id}"]`);
  const redo = document.querySelector(`[data-redo="${id}"]`);
  const clear = document.querySelector(`[data-clear="${id}"]`);
  const finish = document.querySelector(`[data-finish="${id}"]`);
  if (undo) undo.disabled = locked || !state.undo.length;
  if (redo) redo.disabled = locked || !state.redo.length;
  if (clear) clear.disabled = locked || !hasInk(canvas);
  if (finish) {
    finish.textContent = locked ? 'Edit kembali' : 'Selesai tanda tangan';
    finish.classList.toggle('is-complete', locked);
  }
  const status = document.querySelector(`[data-sign-status="${id}"]`);
  if (status) status.textContent = locked ? 'Selesai · terkunci' : (hasInk(canvas) ? 'Tanda tangan tersedia · belum dikunci' : 'Belum ditandatangani');
}

function refreshAllSignatureControls() {
  ['ttdPJ', 'ttdTim', ...S.meta.tim.slice(1).map((_, i) => `ttdAnggota-${i}`)].forEach(updateSignatureControls);
}

function setupSignatureCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const id = canvas.id;
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return; // canvas dalam tab tersembunyi: tunggu halaman dibuka
    const old = canvas.width && canvas.height && hasInk(canvas) ? canvas.toDataURL('image/png') : '';
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const c = canvas.getContext('2d', { willReadFrequently: true });
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 2.2; c.strokeStyle = '#111111';
    c.clearRect(0, 0, rect.width, rect.height);
    signatureHistory.set(id, { undo: [], redo: [] });
    const pending = canvas.dataset.pendingImage || old;
    delete canvas.dataset.pendingImage;
    if (pending) { delete canvas.dataset.signatureEmpty; loadImageToCanvas(pending, canvas); }
    else canvas.dataset.signatureEmpty = '1';
    updateSignatureControls(id);
  };
  signatureResizers.set(id, resize);
  const pos = (ev) => { const rect = canvas.getBoundingClientRect(); return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }; };
  let drawing = false;
  let last = null;
  let beforeStroke = null;

  canvas.addEventListener('pointerdown', (ev) => {
    if (signatureDoneState(id) || canvas.width === 0 || canvas.height === 0) return;
    drawing = true;
    beforeStroke = canvasSnapshot(canvas);
    last = pos(ev);
    if (canvas.setPointerCapture) canvas.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!drawing || signatureDoneState(id)) return;
    const p = pos(ev);
    const c = canvas.getContext('2d');
    c.beginPath(); c.moveTo(last.x, last.y); c.lineTo(p.x, p.y); c.stroke();
    last = p;
    delete canvas.dataset.signatureEmpty;
  });
  const stop = () => {
    if (!drawing) return;
    drawing = false; last = null;
    if (beforeStroke) {
      const stack = signatureStack(id);
      stack.undo.push(beforeStroke);
      if (stack.undo.length > 30) stack.undo.shift();
      stack.redo = [];
    }
    beforeStroke = null;
    updateSignatureLabels();
    updateSignatureControls(id);
    touch();
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  resize();
}

function clearCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round((rect.width || 300) * ratio));
  const height = Math.max(1, Math.round((rect.height || 185) * ratio));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width / ratio, height / ratio);
  canvas.dataset.signatureEmpty = '1';
  delete canvas.dataset.pendingImage;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = '#111111';
  signatureHistory.set(canvas.id, { undo: [], redo: [] });
  updateSignatureLabels();
  updateSignatureControls(canvas.id);
}

function loadImageToCanvas(src, canvas) {
  if (!src) return;
  const rectNow = canvas.getBoundingClientRect();
  if (rectNow.width < 5 || rectNow.height < 5) {
    canvas.dataset.pendingImage = src;
    delete canvas.dataset.signatureEmpty;
    return;
  }
  delete canvas.dataset.signatureEmpty;
  delete canvas.dataset.pendingImage;
  const img = new Image();
  canvas.dataset.loadingImage = '1';
  canvas.style.pointerEvents = 'none';
  pendingLoads++;
  const done = () => {
    pendingLoads = Math.max(0, pendingLoads - 1);
    delete canvas.dataset.loadingImage;
    canvas.style.pointerEvents = signatureDoneState(canvas.id) ? 'none' : '';
    updateSignatureControls(canvas.id);
  };
  img.onload = () => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) {
      canvas.dataset.pendingImage = src;
      done();
      return;
    }
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const scale = Math.min((rect.width - 20) / img.width, (rect.height - 20) / img.height);
    const w = img.width * scale, hh = img.height * scale;
    ctx.drawImage(img, (rect.width - w) / 2, (rect.height - hh) / 2, w, hh);
    removeWhiteBackground(canvas);
    delete canvas.dataset.signatureEmpty;
    delete canvas.dataset.pendingImage;
    signatureHistory.set(canvas.id, { undo: [], redo: [] });
    done();
    updateSignatureLabels();
    updateSignatureControls(canvas.id);
  };
  img.onerror = done;
  img.src = src;
}

function undoSignature(id) {
  const canvas = $(id); const stack = signatureStack(id);
  if (!canvas || signatureDoneState(id) || !stack.undo.length) return;
  const current = canvasSnapshot(canvas); if (current) stack.redo.push(current);
  restoreCanvasSnapshot(canvas, stack.undo.pop());
  updateSignatureControls(id);
}

function redoSignature(id) {
  const canvas = $(id); const stack = signatureStack(id);
  if (!canvas || signatureDoneState(id) || !stack.redo.length) return;
  const current = canvasSnapshot(canvas); if (current) stack.undo.push(current);
  restoreCanvasSnapshot(canvas, stack.redo.pop());
  updateSignatureControls(id);
}

function clearSignature(id) {
  const canvas = $(id);
  if (!canvas || signatureDoneState(id)) return;
  const before = canvasSnapshot(canvas);
  if (before && hasInk(canvas)) {
    const stack = signatureStack(id); stack.undo.push(before); stack.redo = [];
  }
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvas.dataset.signatureEmpty = '1';
  delete canvas.dataset.pendingImage;
  if (id === 'ttdPJ' || id === 'ttdTim') S.ba[id] = '';
  else if (id.startsWith('ttdAnggota-')) S.ba.ttdAnggota[Number(id.split('-')[1])] = '';
  updateSignatureLabels(); updateSignatureControls(id); touch();
}

function finishSignature(id) {
  const canvas = $(id);
  if (!canvas) return;
  if (signatureDoneState(id)) {
    setSignatureDoneState(id, false);
    showToast('Tanda tangan dibuka kembali untuk diedit.');
  } else {
    if (!hasInk(canvas)) { showToast('Buat tanda tangan terlebih dahulu.'); return; }
    setSignatureDoneState(id, true);
    showToast('Tanda tangan selesai dan dikunci.');
  }
  updateSignatureControls(id); touch(); saveDraft(true);
}

function removeWhiteBackground(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    // Hasil upload (JPEG) berlatar putih: jadikan putih/nyaris putih transparan.
    if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) d[i + 3] = 0;
  }
  ctx.putImageData(image, 0, 0);
}

function updateSignatureLabels() {
  const pj = $('ttdPJ'), tim = $('ttdTim');
  if (pj) $('labelPJ').textContent = signatureDoneState('ttdPJ') ? 'Selesai · terkunci' : (hasInk(pj) ? 'Tanda tangan tersedia' : 'Belum ditandatangani');
  if (tim) $('labelTim').textContent = (signatureDoneState('ttdTim') ? 'Selesai · terkunci' : (hasInk(tim) ? 'Tanda tangan tersedia' : 'Belum ada tanda tangan')) + (ketua() ? ` · ${ketua()}` : '');
  document.querySelectorAll('[data-sign-status]').forEach((el) => updateSignatureControls(el.dataset.signStatus));
}

function handleUploadTim(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { setSignatureDoneState('ttdTim', false); S.ba.ttdTim = reader.result; loadImageToCanvas(reader.result, $('ttdTim')); setTimeout(() => touch(), 300); };
  reader.readAsDataURL(file);
}

// ---------------------------------------------------------------------------
// Validasi
// ---------------------------------------------------------------------------
const common = () => [
  ['tanggalPengawasan', 'tanggal pengawasan', !!S.meta.tanggal],
  ['nomorSuratTugas', 'nomor surat tugas', !!S.meta.nomorSurat.trim()],
  ['timList-0', 'nama Ketua Tim', !!ketua()],
  ['profNama', 'nama pelaku usaha', !!S.profil.nama.trim()],
  ['profAlamat', 'alamat', !!S.profil.alamat.trim()],
  ['profProvinsi', 'provinsi', !!S.profil.provinsi.trim()],
  ['profKabkota', 'kabupaten/kota', !!S.profil.kabkota.trim()],
  ['profPj', 'nama penanggung jawab', !!S.profil.pj.trim()]
];

function requireFields(list) {
  document.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
  const miss = list.filter((x) => !x[2]);
  if (!miss.length) return true;
  miss.forEach(([id]) => { if (id && $(id)) $(id).classList.add('invalid'); });
  showStatus(`Lengkapi dulu: ${miss.map((m) => m[1]).join(', ')}.`, 'warn');
  const first = miss.find(([id]) => id && $(id));
  if (first) {
    const section = $(first[0]).closest('.step-card');
    const ids = ['sec-data', 'sec-profil', 'sec-instrumen', 'sec-saran', 'sec-ba', 'sec-cetak'];
    if (section) showStep(ids.indexOf(section.id) + 1);
    setTimeout(() => { $(first[0]).scrollIntoView({ behavior: 'smooth', block: 'center' }); if ($(first[0]).focus) $(first[0]).focus({ preventScroll: true }); }, 80);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cetak: PDF lewat dialog cetak bawaan browser. Logo = <img> biasa (tampil juga dari file://).
// ---------------------------------------------------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('gambar gagal dimuat'));
    img.src = src;
  });
}

// Potong gambar tanda tangan rapat ke goresan tinta, supaya CSS memusatkannya persis di kolomnya
// walau tanda tangan digambar di pojok kanvas.
async function trimSignature(dataUrl) {
  if (!dataUrl) return '';
  const img = await loadImage(dataUrl);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return '';
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

async function imagesReady(root) {
  await Promise.all([...root.querySelectorAll('img')].map(async (img) => {
    if (!img.complete) await new Promise((resolve) => { img.onload = img.onerror = resolve; });
    if (img.decode) { try { await img.decode(); } catch (e) { /* gambar rusak: dicek pemanggil */ } }
  }));
}

function logoMissingNote() {
  showStatus('PDF dibuat TANPA logo: file assets/logo.png tidak ditemukan. Pastikan ada di folder assets dan namanya persis logo.png (huruf kecil semua).', 'warn');
}

function printDoc(kind, fileName) {
  document.body.classList.remove('print-ba', 'print-instrumen');
  document.body.classList.add(`print-${kind}`);
  const oldTitle = document.title;
  document.title = fileName; // Chrome memakai judul halaman sebagai nama file PDF yang disarankan
  window.addEventListener('afterprint', () => {
    document.title = oldTitle;
    document.body.classList.remove(`print-${kind}`);
  }, { once: true });
  saveDraft(true);
  window.print();
}

// ---- Berita Acara: seluruh isi diturunkan dari state ----
function fillBA(ttdPJ, ttdTim, ttdAnggota = []) {
  const tgl = formatDateNarrative(S.meta.tanggal);
  const surat = S.meta.nomorSurat.trim()
    ? ` berdasarkan Surat Tugas Balai Penyelenggara Jaminan Produk Halal Provinsi Jawa Barat nomor ${S.meta.nomorSurat.trim()}${S.meta.tanggalSurat ? ` tanggal ${formatDateNarrative(S.meta.tanggalSurat).full}` : ''},`
    : '';
  $('paOpening').textContent = `Pada hari ${tgl.weekday} tanggal ${tgl.day} bulan ${tgl.month} tahun ${tgl.year} bertempat di Lokasi Usaha ${lokasiNama() || '-'} (${S.profil.alamat.trim() || '-'})${surat} telah melaksanakan pengawasan terhadap Pelaku Usaha kepada :`;

  const details = [
    ['1.', 'Nama Pelaku Usaha', S.profil.nama],
    ['2.', 'Alamat', S.profil.alamat],
    ['3.', 'Penanggung Jawab', S.profil.pj],
    ['4.', 'No Handphone', S.profil.hp]
  ];
  const box = $('paDetails');
  box.textContent = '';
  details.forEach(([num, label, value]) => {
    box.appendChild(h('div', { class: 'pa-row' }, ...[num, label, ':', (value || '').trim() || '-'].map((t) => h('span', null, t))));
  });

  // Baris narasi dan butir temuan dibuat menjadi elemen terpisah agar indentasi konsisten.
  const hasilBox = $('paHasil');
  hasilBox.textContent = '';
  const hasilLines = String(S.ba.hasil || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  let list = null;
  hasilLines.forEach((line) => {
    if (/^Butir yang tidak sesuai:?$/i.test(line)) {
      hasilBox.appendChild(h('p', { class: 'pa-list-heading' }, line));
      list = h('ol', { class: 'pa-hasil-list' }); hasilBox.appendChild(list); return;
    }
    const numbered = line.match(/^\d+[.)]\s*(.*)$/);
    if (numbered && list) list.appendChild(h('li', null, numbered[1]));
    else {
      list = null;
      hasilBox.appendChild(h('p', null, line));
    }
  });
  if (!hasilLines.length) hasilBox.textContent = '-';

  const rekomBox = $('paRekom');
  rekomBox.textContent = '';
  const rekom = recommendationLines();
  if (rekom.length) rekom.forEach((line) => rekomBox.appendChild(h('li', null, line)));
  else rekomBox.appendChild(h('li', null, '-'));

  $('paNamaPJ').textContent = `(${S.profil.pj.trim()})`;
  $('paNamaTim').textContent = `(${ketua()})`;
  $('paSigPJ').src = ttdPJ;
  $('paSigTim').src = ttdTim;

  const memberBox = $('paSignMembers');
  memberBox.textContent = '';
  const members = S.meta.tim.slice(1).map((name, i) => ({ name: String(name || '').trim(), signature: ttdAnggota[i] || '' })).filter((m) => m.name || m.signature);
  members.forEach((member) => {
    const card = h('div', { class: 'pa-member-sign' },
      h('div', { class: 'pa-sign-label' }, 'Tim Pengawas JPH - Anggota,'),
      h('div', { class: 'pa-sig-box' }, member.signature ? h('img', { class: 'pa-sig', alt: 'Tanda tangan anggota', src: member.signature }) : null),
      h('div', { class: 'pa-name' }, `(${member.name || '................................'})`));
    memberBox.appendChild(card);
  });
}

async function ttdPJData() { return trimSignature(S.ba.ttdPJ); }
async function ttdTimData() { return trimSignature(S.ba.ttdTim); }

async function printBA() {
  collect();
  if (!requireFields([
    ...common(),
    ['ttdPJ', 'tanda tangan Penanggung Jawab', hasInk($('ttdPJ'))],
    ['ttdTim', 'tanda tangan Ketua Tim', hasInk($('ttdTim'))]
  ])) return;
  clearStatus();
  const memberSources = S.meta.tim.slice(1).map((_, i) => S.ba.ttdAnggota[i] || '');
  const [ttdPJ, ttdTim, ...ttdAnggota] = await Promise.all([ttdPJData(), ttdTimData(), ...memberSources.map((src) => src ? trimSignature(src) : Promise.resolve(''))]);
  fillBA(ttdPJ, ttdTim, ttdAnggota);
  await imagesReady($('printBA'));
  const logo = $('paLogo');
  const logoOk = logo.complete && logo.naturalWidth > 0;
  logo.style.visibility = logoOk ? '' : 'hidden';
  if (!logoOk) logoMissingNote();
  printDoc('ba', `BA_Pengawasan_JPH_-_${fileSafe(lokasiNama())}`);
}

// ---- Instrumen: halaman disusun satu per satu agar nomor halaman dan kepala tabel berulang tepat ----
const colgroup = (widths) => h('colgroup', null, widths.map((w) => h('col', { style: `width:${w}pt` })));
const metaRow = (l, v) => h('div', null, h('span', { class: 'l' }, l), h('span', { class: 'c' }, ':'), h('span', { class: 'v' }, v));

function instrumenKop() {
  return h('div', null,
    h('div', { class: 'pi-kop' }, h('div', { class: 'pi-kop-inner' },
      h('img', { class: 'pi-logo', src: LOGO_SRC, alt: '' }),
      ...KOP.map((t, i) => h('div', { class: `pi-k${i + 1}` }, t)))),
    h('div', { class: 'pi-title' }, ...INSTRUMEN_JUDUL.map((t) => h('div', null, t)), h('div', null, `TAHUN ${tahun()}`)),
    h('div', { class: 'pi-meta' },
      metaRow('Tanggal Pengawasan', tglPanjang(S.meta.tanggal)),
      metaRow('Nomor Surat Tugas', S.meta.nomorSurat.trim()),
      metaRow('Nama Tim Pengawas', timNames().map((n, i) => `${i + 1}. ${n}`).join('\n'))));
}

function makeProfilTable() {
  const body = h('tbody');
  return { root: h('table', { class: 'pi-tbl pi-prof' }, colgroup([206, 14, 256]), body), body };
}
function profilGroups() {
  const p = S.profil;
  const pilih = (v) => (v ? `\u25CF ${v}` : '');
  const rows = [
    ['Jenis', pilih(p.jenis)],
    ['Nama', p.nama],
    ['Alamat', p.alamat],
    ['Provinsi', p.provinsi],
    ['Kabupaten /Kota', p.kabkota],
    ['Nama Penanggung Jawab', p.pj],
    ['Nomor HP Penanggungjawab', p.hp],
    ['Status Gerai:', pilih(p.statusGerai)],
    ['Skala Usaha', pilih(p.skala)],
    ['Dapur', pilih(p.dapur)],
    ['Gudang', pilih(p.gudang)],
    ['Penyelia Halal/Tim Manajemen Halal', [p.penyelia.trim() ? `Nama : ${p.penyelia.trim()}` : '', p.nik.trim() ? `NIK : ${p.nik.trim()}` : ''].filter(Boolean).join('\n')],
    ['Nomor Sertifikat Halal', sertList().map((s, i) => `${i + 1}. ${s}`).join('\n')]
  ];
  return rows.map(([l, v]) => [h('tr', null, h('td', { class: 'l' }, l), h('td', { class: 'c' }, ':'), h('td', { class: 'v' }, (v || '').trim()))]);
}

function makeChkTable() {
  const body = h('tbody');
  const head = h('thead', null,
    h('tr', null, h('th', { rowspan: 2 }, 'No'), h('th', { rowspan: 2 }, 'Uraian'), h('th', { rowspan: 2 }, 'Spesifikasi'),
      h('th', { colspan: 2 }, 'Kesesuaian'), h('th', { rowspan: 2 }, 'Keterangan')),
    h('tr', null, h('th', null, 'S'), h('th', null, 'TS')));
  return { root: h('table', { class: 'pi-tbl pi-chk' }, colgroup([26, 110, 170, 28, 30, 112]), head, body), body };
}
function chkGroupRows(group) {
  return group.map((b, i) => {
    const n = b.scored ? nilaiOf(b.id) : { v: '', ket: '' };
    const tr = h('tr');
    if (i === 0) {
      const span = group.length > 1 ? group.length : null;
      tr.append(h('td', { rowspan: span }, b.no), h('td', { rowspan: span }, b.uraian));
    }
    tr.append(h('td', null, b.spek), h('td', { class: 'ct' }, n.v === 'S' ? 'V' : ''), h('td', { class: 'ct' }, n.v === 'TS' ? 'V' : ''), h('td', null, (n.ket || '').trim()));
    return tr;
  });
}

function buildInstrumenPages() {
  const root = $('printInstrumen');
  root.textContent = '';
  root.classList.add('measuring'); // tampil di luar layar supaya tinggi elemen bisa diukur
  let content = null;
  const newSheet = () => {
    content = h('div', { class: 'pi-content' });
    root.appendChild(h('div', { class: 'pi-sheet' }, content,
      h('div', { class: 'pi-foot' }, h('span', { class: 'pi-code' }, INSTRUMEN_FOOTER), h('span', { class: 'pi-no' }))));
  };
  const fits = () => content.scrollHeight <= content.clientHeight;
  newSheet();

  // judul + kepala tabel + minimal satu grup baris selalu satu halaman; kepala tabel diulang di halaman lanjutan
  const flow = (titleFn, makeBox, groups) => {
    let box = null, titleEl = null, first = true;
    const begin = (withTitle) => {
      box = makeBox();
      titleEl = withTitle && titleFn ? titleFn() : null;
      if (titleEl) content.appendChild(titleEl);
      content.appendChild(box.root);
    };
    groups.forEach((els) => {
      const place = () => { els.forEach((e) => box.body.appendChild(e)); return fits(); };
      if (!box) begin(first);
      if (place()) { first = false; return; }
      els.forEach((e) => e.remove());
      if (box.body.children.length) { // tabel sudah berisi: lanjutkan di halaman baru
        newSheet(); begin(false);
      } else {                         // judul + kepala + grup ini tak muat: pindah seluruhnya
        if (titleEl) titleEl.remove();
        box.root.remove();
        if (content.children.length) newSheet();
        begin(first);
      }
      place(); // diterima apa adanya
      first = false;
    });
  };

  content.appendChild(instrumenKop());
  const judul = (t) => () => h('div', { class: 'pi-h' }, t);
  flow(judul('I. PROFIL PELAKU USAHA'), makeProfilTable, profilGroups());
  INSTRUMEN.forEach((sec) => {
    const items = sec.groups.map((g) => ({ els: chkGroupRows(g), keep: !g[0].scored })); // keep = baris judul
    const merged = [];
    let carry = [];
    items.forEach((it, i) => {
      if (it.keep && i < items.length - 1) carry = carry.concat(it.els);
      else { merged.push(carry.concat(it.els)); carry = []; }
    });
    flow(judul(`${sec.kode}. ${sec.judul}`), makeChkTable, merged);
  });

  const saran = saranList();
  const plain = () => { const d = h('div'); return { root: d, body: d }; };
  flow(() => h('div', { class: 'pi-saran-t' }, 'Saran dan Tindaklanjut untuk masa akan datang'), plain,
    (saran.length ? saran : ['-']).map((s, i) => [h('div', { class: 'pi-saran-i' }, saran.length ? `${i + 1}. ${s}` : s)]));

  const sheets = root.querySelectorAll('.pi-sheet');
  sheets.forEach((sh, i) => { sh.querySelector('.pi-no').textContent = String(i + 1); });
  root.classList.remove('measuring');
  return sheets.length;
}

async function printInstrumen() {
  collect();
  if (!requireFields(common())) return;
  const c = countAll();
  if (c.belum > 0 && !confirm(`${c.belum} butir belum dinilai dan akan dicetak kosong. Lanjutkan mencetak Instrumen?`)) return;
  clearStatus();
  buildInstrumenPages();
  await imagesReady($('printInstrumen'));
  const logo = $('printInstrumen').querySelector('.pi-logo');
  const logoOk = logo && logo.complete && logo.naturalWidth > 0;
  if (logo && !logoOk) { logo.style.visibility = 'hidden'; logoMissingNote(); }
  printDoc('instrumen', `Instrumen_Penyediaan_Mamin_-_${fileSafe(lokasiNama())}`);
}

// ---------------------------------------------------------------------------
// Spreadsheet: simpan, riwayat, edit, hapus (backend: Code.gs)
// ---------------------------------------------------------------------------
const KEY_STORE = 'bpjph_gas_key';
const gasUrl = () => String(APP_CONFIG.GOOGLE_APPS_SCRIPT_URL || '').trim();
const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
const fail = (code, message, data) => Object.assign(new Error(message), { code, data });
const fmtWaktu = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
};

// Permintaan "sederhana" (GET tanpa header khusus, POST form-urlencoded) agar lolos CORS tanpa preflight,
// sehingga respons Apps Script bisa dibaca browser. Syarat deployment: Who has access = Anyone.
async function gas(method, action, fields = {}) {
  if (!gasUrl()) throw fail('no-url', 'URL Google Apps Script belum diisi di config.js.');
  const call = async () => {
    const key = localStorage.getItem(KEY_STORE) || '';
    const params = { action, ...(key ? { key } : {}), ...fields };
    let res;
    try {
      if (method === 'GET') {
        const u = new URL(gasUrl());
        Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
        res = await fetch(u.toString());
      } else {
        res = await fetch(gasUrl(), { method: 'POST', body: new URLSearchParams(params) });
      }
    } catch (e) {
      throw fail('network', 'Tidak dapat terhubung ke Google Apps Script (jaringan, atau pengaturan akses/CORS). Pastikan deployment memakai "Who has access: Anyone" dan URL /exec benar.');
    }
    let j;
    try { j = JSON.parse(await res.text()); } catch (e) { throw fail('format', 'Respons Apps Script tidak terbaca. Pastikan URL /exec benar dan Code.gs sudah versi terbaru (Deploy > New version).'); }
    if (!j.ok) throw fail(j.error, j.error === 'unauthorized' ? 'Kunci akses salah atau belum diisi.' : (j.error || 'Permintaan gagal.'), j);
    return j;
  };
  try { return await call(); } catch (e) {
    if (e.code !== 'unauthorized') throw e;
    const k = prompt('Masukkan kunci akses Spreadsheet (ACCESS_KEY di Code.gs):');
    if (!k) throw e;
    localStorage.setItem(KEY_STORE, k.trim());
    try { return await call(); } catch (e2) { if (e2.code === 'unauthorized') localStorage.removeItem(KEY_STORE); throw e2; }
  }
}

// Tanda tangan untuk Spreadsheet: PNG kecil (tetap transparan, tajam untuk cetak ulang); bila masih terlalu besar
// untuk satu sel (batas 50.000 karakter), JPEG berlatar putih.
async function compactSignature(dataUrl) {
  if (!dataUrl) return '';
  const img = await loadImage(dataUrl);
  const k = Math.min(600 / img.naturalWidth, 240 / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * k)), hh = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = hh;
  c.getContext('2d').drawImage(img, 0, 0, w, hh);
  const png = c.toDataURL('image/png');
  if (png.length <= 45000) return png;
  const j = document.createElement('canvas');
  j.width = w; j.height = hh;
  const ctx = j.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); ctx.drawImage(img, 0, 0, w, hh);
  return j.toDataURL('image/jpeg', 0.75);
}

async function compactMemberSignature(dataUrl) {
  if (!dataUrl) return '';
  const img = await loadImage(dataUrl);
  const k = Math.min(320 / img.naturalWidth, 120 / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const hh = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = hh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
  ctx.drawImage(img, 0, 0, w, hh);
  return c.toDataURL('image/jpeg', 0.62);
}

async function buildRecord(id, extra = {}) {
  collect();
  const c = countAll();
  const p = S.profil;
  const lite = JSON.parse(JSON.stringify(S));
  lite.ba.ttdPJ = ''; lite.ba.ttdTim = ''; // tanda tangan utama disimpan di kolom sendiri
  lite.ba.ttdAnggota = await Promise.all((S.ba.ttdAnggota || []).map(compactMemberSignature));
  delete lite.rec; delete lite.dirty; delete lite.savedAt; delete lite.submitted;
  return {
    id, ...extra,
    tanggalPengawasan: S.meta.tanggal, nomorSuratTugas: S.meta.nomorSurat, tanggalSuratTugas: S.meta.tanggalSurat,
    timPengawas: timNames().join('; '),
    jenisUsaha: p.jenis, namaPelakuUsaha: p.nama, namaLokasi: lokasiNama(), alamat: p.alamat, provinsi: p.provinsi, kabKota: p.kabkota,
    penanggungJawab: p.pj, noHp: p.hp, statusGerai: p.statusGerai, skalaUsaha: p.skala, dapur: p.dapur, gudang: p.gudang,
    penyeliaHalal: p.penyelia, nikPenyelia: p.nik, nomorSertifikat: sertList().join('; '),
    jmlSesuai: c.S, jmlTidakSesuai: c.TS, jmlTidakBerlaku: c.NA, jmlBelumDinilai: c.belum,
    hasilPengawasan: S.ba.hasil, rekomendasi: S.ba.rekom || '', saran: saranList().join('\n'),
    ttdPenanggungJawab: await compactSignature(S.ba.ttdPJ), ttdTim: await compactSignature(S.ba.ttdTim),
    state: JSON.stringify(lite),
    savedAt: S.savedAt, userAgent: navigator.userAgent
  };
}

// Banner mode edit + label tombol simpan mengikuti status data (baru / sedang diedit)
function renderRecordUi() {
  const banner = $('editBanner');
  if (S.rec.id) {
    const nama = lokasiNama() || S.profil.nama.trim() || '(tanpa nama)';
    banner.textContent = `Mengedit data tersimpan: ${nama}${S.rec.dibuat ? ` \u00B7 dibuat ${fmtWaktu(S.rec.dibuat)}` : ''}${S.dirty ? ' \u00B7 ada perubahan yang belum disimpan' : ''}`;
    banner.className = `edit-banner${S.dirty ? ' dirty' : ''}`;
  } else {
    banner.className = 'edit-banner hidden';
  }
  $('btnSimpanSpreadsheet').textContent = S.rec.id ? 'Perbarui di Spreadsheet' : 'Simpan ke Spreadsheet';
  $('btnSimpanBaru').classList.toggle('hidden', !S.rec.id);
}

// Simpan data baru, atau perbarui data yang sedang diedit (id yang sama = tidak membuat data ganda)
async function saveRecord(asNew = false) {
  collect();
  if (!requireFields(common())) return;
  if (!gasUrl()) { showStatus('URL Google Apps Script belum diisi di config.js.', 'warn'); return; }
  const editing = !asNew && !!S.rec.id;
  const id = asNew ? newId() : (S.rec.id || S.rec.pending || newId());
  const btns = [$('btnSimpanSpreadsheet'), $('btnSimpanBaru')];
  btns.forEach((b) => { b.disabled = true; });
  const send = async (force) => gas('POST', 'save', {
    payload: JSON.stringify(await buildRecord(id, { baseDiubah: editing ? S.rec.diubah : '', force: force ? '1' : '' }))
  });
  try {
    let r;
    try { r = await send(false); } catch (e) {
      if (e.code === 'conflict' && confirm('Data ini sudah diubah dari perangkat/sesi lain sejak Anda membukanya. Timpa dengan versi di layar ini?')) r = await send(true);
      else throw e;
    }
    S.rec = { id: r.id, dibuat: r.dibuat, diubah: r.diubah, pending: '' };
    S.dirty = false;
    S.submitted = true;
    localStorage.removeItem(DRAFT_KEY);
    renderRecordUi();
    showStatus(r.created ? 'Data tersimpan ke Spreadsheet.' : 'Perubahan tersimpan ke Spreadsheet.', 'ok');
    showToast(r.created ? 'Tersimpan ke Spreadsheet.' : 'Perubahan diperbarui.');
  } catch (e) {
    if (e.code === 'conflict') {
      showStatus('Penyimpanan dibatalkan: data di Spreadsheet lebih baru. Buka ulang dari Riwayat untuk melihat versi terbaru.', 'warn');
    } else if (e.code === 'network') {
      if (!asNew && !S.rec.id) S.rec.pending = id; // mungkin sudah terkirim: percobaan berikutnya memakai id yang sama
      saveDraft(true);
      showStatus(`${e.message} Data mungkin sudah tersimpan; cek tab "Pengawasan" di Spreadsheet.`, 'warn');
    } else {
      showStatus(`Gagal menyimpan: ${e.message}`, 'error');
    }
  } finally {
    btns.forEach((b) => { b.disabled = false; });
  }
}

// ---- Riwayat ----
let riwayatItems = [];

function riwayatInfo(text, kind = 'ok') {
  const el = $('riwayatInfo');
  if (!text) { el.className = 'status hidden'; return; }
  el.textContent = text;
  el.className = `status ${kind}`;
}

function openRiwayat() {
  $('riwayatPanel').classList.remove('hidden');
  document.body.classList.add('no-scroll');
  loadRiwayat();
}
function closeRiwayat() {
  $('riwayatPanel').classList.add('hidden');
  document.body.classList.remove('no-scroll');
}

async function loadRiwayat() {
  $('riwayatList').textContent = '';
  if (!gasUrl()) { riwayatInfo('URL Google Apps Script belum diisi di config.js. Lihat README bagian "Setup Spreadsheet".', 'warn'); return; }
  riwayatInfo('Memuat riwayat...');
  try {
    const r = await gas('GET', 'list');
    riwayatItems = r.items || [];
    riwayatInfo('');
    renderRiwayat();
  } catch (e) {
    riwayatInfo(e.message, e.code === 'network' ? 'warn' : 'error');
  }
}

function renderRiwayat() {
  const q = $('riwayatCari').value.trim().toLowerCase();
  const box = $('riwayatList');
  box.textContent = '';
  const items = riwayatItems.filter((it) => !q || [it.nama_pelaku_usaha, it.nama_lokasi, it.kab_kota, it.nomor_surat_tugas, it.penanggung_jawab, it.tanggal_pengawasan].join(' ').toLowerCase().includes(q));
  if (!items.length) {
    box.appendChild(h('p', { class: 'muted' }, riwayatItems.length ? 'Tidak ada data yang cocok dengan pencarian.' : 'Belum ada data tersimpan di Spreadsheet.'));
    return;
  }
  items.forEach((it) => {
    const aktif = it.id === S.rec.id;
    const buka = h('button', { type: 'button', class: 'btn small primary' }, aktif ? 'Muat ulang' : 'Buka / Edit');
    buka.addEventListener('click', () => openRecord(it));
    const hapus = h('button', { type: 'button', class: 'btn small danger' }, 'Hapus');
    hapus.addEventListener('click', () => deleteRecord(it));
    box.appendChild(h('div', { class: 'hist-item', 'data-id': it.id },
      h('div', { class: 'hist-title' }, it.nama_lokasi || it.nama_pelaku_usaha || '(tanpa nama)', aktif ? h('span', { class: 'badge' }, 'sedang dibuka') : null),
      h('div', { class: 'hist-meta' }, [it.tanggal_pengawasan ? formatDateNarrative(it.tanggal_pengawasan).full : '', it.kab_kota, it.nomor_surat_tugas].filter(Boolean).join(' \u00B7 ')),
      h('div', { class: 'hist-meta' }, `Pelaku usaha: ${it.nama_pelaku_usaha || '-'} \u00B7 PJ: ${it.penanggung_jawab || '-'}`),
      h('div', { class: 'hist-counts' },
        h('span', { class: 'pill s' }, `S ${it.jml_sesuai}`), h('span', { class: 'pill ts' }, `TS ${it.jml_tidak_sesuai}`),
        h('span', { class: 'pill na' }, `Tidak berlaku ${it.jml_tidak_berlaku}`),
        Number(it.jml_belum_dinilai) ? h('span', { class: 'pill belum' }, `Belum ${it.jml_belum_dinilai}`) : null),
      h('div', { class: 'hist-meta' }, `Diubah ${fmtWaktu(it.diubah)}`),
      h('div', { class: 'hist-actions' }, buka, hapus)));
  });
}

async function openRecord(it) {
  const blank = !(S.profil.nama.trim() || S.profil.alamat.trim() || S.meta.nomorSurat.trim() || Object.keys(S.nilai).length || saranList().length);
  if (S.dirty && !blank && !confirm('Form saat ini berisi perubahan yang belum disimpan. Ganti dengan data yang dipilih?')) return;
  riwayatInfo('Membuka data...');
  try {
    const r = await gas('GET', 'get', { id: it.id });
    const next = merge(freshState(), r.state || {});
    next.ba.ttdPJ = r.ttdPJ || '';
    next.ba.ttdTim = r.ttdTim || '';
    if (!Object.prototype.hasOwnProperty.call((r.state || {}).ba || {}, 'rekom')) next.ba.rekom = String(r.rekomendasi || r.saran || '').replace(/\r/g, '');
    next.ba.ttdAnggota = next.ba.ttdAnggota || [];
    next.ba.ttdDone = next.ba.ttdDone || { ttdPJ: false, ttdTim: false, anggota: [] };
    next.rec = { id: r.id, dibuat: r.dibuat, diubah: r.diubah, pending: '' };
    next.dirty = false;
    S = next;
    Object.keys(otherOpen).forEach((k) => delete otherOpen[k]);
    applyState();
    S.submitted = false;
    saveDraft(true);
    showStep(1, false);
    closeRiwayat();
    clearStatus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Data dibuka. Edit lalu ketuk Perbarui di Spreadsheet.');
  } catch (e) {
    riwayatInfo(`Gagal membuka data: ${e.message}`, e.code === 'network' ? 'warn' : 'error');
  }
}

async function deleteRecord(it) {
  const nama = it.nama_lokasi || it.nama_pelaku_usaha || '(tanpa nama)';
  if (!confirm(`Hapus data "${nama}" dari Spreadsheet?\n\nData dipindahkan ke tab "Terhapus" di Spreadsheet (bisa dipulihkan manual).`)) return;
  try {
    await gas('POST', 'delete', { id: it.id });
    riwayatItems = riwayatItems.filter((x) => x.id !== it.id);
    if (S.rec.id === it.id) { // data yang sedang diedit terhapus: form tetap ada sebagai data baru
      S.rec = { id: '', dibuat: '', diubah: '', pending: '' };
      S.dirty = true;
      saveDraft(true);
      renderRecordUi();
    }
    renderRiwayat();
    showToast('Data dihapus dari Spreadsheet.');
  } catch (e) {
    riwayatInfo(`Gagal menghapus: ${e.message}${e.code === 'network' ? ' Muat ulang riwayat untuk memastikan.' : ''}`, e.code === 'network' ? 'warn' : 'error');
  }
}

// ---------------------------------------------------------------------------
// Rekomendasi manual, anggota tanda tangan, dan navigasi model halaman
// ---------------------------------------------------------------------------
function recommendationLines() {
  return String(S.ba.rekom || '').split(/\r?\n/).map((line) => line.trim().replace(/^\s*(?:\d+[.)]|[-•])\s*/, '')).filter(Boolean);
}

function syncMemberSignaturePads() {
  const box = $('memberSignatures');
  if (!box) return;
  const members = S.meta.tim.slice(1);
  if (memberSignatureCount !== members.length || box.querySelectorAll('canvas').length !== members.length) {
    const oldData = members.map((_, i) => {
      const canvas = $(`ttdAnggota-${i}`);
      return (S.ba.ttdAnggota[i] || '') || (canvas && hasInk(canvas) ? signatureDataUrl(canvas) : '');
    });
    box.textContent = '';
    S.ba.ttdAnggota = members.map((_, i) => oldData[i] || S.ba.ttdAnggota[i] || '');
    S.ba.ttdDone.anggota = members.map((_, i) => !!S.ba.ttdDone.anggota[i]);
    members.forEach((name, i) => {
      const id = `ttdAnggota-${i}`;
      const panel = h('div', { class: 'signature-panel member-signature-panel' },
        h('div', { class: 'signature-title' },
          h('div', null, h('strong', null, `Anggota Tim ${i + 1}`), h('small', { 'data-member-name': String(i) }, String(name || '').trim() || 'Nama anggota belum diisi'), h('small', { 'data-sign-status': id }, 'Belum ditandatangani')),
          h('button', { class: 'btn small ghost', type: 'button', 'data-clear': id }, 'Hapus')),
        h('canvas', { class: 'signature-pad', id, 'aria-label': `Area tanda tangan anggota ${i + 1}` }),
        h('div', { class: 'signature-tools' },
          h('button', { class: 'btn small ghost', type: 'button', 'data-undo': id, disabled: true }, 'Undo'),
          h('button', { class: 'btn small ghost', type: 'button', 'data-redo': id, disabled: true }, 'Redo'),
          h('button', { class: 'btn small secondary', type: 'button', 'data-finish': id }, 'Selesai tanda tangan')));
      box.appendChild(panel);
      setupSignatureCanvas($(id));
      if (S.ba.ttdAnggota[i]) loadImageToCanvas(S.ba.ttdAnggota[i], $(id));
    });
    memberSignatureCount = members.length;
  } else {
    members.forEach((name, i) => {
      const label = box.querySelector(`[data-member-name="${i}"]`);
      if (label) label.textContent = String(name || '').trim() || 'Nama anggota belum diisi';
    });
  }
  refreshAllSignatureControls();
}

function stepId(n) {
  return ['sec-data', 'sec-profil', 'sec-instrumen', 'sec-saran', 'sec-ba', 'sec-cetak'][n - 1];
}
function showStep(n, scroll = true) {
  const step = Math.max(1, Math.min(6, Number(n) || 1));
  currentStep = step;
  document.querySelectorAll('.step-card').forEach((card, i) => {
    const active = i === step - 1;
    card.classList.toggle('is-active', active);
    card.hidden = !active;
    card.setAttribute('aria-hidden', String(!active));
  });
  document.querySelectorAll('.nav-step').forEach((btn) => {
    const active = Number(btn.dataset.step) === step;
    btn.classList.toggle('is-active', active);
    if (active) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
  });
  const names = ['Data Pengawasan', 'Profil Pelaku Usaha', 'Instrumen Pengawasan', 'Saran dan Tindaklanjut', 'Berita Acara', 'Simpan dan Cetak'];
  $('stepCounter').textContent = `Langkah ${step} dari 6`;
  $('stepName').textContent = names[step - 1];
  $('stepProgressBar').style.width = `${(step / 6) * 100}%`;
  saveDraft(true);
  if (step === 5) {
    requestAnimationFrame(() => {
      ['ttdPJ', 'ttdTim', ...S.meta.tim.slice(1).map((_, i) => `ttdAnggota-${i}`)].forEach((id) => {
        const resize = signatureResizers.get(id);
        if (resize) resize();
      });
      refreshAllSignatureControls();
    });
  }
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(function init() {
  prepInstrumen();
  $('dlKabkota').append(...KABKOTA_JABAR.map((k) => h('option', { value: k })));
  ['pa-k1', 'pa-k2', 'pa-k3', 'pa-k4', 'pa-k5'].forEach((cls, i) => { document.querySelector(`.${cls}`).textContent = KOP[i]; });
  renderChecklist();
  renderSaranUmum();
  setupSignatureCanvas($('ttdPJ'));
  setupSignatureCanvas($('ttdTim'));
  loadState();
  applyState();

  window.addEventListener('resize', () => {
    signatureResizers.forEach((resize) => resize());
  });

  BIND.forEach(([id, path, fix]) => {
    $(id).addEventListener('input', () => {
      let v = $(id).value;
      if (fix) { const f = fix(v); if (f !== v) { v = f; $(id).value = f; } }
      setPath(S, path, v);
      changed();
    });
  });
  $('baHasil').addEventListener('input', () => { S.ba.hasil = $('baHasil').value; S.ba.auto = false; renderDerived(); scheduleSave(); });
  $('baRekomInput').addEventListener('input', () => { S.ba.rekom = $('baRekomInput').value; renderDerived(); scheduleSave(); });
  $('btnHasilAuto').addEventListener('click', () => { S.ba.auto = true; renderDerived(); scheduleSave(); showToast('Hasil pengawasan disusun ulang dari Instrumen.'); });

  $('btnTambahAnggota').addEventListener('click', () => addToList(LISTS.tim));
  $('btnTambahSert').addEventListener('click', () => addToList(LISTS.sert));
  $('btnTambahSaran').addEventListener('click', () => addToList(LISTS.saran));
  $('btnPjSama').addEventListener('click', () => { S.profil.pj = S.profil.nama; $('profPj').value = S.profil.pj; changed(); });
  $('btnPenyeliaSama').addEventListener('click', () => { S.profil.penyelia = S.profil.pj; $('profPenyelia').value = S.profil.penyelia; changed(); });
  $('btnSaranDariTS').addEventListener('click', () => {
    const ts = tsItems();
    if (!ts.length) { showToast('Belum ada butir Tidak Sesuai.'); return; }
    let added = 0;
    const perGrup = new Map();
    ts.forEach((t) => {
      if (!perGrup.has(t.grup)) perGrup.set(t.grup, new Set());
      if (t.ket) perGrup.get(t.grup).add(t.ket);
    });
    perGrup.forEach((kets, grup) => {
      const line = `Agar pelaku usaha menindaklanjuti ketidaksesuaian pada ${grup.replace(/^[IVX]+\.\s*/, '')}${kets.size ? ` (${[...kets].join('; ')})` : ''}`;
      if (!S.saran.some((s) => s.trim() === line)) { addToList(LISTS.saran, line); added++; }
    });
    showToast(added ? `${added} saran ditambahkan.` : 'Semua butir sudah ada di daftar saran.');
  });

  $('instrumenList').addEventListener('click', (ev) => {
    const seg = ev.target.closest('.seg button');
    if (seg) { setNilai(seg.closest('.chk-row').dataset.id, seg.dataset.v); return; }
    const act = ev.target.closest('[data-act]');
    if (act) bulk(act.dataset.sec, act.dataset.act);
  });
  $('instrumenList').addEventListener('input', (ev) => { if (ev.target.matches('.chk-ket')) setKet(ev.target.dataset.ket, ev.target.value); });
  $('btnSemuaSesuai').addEventListener('click', () => { bulk('ALL', 'all'); showToast('Butir yang belum dinilai ditandai Sesuai.'); });

  CHIPS.filter((c) => c.other).forEach((c) => {
    $(c.other).addEventListener('input', () => { setPath(S, c.path, $(c.other).value.trim()); changed(); });
  });

  $('btnPdfInstrumen').addEventListener('click', printInstrumen);
  $('btnPdfBA').addEventListener('click', printBA);
  $('btnSimpanSpreadsheet').addEventListener('click', () => saveRecord(false));
  $('btnSimpanBaru').addEventListener('click', () => saveRecord(true));
  $('btnRiwayat').addEventListener('click', openRiwayat);
  $('btnTutupRiwayat').addEventListener('click', closeRiwayat);
  $('btnMuatRiwayat').addEventListener('click', loadRiwayat);
  $('riwayatCari').addEventListener('input', renderRiwayat);
  $('riwayatPanel').addEventListener('click', (ev) => { if (ev.target === $('riwayatPanel')) closeRiwayat(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('riwayatPanel').classList.contains('hidden')) closeRiwayat(); });
  $('btnSimpanDraft').addEventListener('click', () => saveDraft(false));
  $('btnResetForm').addEventListener('click', resetForm);
  $('btnResetTtd').addEventListener('click', () => {
    S.ba.ttdPJ = '';
    S.ba.ttdTim = '';
    S.ba.ttdAnggota = S.meta.tim.slice(1).map(() => '');
    S.ba.ttdDone = { ttdPJ: false, ttdTim: false, anggota: S.meta.tim.slice(1).map(() => false) };
    ['ttdPJ', 'ttdTim', ...S.meta.tim.slice(1).map((_, i) => `ttdAnggota-${i}`)].forEach((id) => {
      setSignatureDoneState(id, false);
      const canvas = $(id); if (canvas) clearCanvas(canvas);
    });
    restoreTimSignature(); touch();
  });
  $('btnSimpanTemplate').addEventListener('click', saveTimTemplate);
  $('btnHapusTemplate').addEventListener('click', deleteTimTemplate);
  $('uploadTtdTim').addEventListener('change', handleUploadTim);
  document.addEventListener('click', (ev) => {
    const clear = ev.target.closest('[data-clear]');
    const undo = ev.target.closest('[data-undo]');
    const redo = ev.target.closest('[data-redo]');
    const finish = ev.target.closest('[data-finish]');
    if (clear) clearSignature(clear.dataset.clear);
    else if (undo) undoSignature(undo.dataset.undo);
    else if (redo) redoSignature(redo.dataset.redo);
    else if (finish) finishSignature(finish.dataset.finish);
  });
  document.querySelectorAll('.nav-step').forEach((btn) => btn.addEventListener('click', () => showStep(btn.dataset.step)));
  document.querySelectorAll('[data-next]').forEach((btn) => btn.addEventListener('click', () => showStep(btn.dataset.next)));
  document.querySelectorAll('[data-prev]').forEach((btn) => btn.addEventListener('click', () => showStep(btn.dataset.prev)));
  document.querySelectorAll('.btn.small.ghost').forEach((btn) => {
    btn.addEventListener('pointerup', () => btn.classList.add('was-used'), { passive: true });
  });
  showStep(1, false);
})();