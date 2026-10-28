import { LoginForm } from "./login-form";

export default function LoginPage() {
  const seedPassword = process.env.NODE_ENV === "production" ? "" : process.env.SEED_PASSWORD ?? "";
  return <LoginForm seedPassword={seedPassword} />;
}
