import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Hls from 'hls.js';
import './styles.css';

const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

function App() {
  const [token, setToken] = useState('');
  const [videos, setVideos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [playbackUrl, setPlaybackUrl] = useState('');

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  async function login() {
    const response = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'demo@example.com', password: 'password' })
    });
    const data = await response.json();
    setToken(data.token);
  }

  async function loadVideos() {
    const response = await fetch(`${apiBase}/videos`);
    setVideos(await response.json());
  }

  async function play(video) {
    setSelected(video);
    const response = await fetch(`${apiBase}/stream/${video.id}`, { headers });
    const data = await response.json();
    setPlaybackUrl(data.playbackUrl || '');
  }

  useEffect(() => {
    loadVideos();
  }, []);

  useEffect(() => {
    const video = document.querySelector('#player');
    if (!video || !playbackUrl) return;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(playbackUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
    video.src = playbackUrl;
  }, [playbackUrl]);

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">DevOps streaming platform</p>
          <h1>Video Streaming Demo</h1>
        </div>
        <button onClick={login}>{token ? 'Authenticated' : 'Demo Login'}</button>
      </header>

      <section className="grid">
        <div className="panel">
          <h2>Catalog</h2>
          <div className="videos">
            {videos.map((video) => (
              <button className="video-card" key={video.id} onClick={() => play(video)}>
                <img src={video.thumbnailUrl} alt="" />
                <span>{video.title}</span>
                <small>{video.genre} · {video.status}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel player">
          <h2>{selected ? selected.title : 'Player'}</h2>
          <video id="player" controls />
          <p>{selected ? selected.description : 'Select a ready video to request a secure HLS manifest URL.'}</p>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);

