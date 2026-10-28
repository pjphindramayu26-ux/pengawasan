# Pengawasan JPH - Instrumen & Berita Acara (Website Internal)

Satu aplikasi, dua dokumen PDF dari **satu kali input**:

1. **Instrumen Pengawasan Penyediaan Makanan dan/atau Minuman dengan Pengolahan** (Profil, Bagian II-VI, Saran dan Tindaklanjut).
2. **Berita Acara Hasil Pengawasan JPH (BA)**, yang dibuat setelah Instrumen terisi.

## Alur kerja

| Langkah | Yang dilakukan | Dipakai di |
|---|---|---|
| 1 Data | Tanggal pengawasan, nomor dan tanggal surat tugas, tim pengawas (nomor 1 = Ketua Tim) | Instrumen + BA |
| 2 Profil | Jenis, nama, alamat, penanggung jawab, status gerai, skala, dapur, gudang, penyelia halal, nomor sertifikat | Instrumen (Bagian I) + BA (pelaku usaha, lokasi, PJ, No HP) |
| 3 Instrumen | Tandai tiap butir II-VI: **S** sesuai, **TS** tidak sesuai, **-** tidak berlaku. Keterangan untuk butir yang perlu | Instrumen + **Hasil Pengawasan di BA (otomatis)** |
| 4 Saran | Saran dan Tindaklanjut | Instrumen + **Rekomendasi di BA (otomatis)** |
| 5 BA | Tinjau hasil otomatis (boleh diedit), lalu tanda tangan | BA |
| 6 Cetak | PDF Instrumen dan PDF BA | - |

### Tidak ada input ganda

- Nama, alamat, dan penanggung jawab diisi **sekali** di Profil; BA mengambilnya otomatis.
- **Hasil Pengawasan** di BA disusun otomatis dari penilaian Instrumen (jumlah sesuai/tidak sesuai/tidak berlaku, nomor sertifikat, daftar butir tidak sesuai beserta keterangannya). Teks boleh diedit; tombol *Susun ulang otomatis* mengembalikannya.
- **Rekomendasi** di BA = daftar **Saran dan Tindaklanjut** di Instrumen.
- **Ketua Tim** di BA = anggota tim nomor 1.
- Tanda tangan Penanggung Jawab digambar sekali (di bagian BA). Nama dan tanda tangan Ketua Tim disimpan sebagai **template** di perangkat, jadi tidak perlu diulang.
- Nama Usaha/Outlet (merek, mis. Na Donat) opsional, hanya untuk kalimat pembuka BA; bila kosong dipakai nama pelaku usaha.

### Cara cepat mengisi Instrumen

- Ketuk **Semua Sesuai (II-VI)** (atau per bagian), lalu ubah hanya butir yang berbeda. Tombol ini hanya mengisi butir yang **belum dinilai**; butir TS/tidak berlaku yang sudah Anda tandai tidak berubah.
- Ketuk tombol yang sama sekali lagi untuk membatalkan penilaian suatu butir.
- **Buat dari butir Tidak Sesuai** (bagian Saran) menyusun saran otomatis, satu baris per kelompok butir.
- Saran umum tersedia sebagai tombol sekali ketuk.
- Isian tersimpan otomatis sebagai draf di perangkat; tutup/muat ulang halaman tidak menghilangkan data. **Form Baru** mengosongkan semuanya (template Tim tetap).
- Data yang sudah disimpan ke Spreadsheet bisa dibuka lagi, diedit, atau dihapus lewat **Riwayat** (lihat bagian di bawah).

## PDF

PDF dibuat seluruhnya di browser dari area cetak HTML. Tidak ada proses di server dan tidak perlu internet.

Tombol **PDF Instrumen** dan **PDF Berita Acara** membuka dialog cetak browser. Pilih tujuan **Simpan sebagai PDF** (Save as PDF). Nama file sudah terisi otomatis, mis. `Instrumen_Penyediaan_Mamin_-_Na_Donat` dan `BA_Pengawasan_JPH_-_Na_Donat`.

- **Instrumen**: tata letak mengikuti template (kop, judul, tabel Profil, tabel II-VI dengan kolom No/Uraian/Spesifikasi/Kesesuaian S-TS/Keterangan, Saran dan Tindaklanjut). Halaman disusun otomatis: kepala tabel berulang di halaman lanjutan, baris yang digabung tidak terpisah, dan ada nomor halaman dengan kode dokumen di kaki.
- **BA**: bila muat jadi 1 halaman; bila tidak, berlanjut otomatis. Kalimat penutup "Demikian ..." dan blok tanda tangan selalu satu kesatuan.
- Bila ada butir yang belum dinilai, aplikasi menanyakan dulu sebelum mencetak Instrumen (butir itu akan dicetak kosong).

Tata letak cetak ada di `styles.css` (bagian "Area cetak", satuan pt). Teks kop surat ada di `instrumen.js` (`KOP`).

## Logo kop surat

Logo selalu diambil dari `assets/logo.png` (path tetap, tanpa pengaturan lain), dipasang sebagai `<img>` biasa. Karena itu tampil baik saat aplikasi dibuka dengan klik ganda (`file://`), server lokal, maupun hosting. Ukuran file bebas (mis. 1280 x 1280 px); tampilannya diatur CSS. Bila file tidak ditemukan, PDF tetap dibuat dan muncul peringatan. Pastikan namanya persis `logo.png` (huruf kecil semua).

## Isi folder

