import { redirect } from "next/navigation"
import { homeFor, requireAccount } from "@/lib/auth/account"

export default async function DashboardIndex() {
  redirect(homeFor(await requireAccount()))
}
