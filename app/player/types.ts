export type LocalManifest = {
  title: string;
  map: string;
  gamedir: string;
  durationSeconds?: number;
  files: Record<string, string>;
};

export type FtePlayer = {
  command: (command: string, value?: string | number) => void;
  getDemoTime: () => number;
  getPlayers: () => Array<{ userid: number; name: string }>;
  getTrackedUserId: () => number | null;
};

declare global {
  interface Window {
    Module?: {
      canvas?: HTMLCanvasElement;
      manifest?: string;
      arguments?: string[];
      files?: Record<string, string>;
      setStatus?: (value: string) => void;
      getDemoTime?: () => number;
      getClientState?: () => {
        allocated_client_slots: number;
        getPlayer: (index: number) => {
          userid: number;
          spectator: number;
          getNamePlain: () => string;
        };
        getPlayerView: (seat: number) => {
          getTrackedPlayer: () => { userid: number } | null;
        };
      };
    };
    FTEC?: {
      cbufadd?: (command: string) => void;
      loadurl?: (name: string, command: string, data: ArrayBuffer) => void;
    };
  }
}

export {};
