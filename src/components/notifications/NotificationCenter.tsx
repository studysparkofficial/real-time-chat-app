import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  MessageCircle,
  Megaphone,
  Phone,
  Settings,
  ShieldAlert,
  Trash2,
  Users,
  Volume2,
  X
} from 'lucide-react';
import {
  AppNotification,
  ChatUser,
  NotificationCategory,
  NotificationSettings
} from '../../types/chat.types';

type Filter = 'all' | 'unread' | NotificationCategory;

interface NotificationCenterProps {
  currentUser: ChatUser | null;
  activeRoomId: string;
  notifications: AppNotification[];
  unreadCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  settings: NotificationSettings;
  mutedRoomIds: Set<string>;
  pushReady: boolean;
  pushBusy: boolean;
  pushError: string | null;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onUpdateSettings: (patch: Partial<NotificationSettings>) => Promise<void>;
  onToggleMute: (roomId: string) => Promise<void>;
  onEnablePush: () => Promise<boolean>;
  onDisablePush: () => Promise<void>;
  onOpenNotification: (notification: AppNotification) => void;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'messages', label: 'Messages' },
  { id: 'calls', label: 'Calls' },
  { id: 'groups', label: 'Groups' },
  { id: 'security', label: 'Security' },
  { id: 'system', label: 'System' }
];