- `index.html` - UI/form mobile, plus area cetak BA (`#printBA`).
- `styles.css` - tampilan responsif, plus tata letak cetak BA dan Instrumen.
- `instrumen.js` - **data template**: butir Instrumen II-VI, pilihan cepat (jenis, skala, dll.), saran umum, daftar kab/kota Jawa Barat, teks kop. Bila template berubah, cukup ubah file ini.
- `app.js` - satu data (state), penilaian, hitungan, Hasil Pengawasan otomatis, tanda tangan, draf, dua pembuat PDF, kirim Spreadsheet.
- `config.js` - hanya URL Google Apps Script.
- `Code.gs` - backend minimal Google Apps Script: simpan, riwayat, edit, hapus (lihat Setup Spreadsheet).
- `assets/logo.png` - logo kop surat.

### Mengubah butir Instrumen

Di `instrumen.js`, tiap bagian berisi baris bertipe:

- `R(no, uraian, spesifikasi)` - butir yang dinilai (S/TS).
- `H(no, uraian, spesifikasi)` - baris judul tanpa penilaian.
- `C(spesifikasi)` - lanjutan butir di atasnya (kolom No/Uraian digabung).

Formulir, hitungan, Hasil Pengawasan, dan PDF ikut menyesuaikan.

## Riwayat: lihat, edit, hapus

Setelah data tersimpan ke Spreadsheet, tombol **Riwayat** (kiri atas, di bar navigasi) menampilkan semua data tersimpan, terbaru di atas, lengkap dengan pencarian (nama, kab/kota, nomor surat) dan jumlah S/TS.

- **Buka / Edit**: seluruh isian dipulihkan persis seperti saat disimpan (profil, penilaian tiap butir, saran, hasil BA, tim, dan kedua tanda tangan). Di bagian atas muncul banner *Mengedit data tersimpan*, dan tombol simpan berubah menjadi **Perbarui di Spreadsheet** (tidak membuat baris baru). PDF Instrumen dan BA bisa dicetak ulang dari data ini.
- **Simpan sebagai data baru**: menyalin isi form saat ini menjadi data baru tanpa mengubah data asalnya (berguna untuk pengawasan serupa di outlet lain).
- **Hapus**: data dipindahkan ke tab **Terhapus** di Spreadsheet (bukan dihapus permanen), jadi masih bisa dipulihkan manual dengan menyalin barisnya kembali.
- Bila data yang sama sudah diubah dari perangkat lain sejak dibuka, aplikasi meminta konfirmasi sebelum menimpanya.
- Bila ada perubahan yang belum disimpan, membuka data lain meminta konfirmasi dulu.
- Bila koneksi terputus saat menyimpan, data tetap aman di draf lokal; mencoba lagi memakai id yang sama sehingga tidak terbentuk data ganda.

## Setup Spreadsheet

Satu pengawasan = satu baris di tab **Pengawasan**: ringkasan yang terbaca (profil, jumlah S/TS/tidak berlaku, hasil, saran) ditambah kolom teknis untuk memulihkan data saat diedit (`state_json`, dua tanda tangan kecil). Data yang dihapus masuk tab **Terhapus**.

1. Buat Google Spreadsheet.
2. **Extensions -> Apps Script**, tempel isi `Code.gs` (ganti isi lama), lalu isi `SPREADSHEET_ID`.
3. Sangat disarankan: isi `ACCESS_KEY` di `Code.gs` dengan kata sandi bebas. Aplikasi meminta kunci ini sekali per browser (disimpan di browser itu).
4. Jalankan fungsi `setupSheet()` sekali (membuat kedua tab beserta header).
5. Deploy sebagai **Web app**: Execute as **Me**, Who has access **Anyone** (wajib "Anyone" agar Riwayat bisa dibaca dari browser). Bila sebelumnya sudah ada deployment: *Manage deployments -> edit -> New version*.
6. Salin URL `/exec` ke `config.js` pada `GOOGLE_APPS_SCRIPT_URL`.

Catatan penting:

- Data tersimpan mencakup NIK Penyelia Halal, nomor HP, dan tanda tangan. **Tanpa `ACCESS_KEY`, siapa pun yang tahu URL `/exec` dapat melihat, mengubah, dan menghapus data.** Isi `ACCESS_KEY`, jangan bagikan URL, dan batasi akses ke Spreadsheet-nya. Kunci ini perlindungan sederhana, bukan pengganti login.
- Struktur kolom ini baru. Data lama (tab `Data` dari versi BA saja) tidak diubah dan tidak tampil di Riwayat.
- Bila Riwayat gagal dimuat dengan pesan jaringan/CORS: pastikan *Who has access: Anyone*, URL berakhiran `/exec`, dan `Code.gs` sudah di-deploy sebagai *New version*.
- Riwayat menampilkan 300 data terbaru (ubah `LIST_LIMIT` di `Code.gs` bila perlu).

## Menjalankan

Cukup buka `index.html` (klik ganda) atau, lebih direkomendasikan, lewat server lokal:

```bash
cd folder-aplikasi
python3 -m http.server 8080
```

lalu buka `http://localhost:8080`. Dari HP pada jaringan yang sama, buka alamat IP komputer, mis. `http://192.168.1.10:8080`.

## Tanda tangan

- **Penanggung Jawab**: digambar ulang di HP untuk setiap berita acara.
- **Ketua Tim**: nama dan tanda tangan dapat disimpan sebagai **template perangkat** (`localStorage`); saat personel berubah, ganti lalu simpan template baru.
- Di PDF, tanda tangan dipotong rapat ke goresan tinta lalu dipusatkan pada kolomnya (sejajar dengan label dan nama), sehingga posisi menggambar di kanvas tidak memengaruhi posisinya di PDF.