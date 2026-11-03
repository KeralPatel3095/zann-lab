import { LoginForm } from "./login-form";

export default function LoginPage() {
  // Staff password list is local-dev only. Never show in production builds.
  const showDevLogins = process.env.NODE_ENV !== "production" && process.env.SHOW_DEV_LOGINS === "true";
  const seedPassword = showDevLogins ? process.env.SEED_PASSWORD ?? "" : "";
  return <LoginForm seedPassword={seedPassword} />;
}
