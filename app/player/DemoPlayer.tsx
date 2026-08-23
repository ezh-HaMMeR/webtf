'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createFtePlayer, trackByDelta } from './fte';
import type { FtePlayer, LocalManifest } from './types';

const ENGINE_SCRIPT = '/vendor/fte/004/ftewebgl.js';
const ENGINE_MANIFEST = '/vendor/fte/default.fmf';

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function inspectDemo(buffer: ArrayBuffer) {
  const text = new TextDecoder('latin1').decode(buffer);
  const map = text.match(/maps[\\/]([A-Za-z0-9_+.-]+)\.bsp/i)?.[1]?.toLowerCase();
  const gameDir = (
    text.match(/\\\*gamedir\\([A-Za-z0-9_+.-]+)/i)?.[1]
    ?? text.match(/\\gamedir\\([A-Za-z0-9_+.-]+)/i)?.[1]
  )?.toLowerCase();
  const view = new DataView(buffer);
  let offset = 0;
  let demReadPackets = 0;
  let multiViewPackets = 0;
  let usesMvd1 = false;
  try {
    while (offset + 2 <= view.byteLength) {
      offset += 1;
      const commandType = view.getUint8(offset) & 7;
      offset += 1;
      if (commandType === 3) offset += 4;
      if ([1, 3, 4, 5, 6].includes(commandType)) {
        const packetSize = view.getUint32(offset, true);
        offset += 4;
        if (packetSize >= 5 && view.getUint8(offset) === 11 && view.getUint32(offset + 1, true) === 0x3144564d) usesMvd1 = true;
        offset += packetSize;
      } else if (commandType === 2) {
        offset += 8;
      } else {
        break;
      }
      if (commandType === 1) demReadPackets += 1;
      if ([3, 4, 5, 6].includes(commandType)) multiViewPackets += 1;
    }
  } catch {
    // Metadata mismatch checks below are still useful for malformed files.
  }
  const unsupported = usesMvd1 || (multiViewPackets > 0 && demReadPackets === 0);
  return { map, gameDir: gameDir === 'fortress' ? 'fortress' : gameDir ? 'qw' : undefined, unsupported };
}

