import { GUIDES } from "./guides";
import PanduanClient from "./PanduanClient";

export const metadata = {
  title: "Panduan | Kuis",
  description: "Panduan langkah demi langkah membuat, mengelola, dan menilai kuis.",
};

export default function Page() {
  return (
    <main className="wrap page-pad">
      <p className="kicker">Panduan</p>
      <h1 className="page-title">Belajar sambil praktik, bukan menghafal menu.</h1>
      <p className="page-sub">Tiga panduan ringkas yang membawa kamu dari kuis pertama sampai rekap nilai.</p>
      <PanduanClient guides={GUIDES} />
    </main>
  );
}
