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
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    genre: 'General',
    file: null
  });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  async function login() {
    setMessage('');
    try {
      const response = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: 'demo@example.com', password: 'password' })
      });
      const data = await response.json();
      if (!response.ok || !data.token) throw new Error(data.error || 'Demo login failed');
      setToken(data.token);
      setMessage('Demo login successful.');
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadVideos() {
    setMessage('');
    try {
      const response = await fetch(`${apiBase}/videos`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load catalog');
      setVideos(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function play(video) {
    setSelected(video);
    setPlaybackUrl('');
    setMessage('');
    try {
      if (!token) throw new Error('Use Demo Login before playback.');
      const response = await fetch(`${apiBase}/stream/${video.id}`, { headers });
      const data = await response.json();
      if (!response.ok || !data.playbackUrl) throw new Error(data.error || 'Playback URL is unavailable');
      setPlaybackUrl(data.playbackUrl);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function upload(event) {
    event.preventDefault();
    setMessage('');
    if (!form.file) {
      setMessage('Choose an MP4 file first.');
      return;
    }

    setUploading(true);
    try {
      const metadataResponse = await fetch(`${apiBase}/videos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: form.title || form.file.name,
          description: form.description,
          genre: form.genre
        })
      });
      const video = await metadataResponse.json();
      if (!metadataResponse.ok) throw new Error(video.error || 'Could not create video metadata');

      const presignedResponse = await fetch(`${apiBase}/uploads/presigned-url`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ videoId: video.id })
      });
      const uploadRequest = await presignedResponse.json();
      if (!presignedResponse.ok) throw new Error(uploadRequest.error || 'Could not create upload URL');

      const uploadResponse = await fetch(uploadRequest.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: form.file
      });
      if (!uploadResponse.ok) throw new Error('S3 upload failed');

      const completeResponse = await fetch(`${apiBase}/uploads/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          videoId: video.id,
          rawS3Key: uploadRequest.rawS3Key
        })
      });
      const complete = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(complete.error || 'Could not queue processing');

      setForm({ title: '', description: '', genre: 'General', file: null });
      setMessage('Upload queued. Refresh the catalog in a minute to check processing status.');
      await loadVideos();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setUploading(false);
    }
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

      {message && <p className="message">{message}</p>}

      <section className="grid">
        <div className="panel">
          <div className="panel-heading">
            <h2>Catalog</h2>
            <button type="button" onClick={loadVideos}>Refresh</button>
          </div>
          <div className="videos">
            {videos.map((video) => (
              <button className="video-card" key={video.id} onClick={() => play(video)}>
                {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <div className="thumbnail-placeholder" />}
                <span>{video.title}</span>
                <small>{video.genre} · {video.status}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="panel upload">
          <h2>Upload</h2>
          <form onSubmit={upload}>
            <label>
              Title
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="My demo video"
              />
            </label>
            <label>
              Genre
              <input
                value={form.genre}
                onChange={(event) => setForm({ ...form, genre: event.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                rows="3"
              />
            </label>
            <label>
              MP4 file
              <input
                type="file"
                accept="video/mp4"
                onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })}
              />
            </label>
            <button type="submit" disabled={uploading}>{uploading ? 'Uploading...' : 'Upload Video'}</button>
          </form>
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
