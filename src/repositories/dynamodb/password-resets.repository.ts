import { deleteItem, getItem, putItem, queryAll } from "./table"

/**
 * Password-reset tokens, in their own registry partition. Only a SHA-256 hash
 * of each token is stored, so a leaked table can't be used to reset passwords.
 *
 *   PK = PASSWORD_RESETS   SK = TOKEN#<sha256(token)>   { userId, expiresAt }
 *   PK = PASSWORD_RESETS   SK = USER#<userId>           { sentAt } — resend cooldown
 *
 * Items carry `ttl`, so DynamoDB removes them once they expire.
 */
const PK = "PASSWORD_RESETS"
const tokenKey = (tokenHash: string) => ({ PK, SK: `TOKEN#${tokenHash}` })
const userKey = (userId: string) => ({ PK, SK: `USER#${userId}` })

export interface PasswordReset {
  userId: string
  /** Epoch milliseconds. */
  expiresAt: number
}

const ttlFor = (expiresAtMs: number) => Math.ceil(expiresAtMs / 1000)

export const passwordResetsRepository = {
  async create(tokenHash: string, reset: PasswordReset): Promise<void> {
    await putItem({
      ...tokenKey(tokenHash),
      entityType: "PASSWORD_RESET",
      userId: reset.userId,
      expiresAt: reset.expiresAt,
      ttl: ttlFor(reset.expiresAt),
    })
  },

  async get(tokenHash: string): Promise<PasswordReset | undefined> {
    const item = await getItem(tokenKey(tokenHash))
    if (!item || typeof item.userId !== "string" || typeof item.expiresAt !== "number") return undefined
    return { userId: item.userId, expiresAt: item.expiresAt }
  },

  /** Removes every outstanding token for the user (after a reset, all old links stop working). */
  async deleteForUser(userId: string): Promise<void> {
    const items = await queryAll(PK, "TOKEN#")
    for (const item of items) {
      if (item.userId === userId) await deleteItem({ PK: item.PK, SK: item.SK })
    }
  },

  /** When the last reset email went to this user (epoch ms), if recently. */
  async lastSentAt(userId: string): Promise<number | undefined> {
    const item = await getItem(userKey(userId))
    return typeof item?.sentAt === "number" ? item.sentAt : undefined
  },

  async markSent(userId: string, sentAt: number, cooldownMs: number): Promise<void> {
    await putItem({
      ...userKey(userId),
      entityType: "PASSWORD_RESET_COOLDOWN",
      sentAt,
      ttl: ttlFor(sentAt + cooldownMs),
    })
  },
}
