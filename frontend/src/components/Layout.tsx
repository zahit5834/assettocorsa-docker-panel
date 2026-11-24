import {
  Boxes,
  Car,
  Gauge,
  LogOut,
  Menu,
  Server,
  Settings,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearToken } from '../lib/api';

const navItems = [
  { to: '/', label: 'Genel Bakış', icon: Gauge },
  { to: '/servers', label: 'Sunucular', icon: Server },
  { to: '/content', label: 'Harita & Arabalar', icon: Car },
  { to: '/packs', label: 'Pack Yöneticisi', icon: Boxes },
  { to: '/settings', label: 'Ayarlar & Motorlar', icon: Settings },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const logout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-[#090d14] text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-[#0d131d] border-r border-slate-800/80 sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-slate-800/80 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center font-black text-white shadow-lg shadow-red-950/50">
            AC
          </div>
          <div>
            <div className="font-bold tracking-tight text-white">AC Docker Panel</div>
            <div className="text-xs text-slate-400">Multi-Server Manager</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-red-600/15 text-red-400 border border-red-500/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800/80">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-950/30 transition"
          >
            <LogOut className="w-4 h-4" />
            Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Mobile Header + Drawer */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0d131d] border-b border-slate-800/80 sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center font-black text-sm">
              AC
            </div>
            <span className="font-bold text-sm">AC Docker Panel</span>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {mobileOpen && (
          <div className="lg:hidden bg-[#0d131d] border-b border-slate-800 px-3 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                      isActive ? 'bg-red-600/15 text-red-400' : 'text-slate-300 hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              );
            })}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-950/30"
            >
              <LogOut className="w-4 h-4" />
              Çıkış Yap
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
