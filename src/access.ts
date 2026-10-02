import type { GoldfishAdmin } from './goldfish/admin.js';
import type { Store, UserRecord } from './store/types.js';

export type AccessState = { allowed: true; label: string } | { allowed: false; reason: string };

/**
 * Who may use the agent. During early access every signed-in user may. Subscriptions plug in
 * here: decide from the user's plan and paid period, and push changes to Goldfish
 * (POST /admin/users/:clientId/:userId/subscription) so the server cuts off or restores the
 * extension.
 */
export function accessOf(_user: UserRecord): AccessState {
  return { allowed: true, label: 'Ранний доступ' };
}

/** The user's id on the Goldfish server: stable, unlike e-mail or login. */
export function goldfishUserId(user: Pick<UserRecord, 'yandexId'>): string {
  return `yandex:${user.yandexId}`;
}

export function displayName(user: Pick<UserRecord, 'name' | 'email' | 'login'>): string {
  const name = user.name ?? user.login ?? 'Без имени';
  return user.email ? `${name} <${user.email}>` : name;
}

/**
 * Device tokens for the extension. A user has one active token issued by the site: issuing a
 * new one revokes the previous, so a leaked or forgotten token is fixed by issuing again.
 */
export class AccessService {
  /** Serialises token issuing per user (single replica): concurrent clicks must not leak tokens. */
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly store: Store,
    private readonly goldfish: GoldfishAdmin,
  ) {}

  issueToken(userId: string): Promise<{ token: string; user: UserRecord }> {
    const prev = this.locks.get(userId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(() => this.issue(userId));
    this.locks.set(userId, run);
    void run
      .catch(() => undefined)
      .finally(() => {
        if (this.locks.get(userId) === run) this.locks.delete(userId);
      });
    return run;
  }

  private async issue(userId: string): Promise<{ token: string; user: UserRecord }> {
    const user = await this.store.getUser(userId);
    if (!user) throw new Error(`unknown user ${userId}`);
    const gfUser = goldfishUserId(user);
    await this.goldfish.ensureUser(gfUser, displayName(user));
    // Revoke first: if issuing fails the user simply retries, and no stray token stays active.
    if (user.tokenId) await this.goldfish.revokeToken(user.tokenId);
    const { token, tokenId } = await this.goldfish.issueToken(
      gfUser,
      `сайт ${new Date().toISOString().slice(0, 10)}`,
    );
    return { token, user: await this.store.setToken(user.id, tokenId) };
  }
}
