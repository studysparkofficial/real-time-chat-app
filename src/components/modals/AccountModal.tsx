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

const CURATED_EMOJI_AVATARS = [
  '🚀', '⚡', '💻', '🦊', '🐱', '🐼',
  '🦁', '🤖', '👾', '🔥', '✨', '🌟',
  '🎯', '🎨', '🎧', '🎸', '☕', '🍕',
  '🌈', '🌙', '💎', '🛡️', '👑', '🔮'
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
      onShowToast('User ID copied to clipboard');
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
      onShowToast('Profile updated successfully');
      onClose();
    } catch {
      onShowToast('Failed to save profile updates');
    } finally {
      setSaving(false);
    }
  };

  const authBadge = currentUser.isAnonymous
    ? 'Guest Account'
    : currentUser.email?.includes('gmail')
    ? 'Google Verified'
    : 'Email Verified';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}
        >
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Account & Profile Settings
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Showcase Section: 72px avatar with live status ring */}
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
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {displayName || 'Pulse User'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                {currentUser.email || 'Anonymous Guest Session'}
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  fontWeight: 600
                }}
              >
                <Shield size={12} /> {authBadge}
              </span>
            </div>
          </div>

          {/* Presence Status Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Presence Status
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {(
                [
                  { id: 'online', label: 'Online', icon: '🟢' },
                  { id: 'away', label: 'Away', icon: '🟡' },
                  { id: 'busy', label: 'Busy (DND)', icon: '🔴' }
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
                    padding: '8px 10px',
                    borderRadius: '10px',
                    border: `1px solid ${status === st.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    background: status === st.id ? 'var(--bg-card-hover)' : 'var(--bg-input)',
                    color: status === st.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: status === st.id ? 600 : 400,
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
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Display Name
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '8px 12px'
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
                  fontSize: '14.5px'
                }}
              />
              <Edit2 size={16} color="var(--text-muted)" />
            </div>
          </div>

          {/* Status Line / Bio */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              About / Bio
            </label>
            <input
              type="text"
              maxLength={100}
              placeholder="e.g. Building next-gen real-time apps"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '8px 12px',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '14.5px'
              }}
            />
          </div>

          {/* Avatar Picker (24 Curated Emojis) */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Choose Avatar
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(8, 1fr)',
                gap: '6px',
                background: 'var(--bg-input)',
                padding: '8px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                marginBottom: '8px'
              }}
            >
              {CURATED_EMOJI_AVATARS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setPhotoURL(emoji)}
                  style={{
                    background: photoURL === emoji ? 'var(--accent-primary)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '20px',
                    padding: '6px 0',
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease'
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Custom Emoji / Image URL Input */}
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
                borderRadius: '10px',
                padding: '8px 12px',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: '13px'
              }}
            />
          </div>

          {/* Account Metadata: User ID with 1-Click Copy */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12.5px'
            }}
          >
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>User ID (UID)</div>
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
                borderRadius: '6px',
                padding: '6px 10px',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px'
              }}
            >
              {copiedUid ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copiedUid ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          {/* App Preferences */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Application Preferences
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Theme Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: 'var(--bg-input)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
                  {preferences.theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                  <span>Dark Mode</span>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.theme === 'dark'}
                  onChange={(e) =>
                    onUpdatePreferences({ theme: e.target.checked ? 'dark' : 'light' })
                  }
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
              </div>

              {/* Sound Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: 'var(--bg-input)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
                  {preferences.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                  <span>Notification Audio Synthesizer</span>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.soundEnabled}
                  onChange={(e) => onUpdatePreferences({ soundEnabled: e.target.checked })}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
              </div>

              {/* Haptics Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: 'var(--bg-input)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
                  <Vibrate size={16} />
                  <span>Haptic Vibration Feedback</span>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.hapticsEnabled}
                  onChange={(e) => onUpdatePreferences({ hapticsEnabled: e.target.checked })}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />
              </div>
            </div>
          </div>

          {/* Action Buttons: Save & Logout */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            <Button
              type="submit"
              loading={saving}
              style={{ flex: 1 }}
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
              style={{ color: '#ef4444' }}
              icon={<LogOut size={16} />}
            >
              Sign Out
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
