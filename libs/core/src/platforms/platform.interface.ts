export type PlatformCheck = { ok: boolean; error?: string };

export type CredentialField = { key: string; label: string; secret: boolean };

export interface Platform {
  identifier: string;
  fields: CredentialField[];
  check(credentials: Record<string, string>): Promise<PlatformCheck>;
  remove(
    credentials: Record<string, string>,
    releaseURL: string
  ): Promise<PlatformCheck>;
}
