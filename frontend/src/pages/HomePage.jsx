import React, { useEffect, useState } from 'react';
import Hls from 'hls.js';
import { useAuth, apiBase } from '../App.jsx';

export default function HomePage() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [search, setSearch] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [favorites, setFavorites] = useState(new Set());
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadVideos();
    if (user) loadFavorites();
  }, [user]);

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
      if (res.ok) setFavorites(new Set(data.map((f) => f.videoId)));
    } catch {}
  }

  async function toggleFavorite(e, videoId) {
    e.stopPropagation();
    if (!user) return setMessage('Login to add favourites.');
    const isFav = favorites.has(videoId);
    try {
      await fetch(`${apiBase}/users/favorites/${videoId}`, {
        method: isFav ? 'DELETE' : 'POST',
        credentials: 'include'
      });
      setFavorites((prev) => {
        const next = new Set(prev);
        isFav ? next.delete(videoId) : next.add(videoId);
        return next;
      });
    } catch {}
  }

  async function play(video) {
    setSelected(video);
    setPlaybackUrl('');
    setMessage('');
    if (!user) {
      setMessage('Login to play videos.');
      return;
    }
    try {
      const res = await fetch(`${apiBase}/stream/${video.id}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Playback unavailable');
      setPlaybackUrl(data.playbackUrl);

      // Record watch history
      fetch(`${apiBase}/users/watch-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoId: video.id, progressSeconds: 0 })
      }).catch(() => {});
    } catch (err) {
      setMessage(err.message);
    }
  }

  useEffect(() => {
    const videoEl = document.querySelector('#player');
    if (!videoEl || !playbackUrl) return;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(playbackUrl);
      hls.attachMedia(videoEl);
      return () => hls.destroy();
    }
    videoEl.src = playbackUrl;
  }, [playbackUrl]);

  // Derive genres
  const genres = [...new Set(videos.map((v) => v.genre).filter(Boolean))];

  // Filter videos
  const filtered = videos.filter((v) => {
    if (genreFilter && v.genre?.toLowerCase() !== genreFilter.toLowerCase()) return false;
    if (search && !v.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="page">
      <h1>Video Catalog</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Browse and stream videos</p>

      {message && <div className="message info">{message}</div>}

      <div className="toolbar">
        <input
          className="search-input"
          type="text"
          placeholder="Search videos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="genre-chips">
          <button
            className={`genre-chip ${genreFilter === '' ? 'active' : ''}`}
            onClick={() => setGenreFilter('')}
          >All</button>
          {genres.map((g) => (
            <button
              key={g}
              className={`genre-chip ${genreFilter === g ? 'active' : ''}`}
              onClick={() => setGenreFilter(g)}
            >{g}</button>
          ))}
        </div>
        <button className="btn-secondary btn-small" onClick={loadVideos}>Refresh</button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📺</div>
          <p>No videos found</p>
        </div>
      ) : (
        <div className="video-grid">
          {filtered.map((video) => (
            <div className="video-card" key={video.id} onClick={() => play(video)}>
              {video.thumbnailUrl ? (
                <img className="thumbnail" src={video.thumbnailUrl} alt={video.title} />
              ) : (
                <div className="thumbnail-placeholder">▶</div>
              )}
              <div className="video-card-body">
                <span className="title">{video.title}</span>
                <div className="meta">
                  <span>{video.genre}</span>
                  <span className={`status-badge ${video.status}`}>{video.status}</span>
                </div>
              </div>
              {user && (
                <div className="video-card-actions">
                  <button
                    className={`btn-icon ${favorites.has(video.id) ? 'active' : ''}`}
                    onClick={(e) => toggleFavorite(e, video.id)}
                    title={favorites.has(video.id) ? 'Remove from favourites' : 'Add to favourites'}
                  >
                    {favorites.has(video.id) ? '♥' : '♡'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="player-section card" style={{ marginTop: '24px' }}>
          <h2>{selected.title}</h2>
          <video id="player" controls />
          <div className="player-info">
            <div>
              <div className="meta">
                <span>{selected.genre}</span>
                <span className={`status-badge ${selected.status}`}>{selected.status}</span>
              </div>
              {selected.description && (
                <p className="description">{selected.description}</p>
              )}
            </div>
            {user && (
              <button
                className={`btn-icon ${favorites.has(selected.id) ? 'active' : ''}`}
                onClick={(e) => toggleFavorite(e, selected.id)}
                style={{ fontSize: '24px' }}
              >
                {favorites.has(selected.id) ? '♥' : '♡'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
