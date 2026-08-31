import React, { useEffect, useState, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  FileText,
  PieChart,
  ShieldAlert,
  Users,
  X,
  ExternalLink,
  Clock,
  Sparkles,
} from 'lucide-react';
import { AppNotification } from '../types/erp.js';
import { api } from '../services/api.js';

interface Props {
  onNavigateTab?: (tab: string, entityId?: string) => void;
}

export const NotificationCenter: React.FC<Props> = ({ onNavigateTab }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const list = await api.getNotifications();
      setNotifications(list);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemClick = (notif: AppNotification) => {
    if (!notif.isRead) {
      api.markNotificationRead(notif.id);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
    }
    if (notif.actionTab && onNavigateTab) {
      onNavigateTab(notif.actionTab, notif.entityId);
      setIsOpen(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filteredNotifications = filter === 'UNREAD' ? notifications.filter((n) => !n.isRead) : notifications;

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'APPROVAL_PENDING':
        return <FileText className="w-4 h-4 text-amber-400" />;
      case 'BUDGET_OVERRUN':
        return <PieChart className="w-4 h-4 text-rose-400" />;
      case 'ANOMALY_DETECTED':
        return <Sparkles className="w-4 h-4 text-indigo-400" />;
      case 'DEBTOR_LIMIT':
        return <Users className="w-4 h-4 text-blue-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
        title="مركز الإشعارات والتنبيهات اللحظية"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white font-bold text-[10px] rounded-full flex items-center justify-center animate-pulse shadow-md shadow-rose-950/60">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-96 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-100">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-white">مركز التنبيهات والرقابة اللحظية</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px] font-semibold">
                  {unreadCount} جديد
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                تحديد الكل كمقروء
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-700/60 flex items-center gap-2 text-xs">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('UNREAD')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                filter === 'UNREAD' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                لا توجد تنبيهات جديدة في هذا التصنيف
              </div>
            ) : (
              filteredNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`p-3.5 hover:bg-slate-800/60 cursor-pointer transition-colors flex items-start gap-3 ${
                    !n.isRead ? 'bg-indigo-950/20' : ''
                  }`}
                >
                  <div className="p-2 rounded-lg bg-slate-800 shrink-0 border border-slate-700">
                    {getIcon(n.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold text-white truncate">{n.title}</p>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">{n.message}</p>
                    <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(n.timestamp).toLocaleTimeString('ar-EG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {n.actionTab && (
                        <span className="text-indigo-400 flex items-center gap-0.5 font-medium hover:underline">
                          عرض الإجراء <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
