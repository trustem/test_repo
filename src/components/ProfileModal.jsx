import React, { useState, useRef } from 'react';
import { saveUserName, uploadAvatar, deleteAvatar, linkGoogleAccount, isLinkedToGoogle, getGoogleEmail } from '../auth/index.js';
import UserStatsView from './UserStatsView.jsx';

export default function ProfileModal({ firebaseUid, initialName, initialPhoto, profile, onSave, onClose }) {
  const [tab, setTab]           = useState('profile'); // 'profile' | 'stats'
  const [name, setName]         = useState(initialName || '');
  const [photoURL, setPhotoURL] = useState(initialPhoto || null);
  const [uploading, setUploading]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]           = useState('');
  const [googleLinked, setGoogleLinked] = useState(() => isLinkedToGoogle());
  const [googleEmail, setGoogleEmail]   = useState(() => getGoogleEmail());
  const fileInputRef            = useRef(null);

  // ── Avatar handlers ────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Только изображения'); return; }
    if (file.size > 5 * 1024 * 1024)    { setError('Файл больше 5 МБ');   return; }
    setError('');
    setUploading(true);
    try {
      const url = await uploadAvatar(firebaseUid, file);
      setPhotoURL(url);
    } catch (e) {
      setError('Ошибка загрузки: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUploading(true);
    try { await deleteAvatar(firebaseUid); } catch {}
    setPhotoURL(null);
    setUploading(false);
  };

  // ── Google link ────────────────────────────────────────────
  const handleGoogleLink = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      const result = await linkGoogleAccount();
      if (result) {
        setGoogleLinked(true);
        setGoogleEmail(getGoogleEmail());
        // Sync name/photo if they were empty
        if (!name && result.name) setName(result.name);
        if (!photoURL && result.photoURL) setPhotoURL(result.photoURL);
        onSave({ name: name || result.name, photoURL: photoURL || result.photoURL });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Save profile ───────────────────────────────────────────
  const handleSave = async () => {
    const trimmed = name.trim() || 'Игрок';
    setSaving(true);
    try {
      await saveUserName(firebaseUid, trimmed, photoURL);
      onSave({ name: trimmed, photoURL });
    } catch {
      setError('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={e => e.stopPropagation()}>
        <button className="profile-close-btn" onClick={onClose}>✕</button>

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            className={`profile-tab${tab === 'profile' ? ' active' : ''}`}
            onClick={() => setTab('profile')}
          >Профиль</button>
          <button
            className={`profile-tab${tab === 'stats' ? ' active' : ''}`}
            onClick={() => setTab('stats')}
          >Статистика</button>
        </div>

        {/* ── Profile tab ── */}
        {tab === 'profile' && (
          <>
            {/* Avatar */}
            <div className="profile-avatar-wrap">
              <div
                className="profile-avatar"
                onClick={() => !uploading && fileInputRef.current?.click()}
                title="Нажми чтобы сменить фото"
              >
                {uploading
                  ? <div className="profile-avatar-spinner">⟳</div>
                  : photoURL
                    ? <img src={photoURL} alt="avatar" className="profile-avatar-img" />
                    : <div className="profile-avatar-placeholder"><span>👤</span></div>
                }
                {!uploading && (
                  <div className="profile-avatar-overlay"><span>📷</span></div>
                )}
              </div>
              {photoURL && !uploading && (
                <button className="profile-remove-photo" onClick={handleRemovePhoto}>
                  Удалить фото
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>

            {/* Name */}
            <div className="profile-field">
              <label className="profile-label">Имя игрока</label>
              <input
                className="profile-input"
                type="text"
                maxLength={12}
                placeholder="Игрок"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>

            {error && <div className="profile-error">{error}</div>}

            <button
              className="profile-save-btn"
              onClick={handleSave}
              disabled={saving || uploading}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>

            {/* Google account linking */}
            <div className="profile-divider" />
            {googleLinked ? (
              <div className="profile-google-linked">
                <span className="profile-google-icon">G</span>
                <div className="profile-google-info">
                  <span className="profile-google-status">Google аккаунт привязан</span>
                  {googleEmail && <span className="profile-google-email">{googleEmail}</span>}
                </div>
                <span className="profile-google-check">✓</span>
              </div>
            ) : (
              <button
                className="profile-google-btn"
                onClick={handleGoogleLink}
                disabled={googleLoading}
              >
                <span className="profile-google-icon">G</span>
                {googleLoading ? 'Подключение...' : 'Войти через Google'}
              </button>
            )}
          </>
        )}

        {/* ── Stats tab ── */}
        {tab === 'stats' && (
          <div className="profile-stats-scroll">
            {firebaseUid
              ? <UserStatsView uid={firebaseUid} profile={profile || {}} />
              : <div className="stats-chart-placeholder">Войдите чтобы видеть статистику</div>
            }
          </div>
        )}
      </div>
    </div>
  );
}
