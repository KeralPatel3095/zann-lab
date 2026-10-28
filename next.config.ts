import path from "path";
import type { NextConfig } from "next";

const externalPackages = ["embedded-postgres", "postgres", "exceljs", "nodemailer", "pg", "pg-connection-string"];

const nextConfig: NextConfig = {
  serverExternalPackages: externalPackages,
  webpack: (config, { isServer, nextRuntime }) => {
    if (nextRuntime === "edge") {
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        [path.join(process.cwd(), "src/instrumentation-node.ts")]: path.join(process.cwd(), "src/instrumentation-node-stub.ts"),
      };
    }
    if (!isServer) return config;
    const current = config.externals;
    const listed = Array.isArray(current) ? current : current ? [current] : [];
    config.externals = [...listed, ...externalPackages];
    return config;
  },
};

export default nextConfig;
