// eslint-config-next@16 sudah flat-config asli — tidak perlu FlatCompat lagi.
// (Pemakaian FlatCompat di versi ini memicu "Converting circular structure"
// saat eslint memvalidasi config — config lama memakai pola Next 15.)
import nextVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  ...nextVitals,
  {
    // Catatan lint proyek ini (Next 16 + plugin react-hooks v7):
    //   • Aturan react-hooks/set-state-in-effect & react-hooks/refs AKTIF.
    //     Pola lama "tulis ref saat render" sudah dipindah ke useEffect di
    //     src/lib/room-client.js. Bila muncul pelanggaran baru, perbaiki
    //     kodenya — jangan matikan aturannya di sini.
    rules: {},
    ignores: [".next/**", "node_modules/**", "out/**", "build/**"],
  },
]

export default eslintConfig
