/*
  Data Instrumen Pengawasan - mengikuti template resmi
  "Instrumen Pengawasan Penyediaan Makanan dan/atau Minuman dengan Pengolahan".
  Bila template berubah (butir ditambah/diubah), cukup ubah file ini; aplikasi ikut menyesuaikan
  (formulir, hitungan, Hasil Pengawasan di BA, dan PDF Instrumen).
*/

const INSTRUMEN_JUDUL = ['INSTRUMEN PENGAWASAN', 'PENYEDIAAN MAKANAN DAN/ATAU MINUMAN DENGAN PENGOLAHAN'];
const INSTRUMEN_NAMA_PANJANG = 'Instrumen Pengawasan Penyediaan Makanan dan/atau Minuman dengan Pengolahan';
const INSTRUMEN_FOOTER = 'Pusbinwasjph-pengawasan-pasarmodern';

// Teks kop surat (dipakai di BA dan Instrumen). Logo selalu diambil dari assets/logo.png.
const KOP = [
  'BADAN PENYELENGGARA JAMINAN PRODUK HALAL',
  'BALAI PENYELENGGARA JAMINAN PRODUK HALAL',
  'PROVINSI JAWA BARAT',
  'Jalan Burangrang No. 19, Malabar, Kec. Lengkong Kota Bandung 40262',
  'Telepon (022), Email: upt.jabar@halal.go.id, Website: halal.go.id'
];

// Pilihan cepat (chip) untuk Profil Pelaku Usaha. Pilihan "Lainnya" selalu tersedia.
const OPSI = {
  jenis: ['Restoran', 'Rumah Makan', 'Kafe', 'Kedai Makanan', 'Kedai Minuman', 'Katering'],
  statusGerai: ['Pusat', 'Cabang'],
  skala: ['Mikro', 'Kecil', 'Menengah', 'Besar'],
  dapur: ['Milik Sendiri', 'Sewa', 'Pihak Ketiga'],
  gudang: ['Milik Sendiri', 'Sewa', 'Pihak Ketiga', 'Tidak Ada']
};

// Saran umum: sekali ketuk masuk ke daftar Saran dan Tindaklanjut.
const SARAN_UMUM = [
  'Agar pelaku usaha melakukan pencantuman label halal pada produk yang telah memperoleh sertifikat halal dan lokasi usaha sesuai dengan ketentuan yang berlaku',
  'Agar pelaku usaha melakukan penyesuaian dokumen SJPH dengan kondisi aktual, khususnya terhadap merek bahan, cleaning agent, dan bahan kemasan yang digunakan dalam proses produksi dengan melaporkan perubahan tersebut kepada BPJPH'
];

const KABKOTA_JABAR = [
  'Kabupaten Bandung', 'Kabupaten Bandung Barat', 'Kabupaten Bekasi', 'Kabupaten Bogor', 'Kabupaten Ciamis',
  'Kabupaten Cianjur', 'Kabupaten Cirebon', 'Kabupaten Garut', 'Kabupaten Indramayu', 'Kabupaten Karawang',
  'Kabupaten Kuningan', 'Kabupaten Majalengka', 'Kabupaten Pangandaran', 'Kabupaten Purwakarta', 'Kabupaten Subang',
  'Kabupaten Sukabumi', 'Kabupaten Sumedang', 'Kabupaten Tasikmalaya',
  'Kota Bandung', 'Kota Banjar', 'Kota Bekasi', 'Kota Bogor', 'Kota Cimahi', 'Kota Cirebon', 'Kota Depok',
  'Kota Sukabumi', 'Kota Tasikmalaya'
];

// Penulis baris: R = butir yang dinilai (S/TS), H = baris judul tanpa penilaian,
// C = lanjutan butir di atasnya (kolom No/Uraian digabung).
const R = (no, uraian, spek) => ({ no, uraian, spek, scored: true });
const C = (spek) => ({ no: '', uraian: '', spek, scored: true, cont: true });
const H = (no, uraian, spek = '') => ({ no, uraian, spek, scored: false });