export function DemoPlayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<FtePlayer | null>(null);
  const [manifest, setManifest] = useState<LocalManifest | null>(null);
  const [status, setStatus] = useState('Подготовка локальных файлов');
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(20);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const response = await fetch('/local/manifest.json', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Локальные игровые файлы не подготовлены. Запустите npm run prepare-assets.');
        }

        const localManifest = (await response.json()) as LocalManifest;
        if (cancelled || !canvasRef.current) return;

        setManifest(localManifest);
        if (localManifest.unsupportedReason) {
          setStatus('Формат пока не поддерживается');
          setError(localManifest.unsupportedReason);
          return;
        }
        setStatus('Загрузка движка и игровых ресурсов');
        window.Module = {
          canvas: canvasRef.current,
          manifest: ENGINE_MANIFEST,
          arguments: ['-manifest', ENGINE_MANIFEST],
          files: localManifest.files,
          setStatus(value: string) {
            setStatus(value || 'Инициализация FTEQW');
            const match = value.match(/\((\d+)\/(\d+)\)/);
            if (match) {
              const loaded = Number(match[1]);
              const total = Number(match[2]);
              if (total > 0) setProgress(Math.min(100, Math.round((loaded / total) * 100)));
            }
          },
          print(value: string) { console.info(`[FTEQW] ${value}`); },
          printErr(value: string) { console.warn(`[FTEQW] ${value}`); },
        };

        const script = document.createElement('script');
        script.src = ENGINE_SCRIPT;
        script.async = true;
        script.onerror = () => setError('Не удалось загрузить FTEQW. Повторно запустите подготовку локальных файлов.');
        document.body.appendChild(script);

        const startedAt = Date.now();
        const timer = window.setInterval(() => {
          if (window.FTEC?.cbufadd && window.Module?.getDemoTime) {
            playerRef.current = createFtePlayer();
            playerRef.current.command('volume', 0.2);
            setReady(true);
            setProgress(100);
            setStatus('Готово');
            window.clearInterval(timer);
          } else if (Date.now() - startedAt > 30000) {
            setError('FTEQW не завершил инициализацию за 30 секунд.');
            window.clearInterval(timer);
          }
        }, 100);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }

    boot();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => setCurrentTime(playerRef.current?.getDemoTime() ?? 0), 150);
    return () => window.clearInterval(timer);
  }, [ready]);

  const command = useCallback((name: string, value?: string | number) => {
    playerRef.current?.command(name, value);
  }, []);

  const togglePlayback = () => {
    const nextPlaying = !playing;
    setPlaying(nextPlaying);
    command('demo_setspeed', nextPlaying ? 100 : 0);
  };

  const seek = (delta: number) => command('demo_jump', Math.max(0, currentTime + delta));
  const changeVolume = (value: number) => {
    setVolume(value);
    command('volume', value / 100);
  };
  const showScoreboard = () => command('+showscores');
  const hideScoreboard = () => command('-showscores');

  const loadLocalDemo = async (file: File | undefined) => {
    if (!file || !window.FTEC?.loadurl) return;
    const buffer = await file.arrayBuffer();
    const required = inspectDemo(buffer);
    const preparedMap = manifest?.map.toLowerCase();
    const preparedGameDir = manifest?.gamedir.toLowerCase();

    if (required.unsupported) {
      setPlaying(false);
      setStatus('Формат пока не поддерживается');
      setError('Это настоящий multi-view MVD/MVD1. Текущая FTE WebGL-сборка проматывает такой поток до EndOfDemo; нужен WebAssembly-build ezquake-tf или патч FTE.');
      return;
    }

    if ((required.map && required.map !== preparedMap) || (required.gameDir && required.gameDir !== preparedGameDir)) {
      const requirement = `${required.gameDir ?? '?'} / ${required.map ?? '?'}`;
      const prepared = `${preparedGameDir ?? '?'} / ${preparedMap ?? '?'}`;
      setPlaying(false);
      setStatus('Нужны другие игровые ресурсы');
      setError(`Демка требует ${requirement}, а сейчас подготовлено ${prepared}. Запустите npm run prepare-assets -- "<полный путь к ${file.name}>" и перезагрузите страницу.`);
      return;
    }

    setError('');
    setStatus(`Открытие ${file.name}`);
    window.FTEC.loadurl(file.name, '', buffer);
    setStatus('Локальная демка передана движку');
    setPlaying(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!ready || event.repeat) return;
      if (event.code === 'Space') {
        event.preventDefault();
        trackByDelta(playerRef.current!, 1);
      } else if (event.code === 'Tab') {
        event.preventDefault();
        playerRef.current?.command('+showscores');
      } else if (event.code === 'ArrowLeft') {
        playerRef.current?.command('demo_jump', Math.max(0, currentTime - 10));
      } else if (event.code === 'ArrowRight') {
        playerRef.current?.command('demo_jump', currentTime + 10);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        event.preventDefault();
        playerRef.current?.command('-showscores');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [currentTime, ready]);

  const duration = manifest?.durationSeconds ?? 0;

  return (
    <section className="player-card" aria-label="MVD-плеер">
      <div className="player-topbar">
        <div className="demo-name">
          {manifest?.title ?? 'LOCAL MVD / ОЖИДАНИЕ ФАЙЛОВ'}
          {manifest?.map ? ` · ${manifest.map}` : ''}
        </div>
        <div className={`status-pill ${ready ? 'ready' : ''}`}>{status}</div>
      </div>

      <div className="player-stage" ref={stageRef}>
        <canvas id="fteCanvas" ref={canvasRef} tabIndex={0} />
        <div className={`stage-message ${ready ? 'hidden' : ''}`}>
          <strong>{error ? 'ПРОТОТИП НЕ ЗАПУЩЕН' : 'ЗАГРУЗКА WEBTF'}</strong>
          <span>{error || 'FTEQW загружает движок, демку, карту, модели и звуки в память браузера.'}</span>
          {!error && (
            <div className="meter" style={{ '--progress': `${progress}%` } as React.CSSProperties}>
              <i />
            </div>
          )}
        </div>
      </div>

      <div className="controls">
        <div className="control-group">
          <button className="control-button primary" type="button" onClick={togglePlayback} disabled={!ready} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
            {playing ? 'Ⅱ' : '▶'}
          </button>
          <button className="control-button" type="button" onClick={() => seek(-10)} disabled={!ready}>−10</button>
          <button className="control-button" type="button" onClick={() => seek(10)} disabled={!ready}>+10</button>
        </div>

        <div className="timeline">
          <span className="timecode">{formatTime(currentTime)}</span>
          {duration ? (
            <input aria-label="Позиция демки" type="range" min="0" max={duration} step="1" value={Math.min(currentTime, duration)} disabled={!ready} onChange={(event) => command('demo_jump', Number(event.target.value))} />
          ) : (
            <span className="timeline-static" title="Полная длительность MVD пока не вычисляется"><i /></span>
          )}
        </div>

        <div className="control-group">
          <button className="control-button" type="button" onClick={() => playerRef.current && trackByDelta(playerRef.current, -1)} disabled={!ready} aria-label="Предыдущий игрок">◀ CAM</button>
          <button className="control-button" type="button" onClick={() => playerRef.current && trackByDelta(playerRef.current, 1)} disabled={!ready} aria-label="Следующий игрок">CAM ▶</button>
          <button className="control-button" type="button" onPointerDown={showScoreboard} onPointerUp={hideScoreboard} onPointerLeave={hideScoreboard} disabled={!ready}>SCORE</button>
          <div className="volume">
            <span aria-hidden="true">VOL</span>
            <input aria-label="Громкость" type="range" min="0" max="50" value={volume} disabled={!ready} onChange={(event) => changeVolume(Number(event.target.value))} />
          </div>
          <button className="control-button" type="button" onClick={() => stageRef.current?.requestFullscreen()} aria-label="Полноэкранный режим">FULL</button>
        </div>
      </div>

      <div className="player-lower">
        <div className="hints">
          <span><kbd>SPACE</kbd>следующий игрок</span>
          <span><kbd>TAB</kbd>скорборд</span>
          <span><kbd>← →</kbd>±10 секунд</span>
          <span>Для TF-демки сначала подготовьте соответствующую карту.</span>
        </div>
        <label className="file-button">
          ОТКРЫТЬ ДРУГУЮ MVD
          <input type="file" accept=".mvd,.qwd,.dem,.gz" onChange={(event) => loadLocalDemo(event.target.files?.[0])} />
        </label>
      </div>

      {error && <p className="error-box">{error}</p>}
    </section>
  );
}
