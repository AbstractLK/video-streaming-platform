import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, apiBase } from '../App.jsx';

export default function AdminPage() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [videos, setVideos] = useState([]);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    genre: 'General',
    file: null
  });

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (user) loadVideos();
  }, [user]);

  async function loadVideos() {
    try {
      const res = await fetch(`${apiBase}/videos`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok) setVideos(data);
    } catch {}
  }

  async function upload(e) {
    e.preventDefault();
    setMessage('');
    if (!form.file) {
      setMessage('Choose an MP4 file first.');
      return;
    }

    setUploading(true);
    try {
      // Create video metadata
      const metaRes = await fetch(`${apiBase}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: form.title || form.file.name,
          description: form.description,
          genre: form.genre
        })
      });
      const video = await metaRes.json();
      if (!metaRes.ok) throw new Error(video.error || 'Could not create video metadata');

      // Get presigned URL
      const presignedRes = await fetch(`${apiBase}/uploads/presigned-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ videoId: video.id })
      });
      const uploadReq = await presignedRes.json();
      if (!presignedRes.ok) throw new Error(uploadReq.error || 'Could not create upload URL');

      // Upload to S3
      const uploadRes = await fetch(uploadReq.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: form.file
      });
      if (!uploadRes.ok) throw new Error('S3 upload failed');

      // Complete upload
      const completeRes = await fetch(`${apiBase}/uploads/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          videoId: video.id,
          rawS3Key: uploadReq.rawS3Key
        })
      });
      const complete = await completeRes.json();
      if (!completeRes.ok) throw new Error(complete.error || 'Could not queue processing');

      setForm({ title: '', description: '', genre: 'General', file: null });
      setMessage('Upload queued. Refresh to check processing status.');
      await loadVideos();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/videos/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      setDeleteTarget(null);
      setMessage('Video deleted.');
      await loadVideos();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setDeleting(false);
    }
  }

  if (!user) return null;

  if (!isAdmin) {
    return (
      <div className="access-denied">
        <div className="icon">🔒</div>
        <h2>Access Denied</h2>
        <p>Admin access is required to manage videos.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Admin Dashboard</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Upload and manage videos</p>

      {message && <div className="message info">{message}</div>}

      <div className="grid-2">
        {/* Upload Panel */}
        <div className="card">
          <h2>Upload Video</h2>
          <form onSubmit={upload}>
            <div className="form-group">
              <label htmlFor="upload-title">Title</label>
              <input
                id="upload-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="My demo video"
              />
            </div>
            <div className="form-group">
              <label htmlFor="upload-genre">Genre</label>
              <input
                id="upload-genre"
                value={form.genre}
                onChange={(e) => setForm({ ...form, genre: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="upload-desc">Description</label>
              <textarea
                id="upload-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows="3"
              />
            </div>
            <div className="form-group">
              <label htmlFor="upload-file">MP4 File</label>
              <input
                id="upload-file"
                type="file"
                accept="video/mp4"
                onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })}
              />
            </div>
            <button type="submit" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Video'}
            </button>
          </form>
        </div>

        {/* Video Management */}
        <div className="card">
          <div className="card-header">
            <h2>Video Management</h2>
            <button className="btn-secondary btn-small" onClick={loadVideos}>Refresh</button>
          </div>
          {videos.length === 0 ? (
            <div className="empty-state">
              <p>No videos uploaded yet</p>
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Genre</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td>{video.title}</td>
                    <td>{video.genre}</td>
                    <td><span className={`status-badge ${video.status}`}>{video.status}</span></td>
                    <td>
                      <button
                        className="btn-danger btn-small"
                        onClick={() => setDeleteTarget(video)}
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="overlay" onClick={() => setDeleteTarget(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Video</h3>
            <p>Are you sure you want to delete "{deleteTarget.title}"? This will also remove all S3 objects (raw, HLS, thumbnails).</p>
            <div className="dialog-actions">
              <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
