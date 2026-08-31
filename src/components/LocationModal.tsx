import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { searchCities } from '../cities';
import type { CityMatch } from '../cities';

/** Точный геокодинг через Nominatim — работает только там, где разрешены
 *  внешние запросы (localhost); в веб-версии тихо падает и не используется. */
async function geocodePrecise(q: string): Promise<CityMatch | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=' +
      encodeURIComponent(q);
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (!data.length) return null;
    return { name: data[0].display_name, lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default function LocationModal({ onClose }: { onClose: () => void }) {
  const location = useStore((s) => s.location);
  const setLocation = useStore((s) => s.setLocation);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CityMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const pick = (m: CityMatch) => {
    setLocation({ lat: m.lat, lng: m.lng, label: m.name });
    setSuggestions([]);
    setQuery('');
    setError('');
  };

  const onQuery = (v: string) => {
    setQuery(v);
    setError('');
    setSuggestions(searchCities(v));
  };

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError('');
    const precise = await geocodePrecise(q);
    setSearching(false);
    if (precise) {
      pick(precise);
      return;
    }
    const local = searchCities(q);
    if (local.length > 0) {
      pick(local[0]);
    } else {
      setError('Не нашёл такое место. Попробуйте название ближайшего крупного города — для расчёта солнца этого достаточно.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Местоположение офиса</h3>
        <p className="muted">Введите город или адрес — координаты определятся сами.</p>

        <div className="search-row">
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Например: Москва или Санкт-Петербург, Невский 28"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (suggestions.length > 0) pick(suggestions[0]);
                else onSearch();
              }
            }}
          />
          <button onClick={onSearch} disabled={searching}>
            {searching ? 'Ищу…' : '🔍 Найти'}
          </button>
        </div>
        {error && <p className="search-error">{error}</p>}
        {suggestions.length > 0 && (
          <ul className="search-results">
            {suggestions.map((m) => (
              <li key={m.name}>
                <button onClick={() => pick(m)}>
                  {m.name}
                  <span className="muted"> — {m.lat.toFixed(2)}, {m.lng.toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="location-current">
          <span className="location-pin">📍</span>
          <div>
            <div className="location-label">{location.label || 'Точка задана'}</div>
            <div className="muted">
              широта {location.lat.toFixed(3)}, долгота {location.lng.toFixed(3)}
            </div>
          </div>
        </div>

        <div className="modal-row">
          <label className="num-field">
            <span>Север на плане, °</span>
            <input type="number" step={5} value={location.northAngle}
              onChange={(e) => setLocation({ northAngle: Number(e.target.value) })} />
          </label>
          <svg width="56" height="56" viewBox="-28 -28 56 56" className="compass-preview">
            <circle r="25" fill="#fff" stroke="#ccc" />
            <g transform={`rotate(${location.northAngle})`}>
              <path d="M 0 -20 L 6 6 L 0 1 L -6 6 Z" fill="#d33" />
              <text y="-10" fontSize="10" textAnchor="middle" fill="#fff" fontWeight="bold">С</text>
            </g>
          </svg>
        </div>

        <details className="manual-coords">
          <summary className="muted">Задать координаты вручную</summary>
          <div className="modal-row" style={{ marginTop: 8 }}>
            <label className="num-field">
              <span>Широта</span>
              <input type="number" step={0.001} value={Number(location.lat.toFixed(4))}
                onChange={(e) => setLocation({ lat: Number(e.target.value), label: '' })} />
            </label>
            <label className="num-field">
              <span>Долгота</span>
              <input type="number" step={0.001} value={Number(location.lng.toFixed(4))}
                onChange={(e) => setLocation({ lng: Number(e.target.value), label: '' })} />
            </label>
          </div>
        </details>

        <p className="muted">
          «Север на плане» — куда указывает север относительно верха 2D-плана (по часовой стрелке).
          Время рассчитывается по часовому поясу вашего устройства.
        </p>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose}>Готово</button>
        </div>
      </div>
    </div>
  );
}
