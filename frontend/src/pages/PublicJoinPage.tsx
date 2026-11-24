import {
  Boxes,
  Car,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Hash,
  Lock,
  MapPin,
  Package,
  Play,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch, copyToClipboard, formatBytes, type PublicJoinPayload } from '../lib/api';

export default function PublicJoinPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PublicJoinPayload | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const load = () =>
      apiFetch<PublicJoinPayload>(`/api/public/join/${encodeURIComponent(slug)}`)
        .then((res) => {
          setData(res);
          setError('');
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Sunucu bulunamadı.'));

    load();
    const timer = setInterval(load, 12000);
    return () => clearInterval(timer);
  }, [slug]);

  const copyAddress = async () => {
    if (!data) return;
    await copyToClipboard(`${data.server.publicIp}:${data.server.httpPort}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#090d14] flex items-center justify-center p-6 text-center">
        <div className="panel-card p-8 max-w-md">
          <h1 className="text-xl font-bold text-white">Sunucu Bulunamadı</h1>
          <p className="text-sm text-slate-400 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#090d14] flex items-center justify-center text-slate-400 text-sm">
        Sunucu bilgileri yükleniyor...
      </div>
    );
  }

  const { server, status, track, cars, packs, bundle } = data;

  return (
    <div className="min-h-screen bg-[#090d14] text-slate-100">
      {/* Top Hero */}
      <div
        className="border-b border-slate-800/80 bg-gradient-to-b from-[#131b2b] to-[#090d14] relative overflow-hidden"
        style={
          server.bannerUrl
            ? {
                backgroundImage: `linear-gradient(to bottom, rgba(9,13,20,0.72), rgba(9,13,20,0.96)), url(${server.bannerUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${
                status.running
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  status.running ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                }`}
              />
              {status.running ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI'}
            </span>

            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700">
              {server.engine === 'assettoserver' ? 'AssettoServer' : 'Vanilla acServer'}
            </span>

            {server.trafficEnabled && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                AI Trafik Aktif
              </span>
            )}

            {server.hasPassword && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
                <Lock className="w-3 h-3" /> Şifreli
              </span>
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                {server.name}
              </h1>
              {server.description && (
                <p className="text-slate-300 text-sm sm:text-base mt-2 max-w-2xl">
                  {server.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-slate-400 font-mono">
                <span className="inline-flex items-center gap-1.5 text-slate-200 font-sans font-semibold">
                  <Users className="w-4 h-4 text-emerald-400" />
                  {status.onlinePlayers} / {status.maxClients} Oyuncu
                </span>
                <span>
                  IP: {server.publicIp} • UDP:{server.udpPort} / HTTP:{server.httpPort}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={server.joinLinks.cmDirectLink}
                className="inline-flex items-center justify-center gap-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-sm sm:text-base px-6 py-3.5 rounded-xl shadow-xl shadow-red-950/50 transition"
              >
                <Play className="w-5 h-5 fill-current" />
                Content Manager ile Direkt Bağlan
              </a>
              <button
                onClick={copyAddress}
                className="btn-secondary py-3.5 px-4"
                title="Sunucu IP:HTTP Portunu Kopyala"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" /> Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> IP Kopyala
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Custom Server Rules */}
        {server.rules && server.rules.trim().length > 0 && (
          <section className="panel-card p-5 border-amber-500/30 bg-amber-950/10">
            <h2 className="text-sm font-bold text-amber-300 mb-2">Sunucu Kuralları</h2>
            <ul className="space-y-1 text-xs sm:text-sm text-slate-200 list-disc pl-5">
              {server.rules
                .split(/\r?\n/)
                .map((r) => r.trim())
                .filter(Boolean)
                .map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
            </ul>
          </section>
        )}

        {/* All-in-One Bundle Banner */}
        {bundle.available && (
          <div className="rounded-2xl bg-gradient-to-r from-emerald-950/60 via-[#0f1a24] to-[#0f1520] border border-emerald-500/30 p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <Package className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  Tek Tıkla Tüm Gerekli Modları İndir (.ZIP)
                </h2>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Bu sunucudaki birebir aynı sürüm <strong>{bundle.downloadableCount} özel mod</strong>{' '}
                  (harita + arabalar) tek paket halinde hazırlanmıştır. İndirip Content Manager&apos;a
                  sürükle-bırak yapmanız yeterlidir.
                </p>
                <div className="flex flex-wrap gap-3 mt-2 text-xs font-mono text-emerald-300/90">
                  <span>
                    Tahmini Boyut: {formatBytes(bundle.cachedSize || bundle.totalEstimatedSize)}
                  </span>
                  {bundle.sha256 && <span>SHA: {bundle.sha256}</span>}
                </div>
              </div>
            </div>

            <a
              href={bundle.downloadUrl}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm px-5 py-3 rounded-xl shadow-lg shadow-emerald-950/50 transition shrink-0 w-full sm:w-auto"
            >
              <Download className="w-4 h-4" /> Tüm Modları İndir
            </a>
          </div>
        )}

        {/* Required Track */}
        <section className="space-y-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" /> Kurulması Gereken Harita (Track)
          </h2>

          {!track ? (
            <div className="panel-card p-5 text-sm text-slate-400">Harita bilgisi tanımlanmamış.</div>
          ) : (
            <div className="panel-card overflow-hidden flex flex-col sm:flex-row">
              {track.previewUrl && (
                <img
                  src={track.previewUrl}
                  alt={track.name}
                  className="sm:w-64 h-44 sm:h-auto object-cover bg-slate-900"
                />
              )}
              <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xl font-bold text-white">{track.name}</h3>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        v{track.version}
                      </span>
                      {track.sha256 && (
                        <span
                          className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 inline-flex items-center gap-1"
                          title="Dosya Sürüm Doğrulama Kodu (SHA-256)"
                        >
                          <Hash className="w-3 h-3" /> {track.sha256}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-1">
                    {track.id} {track.layout ? `• Layout: ${track.layout}` : ''}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-300">
                    {track.country && <span>Ülke: {track.country}</span>}
                    {track.length && <span>Uzunluk: {track.length} m</span>}
                    <span>Pit Kapasitesi: {track.pitboxes}</span>
                    {track.downloadSize > 0 && (
                      <span className="font-mono text-slate-400">
                        Boyut: {formatBytes(track.downloadSize)}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {track.is_kunos ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30">
                      <ShieldCheck className="w-4 h-4" /> Orijinal Kunos İçeriği (Oyunla Gelir — İndirmeye Gerek Yok)
                    </span>
                  ) : track.downloadUrl ? (
                    <a
                      href={track.downloadUrl}
                      className="btn-primary"
                    >
                      <Download className="w-4 h-4" /> Haritayı Sunucudan İndir (
                      {formatBytes(track.downloadSize)})
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">İndirme arşivi mevcut değil.</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Required Cars */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Car className="w-5 h-5 text-sky-400" /> Kurulması Gereken Arabalar ({cars.length})
            </h2>
            <span className="text-xs text-slate-400">
              Üzerine tıklayarak birebir sunucudaki sürümü indirebilirsiniz
            </span>
          </div>

          {cars.length === 0 ? (
            <div className="panel-card p-5 text-sm text-slate-400">
              Bu sunucuda tanımlı özel araba listesi bulunmuyor.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cars.map((car) => {
                const clickable = !car.is_kunos && Boolean(car.downloadUrl);
                const CardTag = clickable ? 'a' : 'div';
                return (
                  <CardTag
                    key={car.id}
                    {...(clickable ? { href: car.downloadUrl! } : {})}
                    className={`panel-card overflow-hidden flex flex-col transition ${
                      clickable
                        ? 'hover:border-red-500/70 hover:bg-[#131b29] cursor-pointer group'
                        : ''
                    }`}
                  >
                    {car.previewUrl && (
                      <img
                        src={car.previewUrl}
                        alt={car.name}
                        className="w-full h-36 object-cover bg-slate-900 group-hover:scale-[1.02] transition duration-300"
                      />
                    )}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-white text-sm group-hover:text-red-300 transition">
                            {car.name}
                          </h3>
                          <div className="flex items-center gap-1 shrink-0">
                            {car.isTrafficOnly && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                AI Trafik
                              </span>
                            )}
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                              v{car.version}
                            </span>
                          </div>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                          {car.id}
                        </div>
                        {car.sha256 && (
                          <div className="text-[10px] font-mono text-slate-500 mt-1">
                            Hash: {car.sha256}
                          </div>
                        )}
                      </div>

                      <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        {car.is_kunos ? (
                          <span className="inline-flex items-center gap-1 text-blue-300">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Oyunla Gelir (Kunos)
                          </span>
                        ) : car.downloadUrl ? (
                          <>
                            <span className="font-mono text-slate-400">
                              {formatBytes(car.downloadSize)}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-red-400 group-hover:text-red-300">
                              <Download className="w-3.5 h-3.5" /> İndir (.zip)
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-500">Arşiv yok</span>
                        )}
                      </div>
                    </div>
                  </CardTag>
                );
              })}
            </div>
          )}
        </section>

        {/* Attached Packs */}
        {packs.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-purple-400" /> Sunucuya Bağlı Pack&apos;ler
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className="panel-card p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{pack.name}</div>
                    {pack.description && (
                      <div className="text-xs text-slate-400 truncate mt-0.5">
                        {pack.description}
                      </div>
                    )}
                    <div className="text-[11px] font-mono text-slate-500 mt-1">
                      v{pack.version} {pack.sha256 ? `• ${pack.sha256}` : ''}{' '}
                      {pack.downloadSize > 0 ? `• ${formatBytes(pack.downloadSize)}` : ''}
                    </div>
                  </div>
                  {pack.downloadUrl && (
                    <a href={pack.downloadUrl} className="btn-secondary text-xs shrink-0">
                      <Download className="w-3.5 h-3.5" /> Pack İndir
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Online Players */}
        {status.running && status.players.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" /> Şu An Pistte Olan Oyuncular (
              {status.players.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {status.players.map((p, i) => (
                <div
                  key={i}
                  className="panel-card px-4 py-3 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-white truncate">{p.name}</span>
                  <span className="font-mono text-slate-400 truncate ml-2">{p.car}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quick Install Guide */}
        <section className="panel-card p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-red-400" /> 3 Adımda Sorunsuz Kurulum &amp; Bağlanma
            </h3>
            <a
              href="https://acstuff.club/app/"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1"
            >
              Content Manager yüklü değil mi? Buradan indirin <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
            <li className="p-3.5 rounded-xl bg-[#090d14] border border-slate-800">
              <div className="font-bold text-white mb-1">1. Modları İndirin</div>
              Yukarıdan <strong>&quot;Tüm Modları İndir&quot;</strong> butonuna basın veya eksik olan
              harita/arabaların üzerine tıklayıp doğrudan sunucudan indirin.
            </li>
            <li className="p-3.5 rounded-xl bg-[#090d14] border border-slate-800">
              <div className="font-bold text-white mb-1">2. Content Manager&apos;a Sürükleyin</div>
              İnen <code className="text-emerald-300">.zip</code> dosyasını doğrudan Content Manager
              penceresine sürükleyip bırakın ve sağ üstten <strong>Install</strong> butonuna tıklayın.
            </li>
            <li className="p-3.5 rounded-xl bg-[#090d14] border border-slate-800">
              <div className="font-bold text-white mb-1">3. Tek Tıkla Bağlanın</div>
              Kurulum tamamlandıktan sonra yukarıdaki{' '}
              <strong className="text-red-400">&quot;Content Manager ile Direkt Bağlan&quot;</strong>{' '}
              butonuna tıklayarak hemen sunucuya katılın!
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
