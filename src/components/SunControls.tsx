import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { fmtTime, makeDate, sunDirection, sunTimes } from '../sun';

const SEASONS = [
  { label: 'Зима', date: '-12-21' },
  { label: 'Весна', date: '-03-20' },
  { label: 'Лето', date: '-06-21' },
  { label: 'Осень', date: '-09-22' },
];

export default function SunControls() {
  const sun = useStore((s) => s.sun);
  const setSun = useStore((s) => s.setSun);
  const location = useStore((s) => s.location);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) {
      if (playRef.current) cancelAnimationFrame(playRef.current);
      playRef.current = null;
      return;
    }
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      if (dt > 40) {
        last = now;
        const cur = useStore.getState().sun.minutes;
        useStore.getState().setSun({ minutes: (cur + 4) % 1440 });
      }
      playRef.current = requestAnimationFrame(tick);
    };
    playRef.current = requestAnimationFrame(tick);
    return () => {
      if (playRef.current) cancelAnimationFrame(playRef.current);
    };
  }, [playing]);

  const date = makeDate(sun.dateISO, sun.minutes);
  const times = sunTimes(date, location.lat, location.lng);
  const pos = sunDirection(date, location.lat, location.lng, location.northAngle);
  const altDeg = (pos.altitude * 180) / Math.PI;
  const azDeg = (((pos.azimuth * 180) / Math.PI + 180) % 360 + 360) % 360; // 0 = север

  const hh = String(Math.floor(sun.minutes / 60)).padStart(2, '0');
  const mm = String(sun.minutes % 60).padStart(2, '0');
  const year = sun.dateISO.slice(0, 4);

  return (
    <footer className="sun-controls">
      <div className="sun-group">
        <input
          type="date"
          value={sun.dateISO}
          onChange={(e) => e.target.value && setSun({ dateISO: e.target.value })}
        />
        <div className="season-btns">
          {SEASONS.map((s) => (
            <button
              key={s.label}
              className={sun.dateISO.endsWith(s.date) ? 'active' : ''}
              onClick={() => setSun({ dateISO: year + s.date })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sun-group time-group">
        <button className="play-btn" onClick={() => setPlaying((p) => !p)} title="Прокрутить день">
          {playing ? '⏸' : '▶'}
        </button>
        <span className="time-label">{hh}:{mm}</span>
        <input
          type="range"
          min={0}
          max={1435}
          step={5}
          value={sun.minutes}
          onChange={(e) => setSun({ minutes: Number(e.target.value) })}
        />
      </div>

      <div className="sun-group sun-info">
        <span title="Восход">🌅 {fmtTime(times.sunrise)}</span>
        <span title="Закат">🌇 {fmtTime(times.sunset)}</span>
        <span title="Высота солнца над горизонтом">
          ☀ {altDeg > 0 ? `${altDeg.toFixed(0)}°` : 'ночь'}
        </span>
        {altDeg > 0 && <span title="Азимут (0° = север)">азимут {azDeg.toFixed(0)}°</span>}
      </div>
    </footer>
  );
}