const INSTRUMEN = [
  {
    kode: 'II', judul: 'KOMITMEN DAN TANGGUNG JAWAB', pendek: 'Komitmen dan Tanggung Jawab',
    baris: [
      R('1.', 'Kebijakan halal', 'Manajemen Puncak memiliki pernyataan tertulis, komitmen untuk kebijakan halal (sertakan dokumentasi).'),
      R('2.', 'Penyelia Halal', 'Memiliki Penyelia Halal yang ditetapkan oleh Pelaku Usaha.'),
      C('Memiliki tim manajemen halal dengan melibatkan seluruh pihak terkait*.'),
      C('Penyelia Halal telah mengikuti pelatihan dan/atau uji kompetensi Penyelia Halal (dibuktikan dengan sertifikat).'),
      R('3.', 'Pembinaan SDM', 'Melakukan pembinaan SDM melalui pelatihan secara internal/eksternal.')
    ]
  },
  {
    kode: 'III', judul: 'BAHAN', pendek: 'Bahan',
    baris: [
      H('1', 'Bahan baku, bahan tambahan, bahan penolong'),
      R('', 'a. Daftar Bahan', 'Bahan yang digunakan untuk menghasilkan makanan/ minuman di setiap dapur, cabang, outlet, dan/atau yang sejenisnya baik yang lama maupun baru menggunakan bahan yang sama dengan yang digunakan dalam pengusulan sertifikat halal.'),
      H('', 'b. Dokumen kehalalan bahan Sertifikat halal'),
      R('', '● Sertifikat Halal', 'Memiliki dokumen pendukung berupa Sertifikat Halal.'),
      R('', '● SHLN', 'Memiliki dokumen SHLN dengan lingkup sesuai MRA.'),
      C('SHLN teregistrasi di BPJPH.'),
      C('SHLN yang digunakan masih berlaku.'),
      R('', '● Dokumen pendukung', 'Memiliki dokumen pendukung berupa alur proses produksi, komposisi produk, certificate of analysis, dan dokumen pendukung lainnya terhadap bahan yang belum ada dalam ketentuan bahan yang wajib bersertifikat halal atau bahan yang dikecualikan dari kewajiban bersertifikat halal.'),
      R('', 'c. Laporan perubahan bahan', 'Memberikan laporan kepada BPJPH atas perubahan bahan yang digunakan untuk menghasilkan makanan dan minuman di setiap dapur, cabang, outlet, dan/atau yang sejenisnya baik yang lama maupun baru menggunakan bahan yang sama dengan yang digunakan dalam pengusulan sertifikat halal.'),
      H('2', 'Kemasan', 'Kemasan yang kontak langsung dengan produk wajib memenuhi persyaratan.'),
      R('', 'a. Sertifikat halal atau dokumen pendukung kehalalan kemasan', 'Memiliki dokumen pendukung berupa sertifikat halal atau dokumen pendukung kehalalan lainnya.'),
      R('', 'b. Desain kemasan', 'Tanda, simbol, logo, nama, dan gambar yang tidak bertentangan dengan syariat Islam atau bertentangan dengan etika dan kepatutan yang berlaku dan berkembang di masyarakat.'),
      R('', 'c. Kualitas kemasan', 'Kemasan yang digunakan bersih, sehat, tidak berbau, dan tidak mempengaruhi kualitas produk.'),
      H('3', 'Bahan penolong'),
      R('', 'a. Bahan penolong pencucian', 'Bahan penolong pencucian yang kontak langsung dengan wadah dan alat untuk menangani produk wajib memenuhi persyaratan (memiliki dokumen kehalalan dan tidak bercampur bahan haram atau najis).'),
      R('', 'b. Sanitizer', 'Bahan penolong yang kontak langsung dengan wadah dan alat untuk menangani produk wajib memenuhi persyaratan (memiliki dokumen kehalalan dan tidak bercampur bahan haram atau najis).')
    ]
  },
  {
    kode: 'IV', judul: 'PROSES PRODUK HALAL', pendek: 'Proses Produk Halal',
    baris: [
      R('1', 'Tempat Pengolahan (contoh: dapur)', 'Memisahkan tempat pengolahan antara produk halal dan tidak halal.'),
      R('', 'a. Tempat penampungan bahan', 'Memisahkan tempat penampungan bahan antara produk halal dan tidak halal.'),
      R('', 'b. Tempat penimbangan bahan', 'Memisahkan tempat penimbangan bahan antara produk halal dan tidak halal.'),
      R('', 'c. Tempat pencampuran bahan', 'Memisahkan tempat pencampuran bahan antara produk halal dan tidak halal.'),
      R('', 'd. Tempat pencetakan produk', 'Memisahkan tempat pencetakan produk antara produk halal dan tidak halal.'),
      R('', 'e. Tempat pemasakan produk', 'Memisahkan tempat pemasakan produk antara produk halal dan tidak halal.'),
      R('', 'f. Pengolahan dilakukan oleh pihak ketiga', 'Pihak ketiga tersebut wajib memenuhi standar halal fasilitas/jasa pengolahan dan perlu dilakukan perjanjian komitmen sewaktu (sesuai masa kontrak kerja sama) untuk menjamin kualitas JPH di lokasi, tempat, dan alat yang digunakan.'),
      H('2', 'Alat Pengolahan'),
      R('', 'a. Penggunaan alat pengolahan', 'Tidak menggunakan alat pengolahan secara bergantian dengan yang digunakan untuk pengolahan produk tidak halal.'),
      R('', 'b. Sarana pembersihan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pembersihan alat.'),
      R('', 'c. Sarana pemeliharaan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pemeliharaan alat.'),
      R('', 'd. Tempat penyimpanan alat', 'Memiliki tempat penyimpanan alat sendiri untuk yang halal dan tidak halal.'),
      H('3', 'Tempat Penyimpanan', 'Wajib memisahkan tempat penyimpanan produk halal dan tidak halal.'),
      R('', 'a. Tempat penerimaan bahan', 'Wajib memisahkan tempat penerimaan bahan halal dan tidak halal.'),
      R('', 'b. Tempat penerimaan produk setelah pengolahan', 'Wajib memisahkan tempat penerimaan produk setelah pengolahan antara yang halal dan tidak halal.'),
      R('', 'c. Sarana yang digunakan untuk penyimpanan bahan dan produk', 'Wajib memisahkan sarana yang digunakan untuk penyimpanan bahan dan produk yang halal dan tidak halal.'),
      H('4', 'Alat Penyimpanan', 'Memisahkan alat penyimpanan antara produk halal dan tidak halal.'),
      R('', 'a. Penggunaan alat penyimpanan', 'Tidak menggunakan alat penyimpanan secara bergantian dengan yang digunakan untuk penyimpanan produk tidak halal;'),
      R('', 'b. Sarana pembersihan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pembersihan alat;'),
      R('', 'c. Sarana pemeliharaan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pemeliharaan alat.'),
      R('', 'd. Tempat penyimpanan alat', 'Memiliki tempat penyimpanan alat sendiri untuk yang halal dan tidak halal.'),
      R('5', 'Tempat Pengemasan', 'Memisahkan tempat pengemasan antara produk halal dan tidak halal.'),
      H('6', 'Alat Pengemasan'),
      R('', 'a. Penggunaan alat pengemasan', 'Tidak menggunakan alat pengemasan secara bergantian dengan yang digunakan untuk pengemasan produk tidak halal.'),
      R('', 'b. Sarana pembersihan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pembersihan alat;'),
      R('', 'c. Sarana pemeliharaan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pemeliharaan alat.'),
      R('', 'd. Tempat penyimpanan alat', 'Memiliki tempat penyimpanan alat sendiri untuk yang halal dan tidak halal.'),
      H('7', 'Tempat Pendistribusian', 'Memisahkan tempat pendistribusian antara produk halal dan tidak halal.'),
      R('', 'a. Sarana pengangkutan', 'Sarana pengangkutan dari tempat penyimpanan ke alat distribusi produk terpisah antara produk halal dan tidak halal.'),
      R('', 'b. Alat transportasi', 'Alat transportasi untuk distribusi produk halal terpisah dengan produk tidak halal.'),
      H('8', 'Alat Pendistribusian', 'Memisahkan alat pendistribusian antara produk halal dan tidak halal.'),
      R('', 'a. Penggunaan alat pendistribusian', 'Tidak menggunakan alat pendistribusian secara bergantian dengan yang digunakan untuk pendistribusian produk tidak halal;'),
      R('', 'b. Sarana pembersihan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pembersihan alat;'),
      R('', 'c. Sarana pemeliharaan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pemeliharaan alat.'),
      R('', 'd. Tempat penyimpanan alat', 'Memiliki tempat penyimpanan alat sendiri untuk yang halal dan tidak halal.'),
      H('9', 'Tempat Penyajian', 'Memisahkan tempat penyajian antara produk halal dan tidak halal.'),
      R('', 'a. Sarana penyajian produk', 'Sarana penyajian produk halal terpisah dengan penyajian produk tidak halal.'),
      R('', 'b. Proses penyajian produk', 'Proses penyajian produk halal terpisah dengan penyajian produk tidak halal.'),
      H('10', 'Alat Penyajian', 'Memisahkan alat penyajian antara produk halal dan tidak halal.'),
      R('', 'a. Penggunaan alat penyajian', 'Tidak menggunakan alat penyajian secara bergantian dengan yang digunakan untuk penyajian produk tidak halal.'),
      R('', 'b. Sarana pembersihan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pembersihan alat.'),
      R('', 'c. Sarana pemeliharaan alat', 'Menggunakan sarana yang berbeda untuk yang halal dan tidak halal dalam pemeliharaan alat.'),
      R('', 'd. Tempat penyimpanan alat', 'Memiliki tempat penyimpanan alat sendiri untuk yang halal dan tidak halal.'),
      R('11', 'Prosedur PPH', 'Tersedianya prosedur dan implementasinya di setiap dapur, gudang, cabang, outlet, lokasi pengemasan dan/atau lokasi sejenisnya baik yang lama maupun baru.')
    ]
  },
  {
    kode: 'V', judul: 'PRODUK', pendek: 'Produk',
    baris: [
      R('1', 'Sertifikat halal', 'Memiliki dokumen kehalalan atas produk penyediaan makanan dan/atau minuman dengan pengolahan.'),
      R('', 'a. Nomor Sertifikat Halal', 'Diawali dengan ID dan terdiri dari 17 angka.'),
      R('', 'b. Jenis Produk', 'Jenis Produk yang dicantumkan dalam SH sesuai dengan produknya (lampiran produk).'),
      R('', 'c. Nama Produk', 'Nama Produk yang dicantumkan dalam SH sesuai dengan produknya.'),
      R('', 'd. Nama Pelaku Usaha', 'Nama Pelaku Usaha yang tertera pada Sertifikat Halal sesuai dengan data di info.halal.go.id.'),
      R('', 'e. Alamat Pelaku Usaha', 'Alamat pelaku usaha yang tertera pada Sertifikat Halal sesuai dengan data di info.halal.go.id.'),
      R('', 'f. Barcode Tandatangan SH', 'Informasi yang tercantum pada Sertifikat Halal sesuai dengan informasi pada QR.'),
      C('Alamat website yang muncul pada QR adalah info.halal.go.id.'),
      R('', 'g. Logo resmi Balai Sertifikasi Elektronik', 'Sertifikat Halal mencantumkan logo resmi Balai Sertifikasi Elektronik.'),
      R('2', 'Label Halal', 'Pencantuman label halal pada tempat tertentu harus mudah dilihat dan dibaca.'),
      R('3', 'Keterangan tidak halal', 'Pencantuman keterangan tidak halal harus mudah dilihat dan dibaca pada tempat penjualan.')
    ]
  },
  {
    kode: 'VI', judul: 'PEMANTAUAN DAN EVALUASI', pendek: 'Pemantauan dan Evaluasi',
    baris: [
      R('1.', 'Audit Internal', 'Pelaku usaha melakukan audit internal minimal 1 tahun sekali untuk memantau penerapan SJPH (dibuktikan dengan bukti pelaksanaan dan laporan hasil audit yang terdokumentasi).'),
      C('Melakukan pelaporan hasil audit internal secara lengkap setiap unit usaha baik pusat maupun cabang.'),
      R('2.', 'Kaji Ulang Manajemen', 'Pelaku usaha melakukan kaji ulang manajemen untuk mengevaluasi penerapan SJPH (dibuktikan dengan bukti pelaksanaan dan laporan hasil kaji ulang yang terdokumentasi).'),
      R('3.', 'SOP Audit dan Kaji Ulang', 'Pelaku usaha memiliki prosedur audit internal dan kaji ulang manajemen.')
    ]
  }
];
