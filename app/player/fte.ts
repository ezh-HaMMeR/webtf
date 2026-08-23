import type { FtePlayer } from './types';

export function createFtePlayer(): FtePlayer {
  const command = (name: string, value?: string | number) => {
    if (!window.FTEC?.cbufadd) return;
    const line = value === undefined ? name : `${name} ${value}`;
    window.FTEC.cbufadd(`${line}\n`);
  };

  const getDemoTime = () => {
    try { return Math.max(0, window.Module?.getDemoTime?.() ?? 0); }
    catch { return 0; }
  };

  const getPlayers = () => {
    try {
      const state = window.Module?.getClientState?.();
      if (!state) return [];
      const players: Array<{ userid: number; name: string }> = [];
      for (let index = 0; index < state.allocated_client_slots; index += 1) {
        const player = state.getPlayer(index);
        const name = player.getNamePlain();
        if (!player.spectator && name && name !== '[ServeMe]') players.push({ userid: player.userid, name });
      }
      return players;
    } catch { return []; }
  };

  const getTrackedUserId = () => {
    try { return window.Module?.getClientState?.().getPlayerView(0).getTrackedPlayer()?.userid ?? null; }
    catch { return null; }
  };

  return { command, getDemoTime, getPlayers, getTrackedUserId };
}

export function trackByDelta(player: FtePlayer, delta: -1 | 1) {
  const players = player.getPlayers();
  if (!players.length) {
    player.command(delta === 1 ? 'track' : 'track -1');
    return;
  }
  const current = player.getTrackedUserId();
  const currentIndex = Math.max(0, players.findIndex((candidate) => candidate.userid === current));
  const nextIndex = (currentIndex + delta + players.length) % players.length;
  player.command('track', players[nextIndex].userid);
}
