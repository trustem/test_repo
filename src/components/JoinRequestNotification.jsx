import React from 'react';

export default function JoinRequestNotification({ request, onApprove, onReject }) {
  return (
    <div className="join-req-overlay">
      <div className="join-req-card">
        <div className="join-req-title">Запрос на вход</div>
        <div className="join-req-name">{request.name}</div>
        <div className="join-req-hint">хочет присоединиться к игре</div>
        <div className="join-req-buttons">
          <button className="join-req-btn join-req-approve" onClick={() => onApprove(request)}>
            Впустить
          </button>
          <button className="join-req-btn join-req-reject" onClick={() => onReject(request)}>
            Отклонить
          </button>
        </div>
      </div>
    </div>
  );
}
