// auth.types.ts
export interface OAuthProfile {
  id: string;
  displayName?: string;
  username?: string;
  provider?: string;
  emails?: Array<{ value: string }>;
  photos?: Array<{ value: string }>;
}

export type DoneCallback = (error: Error | null, user?: Express.User | false) => void;
