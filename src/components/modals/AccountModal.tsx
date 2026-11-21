import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  LogOut,
  Volume2,
  VolumeX,
  Vibrate,
  Moon,
  Sun,
  Shield,
  Edit2
} from 'lucide-react';
import { ChatUser, UserPreferences, UserPresenceStatus } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';
import { Button } from '../common/Button';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: ChatUser | null;
  preferences: UserPreferences;
  onUpdateProfile: (updates: {
    displayName?: string;
    photoURL?: string;
    bio?: string;
    status?: UserPresenceStatus;
  }) => Promise<void>;
  onUpdatePreferences: (prefs: Partial<UserPreferences>) => void;
  onLogout: () => Promise<void>;
  onShowToast: (text: string) => void;
}

const JNU_EMOJI_AVATARS = [
  '🎓', '📚', '☕', '🏛️', '🦁', '🦉',
  '💡', '⚡', '🚀', '💻', '🦊', '🐱',
  '🔥', '✨', '🌟', '🎯', '🎨', '🎧',
  '🎸', '🌙', '💎', '🛡️', '👑', '🔮'
];

const JNU_BIO_PRESETS = [
  'JNU Scholar / Student 🎓',
  'At Ganga Dhaba ☕',
  'Reading at Central Library 📚',
  'Charcha at Sabarmati 🗣️',
  'Coding & Researching 💻',
  'Listening to PSR sunset music 🎸'
];

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  preferences,
  onUpdateProfile,
  onUpdatePreferences,
  onLogout,
  onShowToast
}) => {
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [bio, setBio] = useState(currentUser?.bio || '');
  const [photoURL, setPhotoURL] = useState(currentUser?.photoURL || '👤');
  const [status, setStatus] = useState<UserPresenceStatus>(currentUser?.status || 'online');
  const [customAvatarInput, setCustomAvatarInput] = useState('');
  const [copiedUid, setCopiedUid] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleCopyUid = () => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(currentUser.uid);
      setCopiedUid(true);
      onShowToast('JNU Scholar ID copied');
      setTimeout(() => setCopiedUid(false), 2000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setSaving(true);
    try {
      await onUpdateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        photoURL,
        status
      });
      onShowToast('JNUverse Profile updated!');
      onClose();
    } catch {
      onShowToast('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const authBadge = currentUser.isAnonymous
    ? 'Guest Pass'
    : currentUser.email?.includes('jnu.ac.in')
    ? 'Official JNU Email'
    : currentUser.email?.includes('gmail')
    ? 'Google Verified'
    : 'Verified Member';

  return (
    <div className="modal-overlay as-sheet" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
      >
        {/* Mobile Drag Indicator */}
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border-color)',
            margin: '0 auto 16px auto'
          }}
        />

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px'
          }}
        >
          <div>
            <h3 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Scholar Profile & Settings
            </h3>
            <div style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 600 }}>
              JNUverse Identity
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px'
            }}
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Showcase Section: 80px avatar with live status ring */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '16px',
              background: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-color)'
            }}
          >
            <Avatar
              src={photoURL}
              name={displayName}
              size="showcase"
              status={status}
              showStatusRing
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '17px',
                  fontWeight: 800,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {displayName || 'JNU Scholar'}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                {currentUser.email || 'Guest Scholar Session'}
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11.5px',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: 'rgba(37, 99, 235, 0.25)',
                  color: '#60a5fa',
                  fontWeight: 700
                }}
              >
                <Shield size={13} /> {authBadge}
              </span>
            </div>
          </div>

          {/* Presence Status Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Campus Presence Status
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(
                [
                  { id: 'online', label: 'Online', icon: '🟢' },
                  { id: 'away', label: 'In Class / Away', icon: '🟡' },
                  { id: 'busy', label: 'In Library (DND)', icon: '🔴' }
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatus(st.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px 8px',
                    borderRadius: '12px',
                    border: `1px solid ${status === st.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: status === st.id ? 'var(--bg-card-hover)' : 'var(--bg-input)',
                    color: status === st.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: status === st.id ? 700 : 500,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  <span>{st.icon}</span>
                  <span>{st.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Editable Display Name */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Scholar Name / Pseudonym
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '10px 14px'
              }}
            >
              <input
                type="text"
                required
                maxLength={40}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '15px'
                }}
              />
              <Edit2 size={18} color="var(--text-muted)" />
            </div>
          </div>

          {/* Status Line / Bio & Quick Presets */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Campus Status / Bio
            </label>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g. Researching at SIS / At Ganga Dhaba"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '10px 14px',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '15px',
                marginBottom: '8px'
              }}
            />

            {/* Quick Bio Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {JNU_BIO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setBio(preset)}
                  style={{
                    background: 'var(--bg-card-hover)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '4px 8px',
                    fontSize: '11.5px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Avatar Picker (24 Curated Emojis) */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Select Scholar Avatar
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '8px',
                background: 'var(--bg-input)',
                padding: '10px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                marginBottom: '8px'
              }}
            >
              {JNU_EMOJI_AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setPhotoURL(emoji)}
                  style={{
                    background: photoURL === emoji ? 'var(--accent-primary)' : 'transparent',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '22px',
                    padding: '6px 0',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease'
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Or paste custom emoji or image URL"
              value={customAvatarInput}
              onChange={(e) => {
                setCustomAvatarInput(e.target.value);
                if (e.target.value.trim()) setPhotoURL(e.target.value.trim());
              }}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '10px 14px',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '13.5px'
              }}
            />
          </div>

          {/* Scholar ID (UID) */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '13px'
            }}
          >
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600 }}>JNU SCHOLAR UID</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                {currentUser.uid}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyUid}
              style={{
                background: 'var(--bg-card-hover)',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600
              }}
            >
              {copiedUid ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
              <span>{copiedUid ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* App Preferences */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              App Preferences
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Theme Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'var(--bg-input)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                  {preferences.theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                  <span>Dark Mode Theme</span>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.theme === 'dark'}
                  onChange={(e) =>
                    onUpdatePreferences({ theme: e.target.checked ? 'dark' : 'light' })
                  }
                  style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                />
              </div>

              {/* Sound Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'var(--bg-input)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                  {preferences.soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                  <span>Campus Notification Chimes</span>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(e) => onUpdatePreferences({ soundEnabled: e.target.checked })}
                  style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                />
              </div>

              {/* Haptics Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'var(--bg-input)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                  <Vibrate size={18} />
                  <span>Haptic Micro-Vibrations</span>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.hapticsEnabled}
                  onChange={(e) => onUpdatePreferences({ hapticsEnabled: e.target.checked })}
                  style={{ cursor: 'pointer', width: '20px', height: '20px' }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons: Save & Logout */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <Button
              type="submit"
              loading={saving}
              style={{ flex: 1, minHeight: '48px' }}
            >
              Save Profile
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await onLogout();
                onClose();
              }}
              style={{ color: '#ef4444', minHeight: '48px' }}
              icon={<LogOut size={18} />}
            >
              Sign Out
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
