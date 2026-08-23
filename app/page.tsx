import { DemoPlayer } from './player/DemoPlayer';

export default function Home() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <a className="brand" href="https://qwtf.net" aria-label="QWTF.NET">
          <span className="brand-main">QWTF</span>
          <span className="brand-dot">.NET</span>
        </a>
        <div className="prototype-label">WEB DEMO PLAYER / PROTOTYPE 01</div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">ТЕХНИЧЕСКИЙ ПРОТОТИП</p>
          <h1 id="page-title">ДЕМО В БРАУЗЕРЕ</h1>
        </div>
        <p className="intro-copy">
          Локальная проверка MVD-воспроизведения, переключения камеры и
          скорборда. Движок запускается непосредственно в браузере.
        </p>
      </section>

      <DemoPlayer />

      <footer className="site-footer">
        <span>FTEQW WEBASSEMBLY</span>
        <span>MVD / TEAM FORTRESS TEST HARNESS</span>
      </footer>
    </main>
  );
}
