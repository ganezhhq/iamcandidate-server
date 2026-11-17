import { getConfig } from "../lib/config"
import { AppError, BadRequestError } from "../lib/errors"
import { nowIso } from "../lib/ids"
import { decryptSecret, encryptSecret } from "../lib/secrets"
import type { CoreMailSettings, StoredCoreMailSettings } from "../models"
import { getItem, putItem, stripKeys } from "../repositories/dynamodb/table"
import type { CoreMailInput } from "../schemas/core-settings"
import { assertAllowedHost, smtpError, transport } from "./smtp.service"

/**
 * Core settings are deployment-wide (not per user) and only admins manage
 * them. Mail is the system mailbox for account emails such as password
 * resets; its password is encrypted like the per-user SMTP settings and is
 * never returned by the API.
 *
 *   PK = GLOBAL   SK = CORE_SETTINGS#MAIL
 */
const MAIL_KEY = { PK: "GLOBAL", SK: "CORE_SETTINGS#MAIL" }

/** First allowed origin: a sensible default for the app's address. */
function defaultAppUrl(): string {
  return getConfig().allowedOrigins[0]?.replace(/\/+$/, "") ?? ""
}

function toPublic(stored: StoredCoreMailSettings | undefined): CoreMailSettings {
  if (!stored) {
    return {
      host: "",
      port: 587,
      username: "",
      password: "",
      hasPassword: false,
      encryption: "tls",
      senderName: "IamCandidate",
      senderEmail: "",
      appUrl: defaultAppUrl(),
    }
  }
  const { encryptedPassword, ...rest } = stored
  return { ...rest, password: "", hasPassword: Boolean(encryptedPassword) }
}

async function getStored(): Promise<StoredCoreMailSettings | undefined> {
  const item = await getItem(MAIL_KEY)
  return item ? stripKeys<StoredCoreMailSettings>(item) : undefined
}

async function putStored(settings: StoredCoreMailSettings): Promise<void> {
  await putItem({ ...settings, ...MAIL_KEY, entityType: "CORE_SETTINGS" })
}

/** The given password, else the saved one; an empty result means none is set. */
function resolvePassword(input: { password: string }, existing?: StoredCoreMailSettings): string {
  if (input.password) return input.password
  return existing?.encryptedPassword ? decryptSecret(existing.encryptedPassword) : ""
}

export const coreSettingsService = {
  async getMail(): Promise<CoreMailSettings> {
    return toPublic(await getStored())
  },

  /** An empty password keeps the stored one. */
  async saveMail(input: CoreMailInput): Promise<CoreMailSettings> {
    const existing = await getStored()
    const encryptedPassword = input.password
      ? encryptSecret(input.password)
      : existing?.encryptedPassword
    if (!encryptedPassword) throw new BadRequestError("Enter the SMTP password")
    await assertAllowedHost(input.host)

    const sameConnection =
      existing &&
      !input.password &&
      existing.host === input.host &&
      existing.port === input.port &&
      existing.username === input.username &&
      existing.encryption === input.encryption
    const next: StoredCoreMailSettings = {
      host: input.host,
      port: input.port,
      username: input.username,
      encryption: input.encryption,
      senderName: input.senderName,
      senderEmail: input.senderEmail,
      appUrl: input.appUrl,
      encryptedPassword,
      ...(sameConnection && existing.lastTestedAt ? { lastTestedAt: existing.lastTestedAt } : {}),
    }
    await putStored(next)
    return toPublic(next)
  },

  /** Connects and authenticates without sending. Uses the stored password if none is given. */
  async testMail(input: CoreMailInput): Promise<{ ok: true; latencyMs: number }> {
    const existing = await getStored()
    const password = resolvePassword(input, existing)
    if (!password) throw new BadRequestError("Enter the SMTP password")
    await assertAllowedHost(input.host)

    const started = Date.now()
    try {
      await transport(input, password).verify()
    } catch (error) {
      throw smtpError(error, input)
    }
    const latencyMs = Date.now() - started
    if (existing && existing.host === input.host && existing.username === input.username) {
      await putStored({ ...existing, lastTestedAt: nowIso() })
    }
    return { ok: true, latencyMs }
  },

  /** True once an admin has saved a mailbox, so account emails can be sent. */
  async isMailConfigured(): Promise<boolean> {
    return Boolean((await getStored())?.encryptedPassword)
  },

  /** The web app's address for links in emails (no trailing slash). */
  async appUrl(): Promise<string> {
    return (await getStored())?.appUrl || defaultAppUrl()
  },

  /** Sends one plain-text message from the system mailbox. */
  async sendSystemMail(message: { to: string; subject: string; text: string }): Promise<void> {
    const stored = await getStored()
    if (!stored?.encryptedPassword) {
      throw new AppError(
        503,
        "SERVICE_UNAVAILABLE",
        "Email isn't set up yet. An admin can set it up in Core settings → Mail.",
      )
    }
    await assertAllowedHost(stored.host)
    try {
      await transport(stored, decryptSecret(stored.encryptedPassword)).sendMail({
        from: { name: stored.senderName, address: stored.senderEmail },
        to: message.to,
        subject: message.subject,
        text: message.text,
      })
    } catch (error) {
      throw smtpError(error, stored)
    }
  },
}
