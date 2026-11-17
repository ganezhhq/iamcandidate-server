import { coreSettingsRoutes } from "../handlers/core-settings"
import { PUBLIC_PORTFOLIO_ROUTES, portfolioRoutes } from "../handlers/portfolio"
import { PUBLIC_PRICING_ROUTES, pricingRoutes } from "../handlers/pricing"
import { authRoutes, PUBLIC_ROUTES, userRoutes } from "../handlers/users"
import { createHandler } from "../lib/router"

/** UsersFunction: sign-in and password reset, own account, admin user management, core settings, pricing and portfolio. */
export const handler = createHandler(
  { ...authRoutes, ...userRoutes, ...coreSettingsRoutes, ...pricingRoutes, ...portfolioRoutes },
  { publicRoutes: [...PUBLIC_ROUTES, ...PUBLIC_PRICING_ROUTES, ...PUBLIC_PORTFOLIO_ROUTES] },
)
