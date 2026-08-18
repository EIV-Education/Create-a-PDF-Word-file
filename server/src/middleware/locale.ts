import type { NextFunction, Request, Response } from "express";
import { resolveLocale, translate, type Locale } from "../i18n/index.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      locale: Locale;
      t: (key: string, fallback?: string) => string;
    }
  }
}

export function localeMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const fromQuery = typeof req.query.lang === "string" ? req.query.lang : undefined;
  const fromHeader = req.header("accept-language") ?? undefined;
  req.locale = resolveLocale(fromQuery ?? fromHeader);
  req.t = (key: string, fallback?: string) => translate(req.locale, key, fallback);
  next();
}
