import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiBase } from '../App.jsx';

export default function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [videos, setVideos] = useState([]);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    loadProfile();
    loadVideos();
    loadFavorites();
    loadHistory();
  }, [user]);

  async function loadProfile() {
    try {
      const res = await fetch(`${apiBase}/users/profile`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) {
        setProfile(data);
        setDisplayName(data.displayName || '');
      }
    } catch {}
  }

  async function loadVideos() {
    try {
      const res = await fetch(`${apiBase}/videos`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setVideos(data);
    } catch {}
  }

  async function loadFavorites() {
    try {
      const res = await fetch(`${apiBase}/users/favorites`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setFavorites(data);
    } catch {}
  }

  async function loadHistory() {
    try {
      const res = await fetch(`${apiBase}/users/watch-history`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setHistory(data);
    } catch {}
  }

  async function saveProfile() {
    setMessage('');
    try {
      const res = await fetch(`${apiBase}/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName })
      });
      if (res.ok) setMessage('Profile updated.');
    } catch {
      setMessage('Failed to update profile.');
    }
  }

  async function removeFavorite(videoId) {
    await fetch(`${apiBase}/users/favorites/${videoId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    setFavorites((prev) => prev.filter((f) => f.videoId !== videoId));
  }

  function getVideoTitle(videoId) {
    const v = videos.find((vid) => vid.id === videoId);
    return v ? v.title : videoId;
  }

  function getVideoGenre(videoId) {
    const v = videos.find((vid) => vid.id === videoId);
    return v?.genre || '';
  }

  if (!user) return null;

  const initials = (user.email || '?').charAt(0).toUpperCase();

  return (
    <div className="page">
      <div className="profile-header">
        <div className="avatar">{initials}</div>
        <div>
          <h1 style={{ marginBottom: '2px' }}>{profile?.displayName || user.email}</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{user.email}</span>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Watch History</button>
        <button className={`tab ${tab === 'favorites' ? 'active' : ''}`} onClick={() => setTab('favorites')}>Favourites</button>
      </div>

      {message && <div className="message success">{message}</div>}

      {tab === 'profile' && (
        <div className="card">
          <div className="profile-field">
            <label>Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
            />
            <button className="btn-small" onClick={saveProfile}>Save</button>
          </div>
          <div className="profile-field">
            <label>Email</label>
            <input value={user.email} disabled />
          </div>
          <div className="profile-field">
            <label>Role</label>
            <input value={user.role || 'user'} disabled />
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div>
          {history.length === 0 ? (
            <div className="empty-state">
              <div className="icon">📖</div>
              <p>No watch history yet</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <div className="history-item" key={item.videoId}>
                  <div>
                    <div className="title">{getVideoTitle(item.videoId)}</div>
                    <div className="meta">
                      {getVideoGenre(item.videoId) && <span>{getVideoGenre(item.videoId)}</span>}
                      <span>Progress: {item.progressSeconds}s</span>
                      {item.updatedAt && <span>{new Date(item.updatedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'favorites' && (
        <div>
          {favorites.length === 0 ? (
            <div className="empty-state">
              <div className="icon">♡</div>
              <p>No favourites yet</p>
            </div>
          ) : (
            <div className="history-list">
              {favorites.map((fav) => (
                <div className="history-item" key={fav.videoId}>
                  <div style={{ flex: 1 }}>
                    <div className="title">{getVideoTitle(fav.videoId)}</div>
                    <div className="meta">{getVideoGenre(fav.videoId)}</div>
                  </div>
                  <button
                    className="btn-danger btn-small"
                    onClick={() => removeFavorite(fav.videoId)}
                  >Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
