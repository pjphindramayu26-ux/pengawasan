/**
 * Backend tipis untuk Pengawasan JPH (Instrumen + BA): simpan, riwayat, edit, hapus.
 * PDF tetap 100% dibuat di browser pengguna.
 *
 * SETUP
 * 1. Buat / buka Google Spreadsheet.
 * 2. Extensions -> Apps Script, tempel file ini (ganti isi lama).
 * 3. Isi SPREADSHEET_ID. Sangat disarankan: isi ACCESS_KEY (kunci akses, lihat di bawah).
 * 4. Jalankan setupSheet() sekali (membuat tab "Pengawasan" dan "Terhapus").
 * 5. Deploy -> New deployment -> Web app (jika sudah pernah: Manage deployments -> edit -> New version).
 *      Execute as: Me
 *      Who has access: Anyone   <- wajib "Anyone" agar riwayat bisa dibaca dari browser
 * 6. Salin URL /exec ke config.js (GOOGLE_APPS_SCRIPT_URL).
 *
 * API (dipakai app.js)
 *   GET  ?action=list                  -> daftar ringkas, terbaru dulu (maks. LIST_LIMIT)
 *   GET  ?action=get&id=...            -> satu data lengkap untuk diedit
 *   POST action=save   payload=JSON    -> simpan baru ATAU perbarui (berdasarkan id)
 *   POST action=delete id=...          -> hapus (dipindah ke tab "Terhapus", bisa dipulihkan manual)
 */

const SPREADSHEET_ID = 'ISI_SPREADSHEET_ID_DI_SINI';
const SHEET_NAME = 'Pengawasan';
const TRASH_NAME = 'Terhapus';

// Kunci akses (opsional tetapi disarankan). Kosong = siapa pun yang tahu URL /exec bisa melihat,
// mengubah, dan menghapus data. Bila diisi, aplikasi meminta kunci ini sekali (disimpan di browser).
const ACCESS_KEY = '';

const MAX_CELL = 49000;   // batas Google Sheets 50.000 karakter per sel
const LIST_LIMIT = 300;   // jumlah data terbaru yang ditampilkan di Riwayat

// [nama kolom, kunci pada data dari aplikasi]. Kolom pertama WAJIB id. LIST_COLS kolom awal dipakai Riwayat.
const COLUMNS = [
  ['id', 'id'],
  ['dibuat', null],
  ['diubah', null],
  ['tanggal_pengawasan', 'tanggalPengawasan'],
  ['nomor_surat_tugas', 'nomorSuratTugas'],
  ['nama_pelaku_usaha', 'namaPelakuUsaha'],
  ['nama_lokasi', 'namaLokasi'],
  ['kab_kota', 'kabKota'],
  ['penanggung_jawab', 'penanggungJawab'],
  ['jml_sesuai', 'jmlSesuai'],
  ['jml_tidak_sesuai', 'jmlTidakSesuai'],
  ['jml_tidak_berlaku', 'jmlTidakBerlaku'],
  ['jml_belum_dinilai', 'jmlBelumDinilai'],
  ['tanggal_surat_tugas', 'tanggalSuratTugas'],
  ['tim_pengawas', 'timPengawas'],
  ['jenis_usaha', 'jenisUsaha'],
  ['alamat', 'alamat'],
  ['provinsi', 'provinsi'],
  ['no_hp', 'noHp'],
  ['status_gerai', 'statusGerai'],
  ['skala_usaha', 'skalaUsaha'],
  ['dapur', 'dapur'],
  ['gudang', 'gudang'],
  ['penyelia_halal', 'penyeliaHalal'],
  ['nik_penyelia', 'nikPenyelia'],
  ['nomor_sertifikat', 'nomorSertifikat'],
  ['hasil_pengawasan_ba', 'hasilPengawasan'],
  ['saran_tindak_lanjut', 'saran'],
  ['ttd_penanggung_jawab', 'ttdPenanggungJawab'],
  ['ttd_tim_pengawas', 'ttdTim'],
  ['state_json', 'state'],
  ['client_saved_at', 'savedAt'],
  ['user_agent', 'userAgent']
];
const LIST_COLS = 13;
// kolom teks: jangan diubah Sheets menjadi tanggal/angka
const TEXT_COLUMNS = ['id', 'dibuat', 'diubah', 'tanggal_pengawasan', 'nomor_surat_tugas', 'tanggal_surat_tugas',
  'no_hp', 'nik_penyelia', 'nomor_sertifikat'];

function headers_() {
  return COLUMNS.map(function (c) { return c[0]; });
}

function sheet_(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    const hdr = headers_().concat(name === TRASH_NAME ? ['dihapus_pada'] : []);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold');
    sh.setFrozenRows(1);
    hdr.forEach(function (h, i) {
      if (TEXT_COLUMNS.indexOf(h) >= 0 || h === 'dihapus_pada') sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
    });
  }
  return sh;
}

