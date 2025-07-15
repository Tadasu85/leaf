import React from 'react';

interface PresentPlayersProps {
  players: string[];
  currentUser?: string | null;
}

function PresentPlayers({ players, currentUser }: PresentPlayersProps) {
  if (!players || players.length === 0) return null;
  
  return (
    <div className="app__present-players">
      <span className="app__present-players__label">Present:</span>
      {players.map((p) => (
        <span key={p} className={p === currentUser ? 'app__present-players__me' : ''}>
          {p}
        </span>
      ))}
    </div>
  );
}

export default PresentPlayers; 