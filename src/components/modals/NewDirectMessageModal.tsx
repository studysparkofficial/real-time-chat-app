import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, MessageCircle, Search, X } from 'lucide-react';
import { ChatUser } from '../../types/chat.types';
import { Avatar } from '../common/Avatar';
import { collection, db, endAt, getDocs, limit, orderBy, query, startAt } from '../../services/firebase';
import { toChatUser } from '../../services/directMessages';

interface NewDirectMessageModalProps {
  isOpen: boolean;
  currentUser: ChatUser | null;
  onlineUsers: ChatUser[];
  onClose: () => void;
  onSelectUser: (user: ChatUser) => Promise<void>;
}

export const NewDirectMessageModal: React.FC<NewDirectMessageModalProps> = ({
  isOpen,
  currentUser,
  onlineUsers,
  onClose,
  onSelectUser
}) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onlineById = useMemo(
    () => new Map(onlineUsers.map((user) => [user.uid, user])),
    [onlineUsers]
  );

  useEffect(() => {
    if (!isOpen || !currentUser) return;
    let isCurrent = true;
    const normalized = search.trim().toLocaleLowerCase();

    if (normalized.length < 2) {
      setLoading(false);
      setError(null);
      setResults(
        onlineUsers
          .filter((user) => user.uid !== currentUser.uid)
          .sort((a, b) => a.displayName.localeCompare(b.displayName))
      );
      return () => {
        isCurrent = false;
      };
    }

    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      const peopleQuery = query(
        collection(db, 'user_profiles'),
        orderBy('displayNameLower'),
        startAt(normalized),
        endAt(`${normalized}\uf8ff`),
        limit(25)
      );

      void getDocs(peopleQuery)
        .then((snapshot) => {
          if (!isCurrent) return;
          const next = snapshot.docs
            .map((profileDoc) => {
              const profile = toChatUser({ ...profileDoc.data(), uid: profileDoc.id });
              const onlineProfile = onlineById.get(profile.uid);
              return onlineProfile ? { ...profile, ...onlineProfile } : { ...profile, status: 'offline' as const };
            })
            .filter((user) => user.uid !== currentUser.uid)
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
          setResults(next);
          setLoading(false);
        })
        .catch((queryError: unknown) => {
          if (!isCurrent) return;
          console.warn('[Direct messages] People search failed:', queryError);
          setError('Could not search people right now. Please try again.');
          setResults([]);
          setLoading(false);
        });
    }, 220);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, currentUser?.uid, search, onlineUsers, onlineById]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setError(null);
      setBusyUid(null);
    }
  }, [isOpen]);

  if (!isOpen || !currentUser) return null;

  const handleSelect = async (user: ChatUser) => {
    setBusyUid(user.uid);
    setError(null);
    try {
      await onSelectUser(user);
      onClose();
    } catch (selectError: unknown) {
      setError(selectError instanceof Error ? selectError.message : 'Could not open this chat.');
      setBusyUid(null);
    }
  };

  return (
    <div className="modal-overlay as-sheet" onClick={onClose}>
      <section
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-direct-message-title"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: '460px', minHeight: '420px' }}
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                background: 'var(--accent-gradient)'
              }}
            >
              <MessageCircle size={19} />
            </div>
            <div>
              <h2 id="new-direct-message-title" style={{ margin: 0, fontSize: '18px', color: 'var(--text-primary)' }}>
                New chat
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Choose a JNUverse member</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close new chat" className="header-action-btn">
            <X size={20} />
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 13px', height: '46px', borderRadius: '13px', background: 'var(--bg-input)', border: '1px solid var(--border-color)' }}>
          <Search size={18} color="var(--text-muted)" />
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people by name"
            aria-label="Search people by name"
            style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--text-primary)', font: 'inherit' }}
          />
        </label>

        <div style={{ margin: '16px 2px 8px', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.7px' }}>
          {search.trim().length < 2 ? 'ONLINE NOW' : 'PEOPLE'}
        </div>

        {error && (
          <div role="status" style={{ padding: '10px 12px', marginBottom: '8px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 'min(48vh, 390px)', overflowY: 'auto' }}>
          {results.map((user) => (
            <button
              key={user.uid}
              type="button"
              onClick={() => void handleSelect(user)}
              disabled={Boolean(busyUid)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '10px 8px',
                border: '0',
                borderRadius: '12px',
                background: 'transparent',
                color: 'var(--text-primary)',
                textAlign: 'left',
                cursor: busyUid ? 'wait' : 'pointer'
              }}
              onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--bg-card-hover)'; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
            >
              <Avatar src={user.photoURL} name={user.displayName} status={user.status} size="sm" />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '14px', fontWeight: 700 }}>
                  {user.displayName}{user.isAnonymous ? ' · Guest' : ''}
                </span>
                <span style={{ display: 'block', marginTop: '2px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {user.status === 'online' ? 'Online' : user.centre || user.bio || 'JNUverse member'}
                </span>
              </span>
              {busyUid === user.uid && <Loader2 className="animate-spin" size={17} color="var(--accent-primary)" />}
            </button>
          ))}

          {loading && (
            <div style={{ padding: '24px 12px', display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Loader2 className="animate-spin" size={20} />
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {search.trim().length < 2 ? 'No one is online right now. Search for a member by name.' : 'No members found. Try another name.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