function setupSheet() {
  sheet_(SHEET_NAME);
  sheet_(TRASH_NAME);
  return 'OK';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorized_(p) {
  return !ACCESS_KEY || String(p.key || '') === ACCESS_KEY;
}

// Nilai aman untuk sel: batasi panjang, cegah teks dibaca sebagai rumus (=, +, -, @) di kolom non-teks.
function cell_(header, v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'number') return v;
  let s = String(v);
  if (s.length > MAX_CELL) s = s.slice(0, MAX_CELL);
  if (TEXT_COLUMNS.indexOf(header) < 0 && /^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function findRow_(sh, id) {
  id = String(id || '').trim();
  if (!id) return 0;
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return 0;
}

function list_() {
  const sh = sheet_(SHEET_NAME);
  const last = sh.getLastRow();
  if (last < 2) return { ok: true, total: 0, items: [] };
  const hdr = headers_().slice(0, LIST_COLS);
  const rows = sh.getRange(2, 1, last - 1, LIST_COLS).getValues();
  let items = rows.map(function (r) {
    const o = {};
    hdr.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  }).filter(function (o) { return o.id; });
  items.sort(function (a, b) { return String(b.diubah).localeCompare(String(a.diubah)); });
  return { ok: true, total: items.length, items: items.slice(0, LIST_LIMIT) };
}

function get_(id) {
  const sh = sheet_(SHEET_NAME);
  const rowNo = findRow_(sh, id);
  if (!rowNo) return { ok: false, error: 'Data tidak ditemukan (mungkin sudah dihapus).' };
  const hdr = headers_();
  const row = sh.getRange(rowNo, 1, 1, hdr.length).getValues()[0];
  const o = {};
  hdr.forEach(function (h, i) { o[h] = row[i]; });
  let state = {};
  try { state = JSON.parse(o.state_json || '{}'); } catch (e) { state = {}; }
  return {
    ok: true, id: String(o.id), dibuat: String(o.dibuat), diubah: String(o.diubah), state: state,
    ttdPJ: String(o.ttd_penanggung_jawab || ''), ttdTim: String(o.ttd_tim_pengawas || '')
  };
}

function save_(payloadText) {
  const data = JSON.parse(payloadText || '{}');
  const id = String(data.id || '').trim();
  if (!id) throw new Error('id kosong');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEET_NAME);
    const now = new Date().toISOString();
    const rowNo = findRow_(sh, id);
    let dibuat = now;
    if (rowNo) {
      const cur = sh.getRange(rowNo, 2, 1, 2).getValues()[0]; // dibuat, diubah
      dibuat = String(cur[0] || now);
      const base = String(data.baseDiubah || '');
      // data sudah diubah dari tempat lain sejak dibuka: minta konfirmasi dulu (kecuali force)
      if (!data.force && base && base !== String(cur[1])) return { ok: false, error: 'conflict', diubah: String(cur[1]) };
    }
    const row = COLUMNS.map(function (c) {
      if (c[0] === 'dibuat') return dibuat;
      if (c[0] === 'diubah') return now;
      return cell_(c[0], data[c[1]]);
    });
    if (rowNo) sh.getRange(rowNo, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return { ok: true, id: id, created: !rowNo, dibuat: dibuat, diubah: now };
  } finally {
    lock.releaseLock();
  }
}

function delete_(id) {
  id = String(id || '').trim();
  if (!id) throw new Error('id kosong');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_(SHEET_NAME);
    const rowNo = findRow_(sh, id);
    if (!rowNo) return { ok: false, error: 'Data tidak ditemukan (mungkin sudah dihapus).' };
    const hdr = headers_();
    const row = sh.getRange(rowNo, 1, 1, hdr.length).getValues()[0];
    const safe = row.map(function (v, i) {
      return typeof v === 'string' && TEXT_COLUMNS.indexOf(hdr[i]) < 0 && /^[=+\-@]/.test(v) ? "'" + v : v;
    });
    sheet_(TRASH_NAME).appendRow(safe.concat([new Date().toISOString()]));
    sh.deleteRow(rowNo);
    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (!p.action) return json_({ ok: true, service: 'Pengawasan JPH (Instrumen + BA)', sheet: SHEET_NAME });
    if (!authorized_(p)) return json_({ ok: false, error: 'unauthorized' });
    if (p.action === 'list') return json_(list_());
    if (p.action === 'get') return json_(get_(p.id));
    return json_({ ok: false, error: 'aksi tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  try {
    if (!authorized_(p)) return json_({ ok: false, error: 'unauthorized' });
    const action = p.action || 'save';
    if (action === 'save') return json_(save_(p.payload || (e.postData && e.postData.contents)));
    if (action === 'delete') return json_(delete_(p.id));
    return json_({ ok: false, error: 'aksi tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}