function formatTime(timestamp: number): string {
  if (!timestamp) return 'Just now';
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return 'Just now';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

function CategoryIcon({ category }: { category: NotificationCategory }) {
  if (category === 'calls') return <Phone size={17} />;
  if (category === 'groups') return <Users size={17} />;
  if (category === 'security') return <ShieldAlert size={17} />;
  if (category === 'system') return <Megaphone size={17} />;
  return <MessageCircle size={17} />;
}

interface SettingSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

const SettingSwitch: React.FC<SettingSwitchProps> = ({ label, description, checked, onChange }) => (
  <label className="notification-setting-row">
    <span>
      <span className="notification-setting-label">{label}</span>
      {description && <span className="notification-setting-description">{description}</span>}
    </span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

export const NotificationCenter: React.FC<NotificationCenterProps> = (props) => {
  const {
    currentUser,
    activeRoomId,
    notifications,
    unreadCount,
    hasMore,
    loadingMore,
    settings,
    mutedRoomIds,
    pushReady,
    pushBusy,
    pushError,
    onMarkRead,
    onMarkAllRead,
    onLoadMore,
    onDelete,
    onUpdateSettings,
    onToggleMute,
    onEnablePush,
    onDisablePush,
    onOpenNotification
  } = props;
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const isMuted = mutedRoomIds.has(activeRoomId);
  const browserPushEnabled = pushReady && settings.pushEnabled;

  const visibleNotifications = useMemo(() => notifications.filter((notification) => {
    if (filter === 'unread') return !notification.isRead;
    if (filter === 'all') return true;
    return notification.category === filter;
  }), [filter, notifications]);

  const activateNotification = async (notification: AppNotification) => {
    await onMarkRead(notification.id);
    onOpenNotification(notification);
    setOpen(false);
  };

  if (!currentUser) return null;

  return (
    <div className="notification-center">
      <button
        type="button"
        className="header-action-btn notification-bell-button"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && <span className="notification-count-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-popover" role="dialog" aria-label="Notification center">
          <div className="notification-popover-header">
            <div>
              <h3>Notifications</h3>
              <span>{unreadCount ? `${unreadCount} unread` : 'You are all caught up'}</span>
            </div>
            <div className="notification-header-actions">
              <button type="button" className="notification-icon-button" title="Notification settings" onClick={() => setSettingsOpen(true)}>
                <Settings size={17} />
              </button>
              {unreadCount > 0 && (
                <button type="button" className="notification-icon-button" title="Mark all as read" onClick={() => void onMarkAllRead()}>
                  <CheckCheck size={17} />
                </button>
              )}
              <button type="button" className="notification-icon-button" aria-label="Close notifications" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>
          </div>

          {!browserPushEnabled && (
            <div className="notification-push-banner">
              <div>
                <strong>Get alerts when PulseChat is in the background</strong>
                <span>Messages and incoming calls can appear as browser notifications.</span>
              </div>
              <button type="button" disabled={pushBusy} onClick={() => void onEnablePush()}>
                {pushBusy ? 'Enabling…' : 'Enable'}
              </button>
            </div>
          )}
          {browserPushEnabled && (
            <div className="notification-push-enabled">
              <span><Check size={15} /> Browser alerts are enabled</span>
              <button type="button" disabled={pushBusy} onClick={() => void onDisablePush()}>
                {pushBusy ? 'Disabling…' : 'Turn off'}
              </button>
            </div>
          )}
          {pushError && <p className="notification-push-error" role="alert">{pushError}</p>}

          <div className="notification-filter-tabs" role="tablist" aria-label="Notification categories">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={filter === item.id ? 'active' : ''}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="notification-list">
            {visibleNotifications.length === 0 ? (
              <div className="notification-empty">
                <BellOff size={25} />
                <strong>No notifications here</strong>
                <span>New messages and call updates will show up here.</span>
              </div>
            ) : visibleNotifications.map((notification) => (
              <div key={notification.id} className={`notification-item ${notification.isRead ? '' : 'unread'}`}>
                <button type="button" className="notification-item-open" onClick={() => void activateNotification(notification)}>
                  <span className={`notification-item-icon ${notification.category}`}><CategoryIcon category={notification.category} /></span>
                  <span className="notification-item-copy">
                    <span className="notification-item-title">{notification.title}</span>
                    <span className="notification-item-body">{notification.body}</span>
                    <span className="notification-item-time">{formatTime(notification.createdAt)}</span>
                  </span>
                  {!notification.isRead && <span className="notification-unread-dot" aria-label="Unread" />}
                </button>
                <div className="notification-item-actions">
                  {!notification.isRead && (
                    <button type="button" title="Mark as read" aria-label="Mark as read" onClick={() => void onMarkRead(notification.id)}>
                      <Check size={14} />
                    </button>
                  )}
                  <button type="button" title="Delete notification" aria-label="Delete notification" onClick={() => void onDelete(notification.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {hasMore && (
              <button type="button" className="notification-load-more" disabled={loadingMore} onClick={() => void onLoadMore()}>
                {loadingMore ? 'Loading…' : 'Load older notifications'}
              </button>
            )}
          </div>

          <div className="notification-popover-footer">
            <button type="button" onClick={() => void onToggleMute(activeRoomId)}>
              {isMuted ? <Bell size={15} /> : <BellOff size={15} />}
              {isMuted ? 'Unmute this chat' : 'Mute this chat'}
            </button>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="notification-settings-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="notification-settings-panel" role="dialog" aria-modal="true" aria-label="Notification settings">
            <header>
              <div><h3>Notification settings</h3><p>Choose what PulseChat alerts you about.</p></div>
              <button type="button" className="notification-icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={19} /></button>
            </header>
            <div className="notification-settings-content">
              <h4>Messages and chats</h4>
              <SettingSwitch label="Personal messages" checked={settings.personalMessages} onChange={(value) => void onUpdateSettings({ personalMessages: value })} />
              <SettingSwitch label="Channel messages" description="Only channels where you opt in; off by default." checked={settings.groupMessages} onChange={(value) => void onUpdateSettings({ groupMessages: value })} />
              <SettingSwitch label="Mentions" checked={settings.mentions} onChange={(value) => void onUpdateSettings({ mentions: value })} />
              <SettingSwitch label="Replies to your messages" checked={settings.replies} onChange={(value) => void onUpdateSettings({ replies: value })} />
              <SettingSwitch label="Reactions to your messages" checked={settings.reactions} onChange={(value) => void onUpdateSettings({ reactions: value })} />

              <h4>Calls</h4>
              <SettingSwitch label="Voice calls" checked={settings.voiceCalls} onChange={(value) => void onUpdateSettings({ voiceCalls: value })} />
              <SettingSwitch label="Video calls" checked={settings.videoCalls} onChange={(value) => void onUpdateSettings({ videoCalls: value })} />
              <SettingSwitch label="Missed calls" checked={settings.missedCalls} onChange={(value) => void onUpdateSettings({ missedCalls: value })} />

              <h4>Other</h4>
              <SettingSwitch label="Group announcements" checked={settings.groupAnnouncements} onChange={(value) => void onUpdateSettings({ groupAnnouncements: value })} />
              <SettingSwitch label="Status mentions and replies" checked={settings.statusNotifications} onChange={(value) => void onUpdateSettings({ statusNotifications: value })} />
              <SettingSwitch label="Security alerts" checked={settings.securityNotifications} onChange={(value) => void onUpdateSettings({ securityNotifications: value })} />
              <SettingSwitch label="Important system updates" checked={settings.systemNotifications} onChange={(value) => void onUpdateSettings({ systemNotifications: value })} />

              <h4>Privacy and sound</h4>
              <SettingSwitch label="Notification sounds" checked={settings.sounds} onChange={(value) => void onUpdateSettings({ sounds: value })} />
              <SettingSwitch label="Show message previews" description="Message text can appear on your lock screen." checked={settings.messagePreviews} onChange={(value) => void onUpdateSettings({ messagePreviews: value })} />
              <SettingSwitch label="Quiet hours" description="Silences browser alerts during the selected hours." checked={settings.quietHours.enabled} onChange={(value) => void onUpdateSettings({ quietHours: { ...settings.quietHours, enabled: value } })} />
              {settings.quietHours.enabled && (
                <div className="notification-quiet-hours">
                  <label>From <input type="time" value={settings.quietHours.start} onChange={(event) => void onUpdateSettings({ quietHours: { ...settings.quietHours, start: event.target.value } })} /></label>
                  <label>Until <input type="time" value={settings.quietHours.end} onChange={(event) => void onUpdateSettings({ quietHours: { ...settings.quietHours, end: event.target.value } })} /></label>
                  <span>{settings.quietHours.timeZone}</span>
                </div>
              )}
              <div className="notification-push-setting">
                <Volume2 size={16} />
                <span>Background browser alerts</span>
                {browserPushEnabled
                  ? <button type="button" disabled={pushBusy} onClick={() => void onDisablePush()}>Disable</button>
                  : <button type="button" disabled={pushBusy} onClick={() => void onEnablePush()}>{pushBusy ? 'Enabling…' : 'Enable'}</button>}
              </div>
              {pushError && <p className="notification-push-error" role="alert">{pushError}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
