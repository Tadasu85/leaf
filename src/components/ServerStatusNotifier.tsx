import React, { useEffect, useState } from 'react';

interface Props {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'failed';
  isSignedIn: boolean;
}

export function ServerStatusNotifier({ connectionStatus, isSignedIn }: Props) {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setVisible(false);
      setFading(false);
      return;
    }

    let showTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;

    if (connectionStatus === 'connecting') {
      showTimer = setTimeout(() => {
        setFading(false);
        setVisible(true);
      }, 5000);
    } else if (connectionStatus === 'failed') {
      setFading(false);
      setVisible(true);
    } else if (connectionStatus === 'connected') {
      setFading(true);
      hideTimer = setTimeout(() => {
        setVisible(false);
        setFading(false);
      }, 1500);
    }

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [connectionStatus, isSignedIn]);

  if (!visible) return null;

  const isFailed = connectionStatus === 'failed';

  return (
    <div className={`server-status-notifier${fading ? ' server-status-notifier--fading' : ''}`}>
      <div className="chat-status__indicator">
        <span className={`chat-status__dot ${isFailed ? 'chat-status__dot--failed' : 'chat-status__dot--connecting'}`} />
        <span className="chat-status__text">
          {isFailed ? 'Player presence unavailable' : 'Signaling server starting…'}
        </span>
      </div>
    </div>
  );
}
