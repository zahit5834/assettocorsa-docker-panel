import { AlertTriangle, Boxes, Car, CloudSun, Cpu, MapPin, Shield, Sparkles, Wand2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  apiFetch,
  type CarItem,
  type PackItem,
  type ServerItem,
  type ServerTemplate,
  type TrackItem,
} from '../lib/api';

interface Props {
  initialServer?: ServerItem | null;
  preselectedPackId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ServerFormModal({
  initialServer,
  preselectedPackId,
  onClose,
  onSaved,
}: Props) {
  const isEdit = Boolean(initialServer);

  const [templates, setTemplates] = useState<ServerTemplate[]>([]);
  const [cars, setCars] = useState<CarItem[]>([]);
  const [tracks, setTracks] = useState<TrackItem[]>([]);
  const [packs, setPacks] = useState<PackItem[]>([]);

  const [name, setName] = useState(initialServer?.name || '');
  const [engine, setEngine] = useState<'assettoserver' | 'vanilla'>(
    initialServer?.engine || 'assettoserver'
  );
  const [template, setTemplate] = useState(initialServer?.template || 'freeroam_traffic');
  const [udpPort, setUdpPort] = useState(initialServer?.udp_port || 9600);
  const [tcpPort, setTcpPort] = useState(initialServer?.tcp_port || 9600);
  const [httpPort, setHttpPort] = useState(initialServer?.http_port || 8081);
  const [password, setPassword] = useState(initialServer?.password || '');
  const [adminPassword, setAdminPassword] = useState(initialServer?.admin_password || 'admin123');
  const [maxClients, setMaxClients] = useState(initialServer?.max_clients || 24);
  const [trackId, setTrackId] = useState(initialServer?.track_id || '');
  const [trackConfig, setTrackConfig] = useState(initialServer?.track_config || '');
  const [selectedCarIds, setSelectedCarIds] = useState<string[]>(initialServer?.car_ids || []);
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>(
    initialServer?.pack_ids || (preselectedPackId ? [preselectedPackId] : [])
  );
  const [trafficEnabled, setTrafficEnabled] = useState(
    initialServer ? initialServer.traffic_enabled : true
  );
  const [maxAiCount, setMaxAiCount] = useState(initialServer?.traffic_config?.maxAiCount || 100);
  const [maxAiPerPlayer, setMaxAiPerPlayer] = useState(
    initialServer?.traffic_config?.maxAiPerPlayer || 35
  );
  const [maxAiTargetCount, setMaxAiTargetCount] = useState(
    initialServer?.traffic_config?.maxAiTargetCount || 200
  );
  const [maxSpeedKmh, setMaxSpeedKmh] = useState(initialServer?.traffic_config?.maxSpeedKmh || 90);
  const [rightLaneOffsetKph, setRightLaneOffsetKph] = useState(
    initialServer?.traffic_config?.rightLaneOffsetKph ?? 0
  );
  const [laneWidthMeters, setLaneWidthMeters] = useState(
    initialServer?.traffic_config?.laneWidthMeters ?? 3
  );
  const [playerRadiusMeters, setPlayerRadiusMeters] = useState(
    initialServer?.traffic_config?.playerRadiusMeters ?? 350
  );
  const [playerPositionOffsetMeters, setPlayerPositionOffsetMeters] = useState(
    initialServer?.traffic_config?.playerPositionOffsetMeters ?? 120
  );
  const [minSpawnDistancePoints, setMinSpawnDistancePoints] = useState(
    initialServer?.traffic_config?.minSpawnDistancePoints ?? 75
  );
  const [maxSpawnDistancePoints, setMaxSpawnDistancePoints] = useState(
    initialServer?.traffic_config?.maxSpawnDistancePoints ?? 300
  );
  const [maxPlayerDistanceMeters, setMaxPlayerDistanceMeters] = useState(
    initialServer?.traffic_config?.maxPlayerDistanceMeters ?? 20
  );
  const [minSafetyDistanceMeters, setMinSafetyDistanceMeters] = useState(
    initialServer?.traffic_config?.minSafetyDistanceMeters ?? 10
  );
  const [maxSafetyDistanceMeters, setMaxSafetyDistanceMeters] = useState(
    initialServer?.traffic_config?.maxSafetyDistanceMeters ?? 24
  );
  const [stateSpawnDistanceMeters, setStateSpawnDistanceMeters] = useState(
    initialServer?.traffic_config?.stateSpawnDistanceMeters ?? 100
  );
  const [twoWayTraffic, setTwoWayTraffic] = useState(
    Boolean(initialServer?.traffic_config?.twoWayTraffic)
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    initialServer?.traffic_config?.welcomeMessage || ''
  );
  const [trafficCarIds, setTrafficCarIds] = useState<string[]>(
    initialServer?.traffic_config?.trafficCars || []
  );
  const [trafficPackIds, setTrafficPackIds] = useState<string[]>(
    initialServer?.traffic_config?.trafficPackIds || []
  );
  const [trafficCarSearch, setTrafficCarSearch] = useState('');
  const [description, setDescription] = useState(initialServer?.description || '');
  const [rulesText, setRulesText] = useState(initialServer?.rules_text || '');
  const [bannerUrl, setBannerUrl] = useState(initialServer?.banner_url || '');
  const [weatherPreset, setWeatherPreset] = useState(initialServer?.weather_preset || '3_clear');
  const [timeOfDay, setTimeOfDay] = useState(initialServer?.time_of_day || 'noon');
  const [timeMultiplier, setTimeMultiplier] = useState(initialServer?.time_multiplier ?? 1);
  const [weatherOptions, setWeatherOptions] = useState<Array<{ id: string; label: string }>>([
    { id: '3_clear', label: 'Açık & Güneşli' },
    { id: '4_mid_clear', label: 'Az Bulutlu' },
    { id: '5_light_clouds', label: 'Parçalı Bulutlu' },
    { id: '6_mid_clouds', label: 'Bulutlu' },
    { id: '7_heavy_clouds', label: 'Kapalı' },
    { id: '2_light_fog', label: 'Hafif Sisli' },
    { id: '1_heavy_fog', label: 'Yoğun Sisli' },
    { id: 'sol_05_rain', label: 'Yağmurlu (CSP / Sol / Pure)' },
  ]);
  const [timeOptions, setTimeOptions] = useState<Array<{ id: string; label: string }>>([
    { id: 'morning', label: 'Sabah (09:00)' },
    { id: 'noon', label: 'Öğle (13:00)' },
    { id: 'afternoon', label: 'İkindi (16:00)' },
    { id: 'sunset', label: 'Gün Batımı (18:30)' },
    { id: 'night', label: 'Gece (22:30 - CSP)' },
  ]);
  const [cmAutodownload, setCmAutodownload] = useState(
    initialServer ? initialServer.cm_autodownload : true
  );
  const [registerToLobby, setRegisterToLobby] = useState(
    initialServer ? initialServer.register_to_lobby : false
  );
  const [memoryLimitMb, setMemoryLimitMb] = useState(initialServer?.memory_limit_mb || 0);
  const [autoStart, setAutoStart] = useState(!isEdit);

  const [carSearch, setCarSearch] = useState('');
  const [showTrafficInPlayerList, setShowTrafficInPlayerList] = useState(false);
  const [showAllCarsInTrafficList, setShowAllCarsInTrafficList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{
        templates: ServerTemplate[];
        weatherPresets?: Array<{ id: string; label: string }>;
        timePresets?: Array<{ id: string; label: string }>;
      }>('/api/servers/templates'),
      apiFetch<{ cars: CarItem[] }>('/api/content/cars'),
      apiFetch<{ tracks: TrackItem[] }>('/api/content/tracks'),
      apiFetch<{ packs: PackItem[] }>('/api/packs'),
      !isEdit
        ? apiFetch<{ udp_port: number; tcp_port: number; http_port: number }>(
            '/api/servers/suggest-ports'
          )
        : Promise.resolve(null),
    ])
      .then(([tplRes, carRes, trackRes, packRes, portsRes]) => {
        setTemplates(tplRes.templates);
        if (tplRes.weatherPresets) setWeatherOptions(tplRes.weatherPresets);
        if (tplRes.timePresets) setTimeOptions(tplRes.timePresets);
        setCars(carRes.cars);
        setTracks(trackRes.tracks);
        setPacks(packRes.packs);
        if (portsRes) {
          setUdpPort(portsRes.udp_port);
          setTcpPort(portsRes.tcp_port);
          setHttpPort(portsRes.http_port);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Veriler yüklenemedi.'));
  }, [isEdit]);

  const selectedTrack = tracks.find((t) => t.id === trackId);

  const applyTemplate = (tpl: ServerTemplate) => {
    setTemplate(tpl.id);
    setEngine(tpl.defaultEngine);
    setTrafficEnabled(tpl.trafficEnabled);
    setMaxClients(tpl.maxClients);
  };

  const suggestPorts = async () => {
    try {
      const p = await apiFetch<{ udp_port: number; tcp_port: number; http_port: number }>(
        '/api/servers/suggest-ports'
      );
      setUdpPort(p.udp_port);
      setTcpPort(p.tcp_port);
      setHttpPort(p.http_port);
    } catch {
      // ignore
    }
  };

  const toggleCar = (id: string) => {
    setSelectedCarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const togglePack = (id: string) => {
    setSelectedPackIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTrafficCar = (id: string) => {
    setTrafficCarIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleTrafficPack = (id: string) => {
    setTrafficPackIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        engine,
        udp_port: Number(udpPort),
        tcp_port: Number(tcpPort),
        http_port: Number(httpPort),
        password,
        admin_password: adminPassword,
        max_clients: Number(maxClients),
        track_id: trackId,
        track_config: trackConfig,
        car_ids: selectedCarIds,
        pack_ids: selectedPackIds,
        traffic_enabled: engine === 'assettoserver' && trafficEnabled,
        traffic_config: {
          maxAiCount: Number(maxAiCount),
          maxAiPerPlayer: Number(maxAiPerPlayer),
          maxAiTargetCount: Number(maxAiTargetCount),
          maxSpeedKmh: Number(maxSpeedKmh),
          aiDensity: 25,
          rightLaneOffset: 0,
          rightLaneOffsetKph: Number(rightLaneOffsetKph),
          laneWidthMeters: Number(laneWidthMeters),
          playerRadiusMeters: Number(playerRadiusMeters),
          playerPositionOffsetMeters: Number(playerPositionOffsetMeters),
          minSpawnDistancePoints: Number(minSpawnDistancePoints),
          maxSpawnDistancePoints: Number(maxSpawnDistancePoints),
          maxPlayerDistanceMeters: Number(maxPlayerDistanceMeters),
          minSafetyDistanceMeters: Number(minSafetyDistanceMeters),
          maxSafetyDistanceMeters: Number(maxSafetyDistanceMeters),
          stateSpawnDistanceMeters: Number(stateSpawnDistanceMeters),
          twoWayTraffic,
          trafficCars: trafficCarIds,
          trafficPackIds,
          welcomeMessage,
        },
        template,
        description,
        rules_text: rulesText,
        banner_url: bannerUrl.trim(),
        weather_preset: weatherPreset,
        time_of_day: timeOfDay,
        time_multiplier: Number(timeMultiplier),
        cm_autodownload: cmAutodownload,
        register_to_lobby: registerToLobby,
        memory_limit_mb: Number(memoryLimitMb),
        cpu_limit: 0,
        auto_start: autoStart,
      };

      if (isEdit && initialServer) {
        await apiFetch(`/api/servers/${initialServer.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        const res = await apiFetch<{ startError?: string }>('/api/servers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.startError) {
          alert(`Sunucu oluşturuldu ancak otomatik başlatılamadı: ${res.startError}`);
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sunucu kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const hasMarkedTrafficCars = cars.some((c) => c.is_traffic);

  // Exclude AI traffic cars from player car picker by default so they don't clutter the list
  const filteredCars = cars.filter((c) => {
    if (c.is_traffic && !showTrafficInPlayerList && !selectedCarIds.includes(c.id)) {
      return false;
    }
    return (
      c.name.toLowerCase().includes(carSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(carSearch.toLowerCase()) ||
      c.brand.toLowerCase().includes(carSearch.toLowerCase())
    );
  });

  // Prioritize marked AI traffic cars in traffic picker
  const filteredTrafficCars = cars
    .filter((c) => {
      if (hasMarkedTrafficCars && !showAllCarsInTrafficList && !c.is_traffic && !trafficCarIds.includes(c.id)) {
        return false;
      }
      return (
        c.name.toLowerCase().includes(trafficCarSearch.toLowerCase()) ||
        c.id.toLowerCase().includes(trafficCarSearch.toLowerCase()) ||
        c.brand.toLowerCase().includes(trafficCarSearch.toLowerCase())
      );
    })
    .sort((a, b) => Number(b.is_traffic) - Number(a.is_traffic));

  const playerPacks = packs.filter(
    (p) => p.category !== 'traffic' || selectedPackIds.includes(p.id)
  );
  const sortedTrafficPacks = [...packs].sort(
    (a, b) => Number(b.category === 'traffic') - Number(a.category === 'traffic')
  );

  const ufwPreview = `sudo ufw allow ${udpPort}/udp && sudo ufw allow ${tcpPort}/tcp && sudo ufw allow ${httpPort}/tcp`;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0f1520] border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEdit ? 'Sunucuyu Düzenle' : 'Yeni Assetto Corsa Sunucusu Oluştur'}
            </h2>
            <p className="text-xs text-slate-400">
              Motoru (AssettoServer / acServer), portları, haritayı ve pack&apos;leri seçin.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-950/60 border border-red-700/70 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Templates */}
          {!isEdit && templates.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Hazır Şablon Seç (Opsiyonel)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyTemplate(tpl)}
                    className={`text-left p-3 rounded-xl border transition ${
                      template === tpl.id
                        ? 'bg-red-600/15 border-red-500/70 text-white'
                        : 'bg-[#090d14] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-xs">{tpl.name}</div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Engine Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2.5">
              <Cpu className="w-3.5 h-3.5 text-red-400" />
              Sunucu Motoru Seçimi
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEngine('assettoserver')}
                className={`p-4 rounded-xl border text-left transition ${
                  engine === 'assettoserver'
                    ? 'bg-red-600/15 border-red-500 text-white ring-1 ring-red-500/40'
                    : 'bg-[#090d14] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">AssettoServer</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                    Trafik &amp; CSP
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  AI Trafik, Shutoko / No Hesi, CSP Extra Options, dinamik hava ve freeroam için önerilir.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEngine('vanilla');
                  setTrafficEnabled(false);
                }}
                className={`p-4 rounded-xl border text-left transition ${
                  engine === 'vanilla'
                    ? 'bg-red-600/15 border-red-500 text-white ring-1 ring-red-500/40'
                    : 'bg-[#090d14] border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">Vanilla Kunos acServer</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300">
                    Klasik Yarış
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Resmi Kunos sunucusu. Sıralama, yarış, drift ve standart pist oturumları için idealdir.
                </p>
              </button>
            </div>
          </div>

          {/* Core Info & Manual Ports */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Sunucu Adı *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="panel-input"
                placeholder="Örn: TR Shutoko Trafik #1"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Maksimum Oyuncu
              </label>
              <input
                type="number"
                min={2}
                max={128}
                value={maxClients}
                onChange={(e) => setMaxClients(Number(e.target.value))}
                className="panel-input"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Sunucu Şifresi (Boş = Herkese Açık)
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="panel-input"
                placeholder="Opsiyonel"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Admin Şifresi</label>
              <input
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="panel-input"
                required
              />
            </div>
          </div>

          {/* Manual Port Selection */}
          <div className="p-4 rounded-xl bg-[#090d14] border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Sunucu Portları (Manuel Seçim)</span>
              </div>
              <button
                type="button"
                onClick={suggestPorts}
                className="text-xs text-red-400 hover:text-red-300 inline-flex items-center gap-1"
              >
                <Wand2 className="w-3.5 h-3.5" /> Boş Port Öner
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">UDP Portu</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={udpPort}
                  onChange={(e) => setUdpPort(Number(e.target.value))}
                  className="panel-input font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">TCP Portu</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={tcpPort}
                  onChange={(e) => setTcpPort(Number(e.target.value))}
                  className="panel-input font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">HTTP (Lobby) Portu</label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={httpPort}
                  onChange={(e) => setHttpPort(Number(e.target.value))}
                  className="panel-input font-mono"
                  required
                />
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-800 overflow-x-auto">
              UFW Komutu: <span className="text-emerald-400">{ufwPreview}</span>
            </div>
          </div>

          {/* Packs (Player / General Packs) */}
          {playerPacks.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2">
                <Boxes className="w-3.5 h-3.5 text-purple-400" />
                Pack Bağla ({selectedPackIds.length} seçili)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {playerPacks.map((pack) => {
                  const active = selectedPackIds.includes(pack.id);
                  return (
                    <button
                      key={pack.id}
                      type="button"
                      onClick={() => togglePack(pack.id)}
                      className={`p-3 rounded-xl border text-left transition ${
                        active
                          ? 'bg-purple-600/15 border-purple-500 text-white'
                          : 'bg-[#090d14] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">{pack.name}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {pack.car_ids.length} araba • {pack.track_ids.length} harita
                        </span>
                      </div>
                      {pack.description && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{pack.description}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Track & Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Harita (Track)
              </label>
              <select
                value={trackId}
                onChange={(e) => {
                  setTrackId(e.target.value);
                  setTrackConfig('');
                }}
                className="panel-input"
              >
                <option value="">-- Kütüphaneden harita seç (veya Pack&apos;ten al) --</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.id}) {t.has_ai_spline ? '[AI Trafik Uygun]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Harita Layout (Varsa)
              </label>
              {selectedTrack && selectedTrack.layouts.length > 0 ? (
                <select
                  value={trackConfig}
                  onChange={(e) => setTrackConfig(e.target.value)}
                  className="panel-input"
                >
                  <option value="">Varsayılan Layout</option>
                  {selectedTrack.layouts.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={trackConfig}
                  onChange={(e) => setTrackConfig(e.target.value)}
                  className="panel-input"
                  placeholder="Boş bırakılabilir"
                />
              )}
            </div>
          </div>

          {/* Cars Picker */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5 text-sky-400" />
                Oyuncu Arabaları Seç ({selectedCarIds.length} seçili)
              </label>
              <div className="flex items-center gap-3">
                {hasMarkedTrafficCars && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTrafficInPlayerList}
                      onChange={(e) => setShowTrafficInPlayerList(e.target.checked)}
                      className="w-3.5 h-3.5 accent-amber-500"
                    />
                    Trafik araçlarını da göster
                  </label>
                )}
                <input
                  type="text"
                  value={carSearch}
                  onChange={(e) => setCarSearch(e.target.value)}
                  placeholder="Araba ara..."
                  className="bg-[#090d14] border border-slate-700 rounded-lg px-3 py-1 text-xs text-slate-200 w-44"
                />
              </div>
            </div>

            {cars.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#090d14] border border-slate-800 text-xs text-slate-400 text-center">
                Henüz kütüphaneye araba yüklenmemiş. &quot;Harita &amp; Arabalar&quot; sayfasından yükleyebilirsiniz.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-1">
                {filteredCars.map((car) => {
                  const active = selectedCarIds.includes(car.id);
                  const hasErrWarn = car.warnings?.some((w) => w.severity === 'error');
                  const hasWarn = car.warnings && car.warnings.length > 0;
                  return (
                    <button
                      key={car.id}
                      type="button"
                      onClick={() => toggleCar(car.id)}
                      title={hasWarn ? car.warnings.map((w) => w.message).join(' | ') : undefined}
                      className={`px-3 py-2 rounded-lg border text-left text-xs transition ${
                        active
                          ? 'bg-sky-600/20 border-sky-500 text-white'
                          : hasErrWarn
                            ? 'bg-red-950/25 border-red-800/70 text-slate-200 hover:border-red-600'
                            : 'bg-[#090d14] border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold truncate">{car.name}</span>
                        {hasWarn && (
                          <AlertTriangle
                            className={`w-3.5 h-3.5 shrink-0 ${
                              hasErrWarn ? 'text-red-400' : 'text-amber-400'
                            }`}
                          />
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {car.id} {car.is_kunos ? '• Kunos' : ''}
                        {hasErrWarn ? ' • Sunucu kilidi uyarısı!' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* AssettoServer Traffic */}
          {engine === 'assettoserver' && (
            <div className="p-4 rounded-xl bg-[#090d14] border border-slate-800 space-y-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trafficEnabled}
                  onChange={(e) => setTrafficEnabled(e.target.checked)}
                  className="w-4 h-4 accent-red-600"
                />
                <span className="text-sm font-semibold text-white">
                  AI Trafik Aktif (AssettoServer extra_cfg.yml)
                </span>
              </label>

              {trafficEnabled && (
                <div className="space-y-3 pt-1">
                  {/* One-click traffic density presets */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-400">Hızlı Yoğunluk Ayarı:</span>
                    {[
                      {
                        label: 'Hafif (Cruise)',
                        vals: {
                          maxAiCount: 60,
                          maxAiPerPlayer: 20,
                          maxAiTargetCount: 120,
                          minSafety: 16,
                          maxSafety: 42,
                          radius: 450,
                          offset: 100,
                          minPts: 100,
                          maxPts: 400,
                          stateDist: 140,
                        },
                      },
                      {
                        label: 'Normal',
                        vals: {
                          maxAiCount: 100,
                          maxAiPerPlayer: 35,
                          maxAiTargetCount: 200,
                          minSafety: 12,
                          maxSafety: 26,
                          radius: 360,
                          offset: 120,
                          minPts: 80,
                          maxPts: 300,
                          stateDist: 110,
                        },
                      },
                      {
                        label: 'Yoğun (Shutoko)',
                        vals: {
                          maxAiCount: 140,
                          maxAiPerPlayer: 65,
                          maxAiTargetCount: 260,
                          minSafety: 9,
                          maxSafety: 18,
                          radius: 320,
                          offset: 130,
                          minPts: 65,
                          maxPts: 250,
                          stateDist: 85,
                        },
                      },
                      {
                        label: 'No Hesi Extreme',
                        vals: {
                          maxAiCount: 160,
                          maxAiPerPlayer: 95,
                          maxAiTargetCount: 320,
                          minSafety: 7,
                          maxSafety: 14,
                          radius: 280,
                          offset: 140,
                          minPts: 55,
                          maxPts: 220,
                          stateDist: 65,
                        },
                      },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setMaxAiCount(preset.vals.maxAiCount);
                          setMaxAiPerPlayer(preset.vals.maxAiPerPlayer);
                          setMaxAiTargetCount(preset.vals.maxAiTargetCount);
                          setMinSafetyDistanceMeters(preset.vals.minSafety);
                          setMaxSafetyDistanceMeters(preset.vals.maxSafety);
                          setPlayerRadiusMeters(preset.vals.radius);
                          setPlayerPositionOffsetMeters(preset.vals.offset);
                          setMinSpawnDistancePoints(preset.vals.minPts);
                          setMaxSpawnDistancePoints(preset.vals.maxPts);
                          setStateSpawnDistanceMeters(preset.vals.stateDist);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-red-600/25 border border-slate-700 hover:border-red-500/60 text-[11px] font-medium text-slate-200 transition"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      AI Araç Slotu (entry_list)
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={200}
                      value={maxAiCount}
                      onChange={(e) => setMaxAiCount(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-amber-300 font-medium mb-1">
                      Oyuncu Başı Hedef AI (Asıl Yoğunluk)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={150}
                      value={maxAiPerPlayer}
                      onChange={(e) => setMaxAiPerPlayer(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Global Maks. AI Hedefi
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={400}
                      value={maxAiTargetCount}
                      onChange={(e) => setMaxAiTargetCount(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Trafik Maks. Hız (km/h)</label>
                    <input
                      type="number"
                      min={30}
                      max={300}
                      value={maxSpeedKmh}
                      onChange={(e) => setMaxSpeedKmh(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Sağ Şerit Hız Farkı (km/h, 0 = Eşit)
                    </label>
                    <input
                      type="number"
                      min={-60}
                      max={60}
                      value={rightLaneOffsetKph}
                      onChange={(e) => setRightLaneOffsetKph(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Şerit Genişliği (LaneWidth, m)
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      min={2}
                      max={6}
                      value={laneWidthMeters}
                      onChange={(e) => setLaneWidthMeters(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Min Araç Mesafesi (m, önerilen 7-12)
                    </label>
                    <input
                      type="number"
                      min={3}
                      max={50}
                      value={minSafetyDistanceMeters}
                      onChange={(e) => setMinSafetyDistanceMeters(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Maks Araç Mesafesi (m, önerilen 14-26)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={80}
                      value={maxSafetyDistanceMeters}
                      onChange={(e) => setMaxSafetyDistanceMeters(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Oyuncu-Spline Mesafesi (m)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={80}
                      value={maxPlayerDistanceMeters}
                      onChange={(e) => setMaxPlayerDistanceMeters(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Spawn Yarıçapı (PlayerRadius, m)
                    </label>
                    <input
                      type="number"
                      min={150}
                      max={1000}
                      value={playerRadiusMeters}
                      onChange={(e) => setPlayerRadiusMeters(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Min / Maks Spawn Noktası (Ön)
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={20}
                        max={400}
                        value={minSpawnDistancePoints}
                        onChange={(e) => setMinSpawnDistancePoints(Number(e.target.value))}
                        className="panel-input"
                        title="MinSpawnDistancePoints"
                      />
                      <input
                        type="number"
                        min={80}
                        max={1000}
                        value={maxSpawnDistancePoints}
                        onChange={(e) => setMaxSpawnDistancePoints(Number(e.target.value))}
                        className="panel-input"
                        title="MaxSpawnDistancePoints"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Aynı Model Mesafesi (StateSpawn, m)
                    </label>
                    <input
                      type="number"
                      min={30}
                      max={500}
                      value={stateSpawnDistanceMeters}
                      onChange={(e) => setStateSpawnDistanceMeters(Number(e.target.value))}
                      className="panel-input"
                    />
                  </div>
                  <div className="flex items-end pb-2 sm:col-span-3">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={twoWayTraffic}
                        onChange={(e) => setTwoWayTraffic(e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                      />
                      Çift Yönlü Trafik (TwoWayTraffic — kapalıyken tüm araçlar senin şeritlerine yoğunlaşır)
                    </label>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs text-slate-400 mb-1">Karşılama Mesajı</label>
                    <input
                      type="text"
                      value={welcomeMessage}
                      onChange={(e) => setWelcomeMessage(e.target.value)}
                      className="panel-input"
                      placeholder="Sunucuya hoş geldiniz!"
                    />
                  </div>

                  {/* Separate AI Traffic Pack & Car Picker */}
                  <div className="sm:col-span-3 pt-2 border-t border-slate-800/80 space-y-3">
                    <p className="text-[11px] text-amber-300/90">
                      Aşağıdan sadece <strong>AI Trafik</strong> olarak yolda dolaşacak Pack veya
                      arabaları ayrı seçebilirsiniz. Oyuncular garajda bu araçları seçemez ama
                      davet linkinden otomatik indirebilir. (Boş bırakırsanız yukarıdaki oyuncu
                      arabaları trafikte kullanılır.)
                    </p>

                    {sortedTrafficPacks.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Sadece AI Trafik Pack&apos;i Seç ({trafficPackIds.length} seçili)
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {sortedTrafficPacks.map((pack) => {
                            const active = trafficPackIds.includes(pack.id);
                            return (
                              <button
                                key={pack.id}
                                type="button"
                                onClick={() => toggleTrafficPack(pack.id)}
                                className={`p-2.5 rounded-lg border text-left text-xs transition ${
                                  active
                                    ? 'bg-amber-600/20 border-amber-500 text-white'
                                    : 'bg-[#0c111b] border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold truncate flex items-center gap-1.5">
                                    {pack.name}
                                    {pack.category === 'traffic' && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                                        Trafik Pack
                                      </span>
                                    )}
                                  </span>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    {pack.car_ids.length} araba
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {cars.length > 0 && (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <label className="text-xs font-semibold text-slate-300">
                            Sadece AI Trafik Arabaları ({trafficCarIds.length} seçili)
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            {hasMarkedTrafficCars && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setTrafficCarIds(
                                      cars.filter((c) => c.is_traffic).map((c) => c.id)
                                    )
                                  }
                                  className="text-[11px] text-amber-400 hover:text-amber-300"
                                >
                                  Tüm Trafik Araçlarını Seç
                                </button>
                                <label className="inline-flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={showAllCarsInTrafficList}
                                    onChange={(e) => setShowAllCarsInTrafficList(e.target.checked)}
                                    className="w-3.5 h-3.5 accent-amber-500"
                                  />
                                  Tüm arabalar
                                </label>
                              </>
                            )}
                            <input
                              type="text"
                              value={trafficCarSearch}
                              onChange={(e) => setTrafficCarSearch(e.target.value)}
                              placeholder="Trafik aracı ara..."
                              className="bg-[#0c111b] border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 w-40"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1">
                          {filteredTrafficCars.map((car) => {
                            const active = trafficCarIds.includes(car.id);
                            return (
                              <button
                                key={car.id}
                                type="button"
                                onClick={() => toggleTrafficCar(car.id)}
                                className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition ${
                                  active
                                    ? 'bg-amber-600/20 border-amber-500 text-white'
                                    : 'bg-[#0c111b] border-slate-800 text-slate-300 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-semibold truncate">{car.name}</span>
                                  {car.is_traffic && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                                      AI
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate">{car.id}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Weather & Time of Day */}
          <div className="p-4 rounded-xl bg-[#090d14] border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <CloudSun className="w-4 h-4 text-sky-400" /> Hava Durumu &amp; Saat Ayarları
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Saat / Gündüz-Gece</label>
                <select
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="panel-input"
                >
                  {timeOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Hava Durumu</label>
                <select
                  value={weatherPreset}
                  onChange={(e) => setWeatherPreset(e.target.value)}
                  className="panel-input"
                >
                  {weatherOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Zaman Akış Hızı (0 = Sabit, 1 = Normal)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  value={timeMultiplier}
                  onChange={(e) => setTimeMultiplier(Number(e.target.value))}
                  className="panel-input"
                />
              </div>
            </div>
          </div>

          {/* Description, Join Page Customization & RAM */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Oyuncu Davet Sayfası Açıklaması
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="panel-input"
                placeholder="Örn: Hafta sonu Shutoko trafik buluşması"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Davet Sayfası Banner / Logo URL (Opsiyonel)
              </label>
              <input
                type="url"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
                className="panel-input"
                placeholder="https://ornek.com/sunucu-banner.jpg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Sunucu Kuralları (Her satıra 1 kural — Davet sayfasında görünür)
              </label>
              <textarea
                rows={3}
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                className="panel-input text-xs"
                placeholder={"Ters yöne girmek yasak\nKasıtlı çarpma yasak\nSaygılı sürüş"}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                RAM Limiti (MB, 0 = Sınırsız)
              </label>
              <input
                type="number"
                min={0}
                step={256}
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                className="panel-input"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cmAutodownload}
                onChange={(e) => setCmAutodownload(e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              Content Manager Eksik Mod İndirme Entegrasyonu (csp_extra_options)
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={registerToLobby}
                onChange={(e) => setRegisterToLobby(e.target.checked)}
                className="w-4 h-4 accent-red-600"
              />
              Kunos Genel Lobisinde Listele (REGISTER_TO_LOBBY — NAT/kapalı portta kapalı tutun)
            </label>

            {!isEdit && (
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoStart}
                  onChange={(e) => setAutoStart(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500"
                />
                Oluşturunca Hemen Başlat
              </label>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button type="button" onClick={onClose} className="btn-secondary">
              İptal
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Kaydediliyor...' : isEdit ? 'Değişiklikleri Kaydet' : 'Sunucuyu Oluştur'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
