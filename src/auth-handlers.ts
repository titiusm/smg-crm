// Re-export route handlers so the App Router's dynamic route can consume them.
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
