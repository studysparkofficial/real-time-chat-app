import React, { useState } from 'react';
import { X, Hash, Plus } from 'lucide-react';
import { Button } from '../common/Button';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateChannel: (channel: {
    name: string;
    slug: string;
    icon: string;
    topic: string;
  }) => Promise<void>;
  onShowToast: (text: string) => void;
}

const JNU_CHANNEL_ICONS = ['🏛️', '☕', '📚', '🎓', '🛏️', '🎭', '🔍', '💡', '🔥', '🚀', '⚽', '🌿'];

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  onCreateChannel,
  onShowToast
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('🏛️');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    const generated = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
    setSlug(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a channel name.');
      return;
    }

    if (!slug.trim()) {
      setError('A valid slug is required.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      await onCreateChannel({
        name: name.trim(),
        slug: slug.trim(),
        icon,
        topic: topic.trim() || `Discussions for ${name.trim()} on JNU Campus`
      });
      onShowToast(`Created #${slug} in JNUverse`);
      setName('');
      setSlug('');
      setTopic('');
      onClose();
    } catch (err: unknown) {
      const e = err as Error;
      setError(e.message || 'Failed to create channel.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay as-sheet" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px' }}
      >
        <div
          style={{
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'var(--border-color)',
            margin: '0 auto 16px auto'
          }}
        />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}
            >
              <Plus size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Create JNU Channel
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--accent-gold)', fontWeight: 600 }}>
                Campus Hub Group
              </div>
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

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '13.5px',
              marginBottom: '16px'
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Icon Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Channel Icon
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '8px',
                background: 'var(--bg-input)',
                padding: '10px',
                borderRadius: '12px'
              }}
            >
              {JNU_CHANNEL_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  style={{
                    background: icon === emoji ? 'var(--accent-primary)' : 'transparent',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '22px',
                    padding: '8px 0',
                    cursor: 'pointer'
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Channel Name */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Channel Name
            </label>
            <input
              type="text"
              required
              maxLength={40}
              placeholder="e.g. Kaveri Hostel / SES Ecology"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '12px 14px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '15px'
              }}
            />
          </div>

          {/* Slug Preview */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Channel Handle
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '12px 14px',
                color: 'var(--text-secondary)',
                fontSize: '14.5px'
              }}
            >
              <Hash size={18} />
              <input
                type="text"
                required
                maxLength={40}
                placeholder="kaveri-hostel"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]+/g, '')
                  )
                }
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)'
                }}
              />
            </div>
          </div>

          {/* Topic */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Topic / Purpose
            </label>
            <input
              type="text"
              maxLength={120}
              placeholder="What can scholars discuss in this channel?"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '12px 14px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '15px'
              }}
            />
          </div>

          <Button type="submit" loading={loading} style={{ marginTop: '10px', minHeight: '48px', fontSize: '15px' }}>
            Create Channel
          </Button>
        </form>
      </div>
    </div>
  );
};
