import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import { useStore } from '../store';
import { searchCities } from '../cities';
import type { CityMatch } from '../cities';

function ClickHandler() {
  const setLocation = useStore((s) => s.setLocation);
  useMapEvents({
    click(e) {
      setLocation({ lat: e.latlng.lat, lng: e.latlng.lng, label: '' });
    },
  });
  return null;
}

/** Перелетает к точке, когда локация меняется (после поиска адреса). */
function FlyTo() {
  const lat = useStore((s) => s.location.lat);
  const lng = useStore((s) => s.location.lng);
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.8 });
  }, [lat, lng, map]);
  return null;
}

/** Геокодинг через Nominatim (OpenStreetMap): любой адрес или город мира.
 *  Если сеть или сервис недоступны — просто вернёт пусто. */
async function geocodeRemote(q: string, limit = 5): Promise<CityMatch[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&accept-language=ru&q=` +
      encodeURIComponent(q);
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    return data.map((d) => ({ name: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
  } catch {
    return [];
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

  // если локальная база молчит — через полсекунды тихо спрашиваем интернет
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || searchCities(q).length > 0) return;
    const t = setTimeout(async () => {
      setSearching(true);
      const remote = await geocodeRemote(q);
      setSearching(false);
      setSuggestions((cur) => {
        // запрос мог измениться, пока ждали ответ
        if (query !== q && inputRef.current?.value.trim() !== q) return cur;
        return remote;
      });
      if (remote.length === 0) {
        setError('Ничего не нашлось. Попробуйте иначе — или название ближайшего крупного города: для солнца этого достаточно.');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [query]);

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError('');
    const remote = await geocodeRemote(q, 1);
    setSearching(false);
    if (remote.length > 0) {
      pick(remote[0]);
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

        <MapContainer
          center={[location.lat, location.lng]}
          zoom={13}
          style={{ height: 320, width: '100%', borderRadius: 8 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CircleMarker
            center={[location.lat, location.lng]}
            radius={9}
            pathOptions={{ color: '#d33', fillColor: '#d33', fillOpacity: 0.7 }}
          />
          <ClickHandler />
          <FlyTo />
        </MapContainer>

        <div className="location-current">
          <span className="location-pin">📍</span>
          <div>
            <div className="location-label">{location.label || 'Точка на карте'}</div>
            <div className="muted">
              широта {location.lat.toFixed(3)}, долгота {location.lng.toFixed(3)} · кликните по карте, чтобы уточнить
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
