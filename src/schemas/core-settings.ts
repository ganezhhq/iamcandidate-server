import { z } from "zod"

import { smtpSettingsInput } from "./communication"

/** Core settings → Mail: the system SMTP account plus the web app's address. */
export const coreMailInput = smtpSettingsInput.extend({
  appUrl: z
    .string()
    .trim()
    .max(2048)
    .pipe(z.url({ protocol: /^https?$/, error: "Enter the app's address, e.g. https://app.example.com" }))
    .transform((url) => url.replace(/\/+$/, "")),
})
export type CoreMailInput = z.output<typeof coreMailInput>

/** Sends a test message to check the whole setup, not only the login. */
export const coreMailTestSendInput = z.strictObject({
  to: z.string().trim().toLowerCase().pipe(z.email().max(254)),
})
