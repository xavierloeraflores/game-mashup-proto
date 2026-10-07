export interface GameMetadata {
  id: string;
  name: string;
  providerIds: string[];
  steamAppIds?: number[];
  steamParentAppId?: number;
  steamParentDlcIds?: number[];
  assetOnly?: boolean;
}

export interface GameInstallation {
  gameId: string;
  providerId: string;
  path: string;
  rootPath?: string;
  version?: string;
  profileId?: string;
  details?: string;
}

export interface GameProvider {
  id: string;
  discover(game: GameMetadata): Promise<GameInstallation[]>;
}

export interface Requirement {
  id: string;
  version?: string;
  minecraftVersion?: string;
  sha1?: string;
}

export interface MashupMetadata {
  id: string;
  name: string;
  description: string;
  status: 'available' | 'experimental' | 'unavailable';
  installer?: string;
  source?: string;
  requires: {
    games: Requirement[];
    assets?: Requirement[];
    tools?: Requirement[];
    mods?: Requirement[];
  };
}

export interface Registry {
  games: GameMetadata[];
  mashups: MashupMetadata[];
}

export interface RequirementResult {
  id: string;
  kind: 'game' | 'asset' | 'tool' | 'mod';
  installed: boolean;
  satisfied: boolean;
  detail: string;
}
