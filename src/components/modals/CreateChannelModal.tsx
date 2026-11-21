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

const CHANNEL_ICONS = ['💬', '⚡', '🚀', '🛠️', '🎨', '🔥', '💡', '🎮', '☕', '📢', '🧪', '🔒'];

export const CreateChannelModal: React.FC<CreateChannelModalProps> = ({
  isOpen,
  onClose,
  onCreateChannel,
  onShowToast
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [icon, setIcon] = useState('💬');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    // Auto-generate clean lowercase slug
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
        topic: topic.trim() || `Discussion about ${name.trim()}`
      });
      onShowToast(`Created #${slug}`);
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
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}
            >
              <Plus size={18} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Create New Channel
            </h3>
          </div>
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

        {error && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '13px',
              marginBottom: '14px'
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Icon Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Channel Icon
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '8px',
                background: 'var(--bg-input)',
                padding: '8px',
                borderRadius: '10px'
              }}
            >
              {CHANNEL_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  style={{
                    background: icon === emoji ? 'var(--accent-primary)' : 'transparent',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '20px',
                    padding: '6px 0',
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
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Channel Name
            </label>
            <input
              type="text"
              required
              maxLength={30}
              placeholder="e.g. Frontend Architecture"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '10px 12px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '14px'
              }}
            />
          </div>

          {/* Slug Preview */}
          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Channel URL Handle
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '10px 12px',
                color: 'var(--text-secondary)',
                fontSize: '13.5px'
              }}
            >
              <Hash size={16} />
              <input
                type="text"
                required
                maxLength={30}
                placeholder="frontend-architecture"
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
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Topic / Purpose (optional)
            </label>
            <input
              type="text"
              maxLength={120}
              placeholder="What should members talk about here?"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '10px 12px',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '14px'
              }}
            />
          </div>

          <Button type="submit" loading={loading} style={{ marginTop: '8px' }}>
            Create Channel
          </Button>
        </form>
      </div>
    </div>
  );
};
