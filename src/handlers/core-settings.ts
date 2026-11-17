import { requireAdmin } from "../lib/auth"
import { noContent, ok } from "../lib/response"
import type { Routes } from "../lib/router"
import { validate } from "../lib/validation"
import { coreMailInput, coreMailTestSendInput } from "../schemas/core-settings"
import { coreSettingsService } from "../services/core-settings.service"

const ACTION = "change core settings"

/** Admin-only, deployment-wide settings (Core settings in the app). */
export const coreSettingsRoutes: Routes = {
  "GET /admin/core-settings/mail": async (ctx) => {
    requireAdmin(ctx, ACTION)
    return ok(await coreSettingsService.getMail())
  },
  "PUT /admin/core-settings/mail": async (ctx) => {
    requireAdmin(ctx, ACTION)
    return ok(await coreSettingsService.saveMail(validate(coreMailInput, ctx.body, "request body")))
  },
  "POST /admin/core-settings/mail/test": async (ctx) => {
    requireAdmin(ctx, ACTION)
    return ok(await coreSettingsService.testMail(validate(coreMailInput, ctx.body, "request body")))
  },
  /** Sends a real message with the saved settings. */
  "POST /admin/core-settings/mail/send-test": async (ctx) => {
    requireAdmin(ctx, ACTION)
    const { to } = validate(coreMailTestSendInput, ctx.body, "request body")
    await coreSettingsService.sendSystemMail({
      to,
      subject: "IamCandidate test email",
      text: "This is a test email from IamCandidate.\n\nYour Core settings → Mail configuration works.",
    })
    return noContent()
  },
}
