import { Router, type Response } from "express";
import { env } from "../../lib/env.js";
import { AppError } from "../../lib/errors.js";
import { AUTH_COOKIE, authCookieOptions, signWebToken, verifyWebToken } from "../../lib/jwt.js";
import { loginEmailLimiter, loginIpLimiter, loginLimiter, oauthRegisterLimiter, oauthTokenLimiter } from "../../lib/rate-limit.js";
import { OAuthHttpError, oauthErrorHandler } from "./oauth.errors.js";
import { authorizePage, consentPage, errorPage } from "./oauth.html.js";
import {
  authenticateResourceOwner,
  consentCsrfToken,
  exchangeAuthorizationCode,
  expectedMcpResource,
  getClient,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  loadUserById,
  redirectHost,
  registerClient,
  resourcesMatch,
  rotateRefreshToken,
  verifyConsentCsrf,
} from "./oauth.service.js";

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

type OAuthQuery = {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  code_challenge: string;
  code_challenge_method: string;
  resource: string;
  scope: string;
  state?: string;
};

function oauthQueryFrom(source: Record<string, unknown>): OAuthQuery {
  const clientId = firstString(source.client_id);
  const redirectUri = firstString(source.redirect_uri);
  const responseType = firstString(source.response_type);
  const codeChallenge = firstString(source.code_challenge);
  const codeChallengeMethod = firstString(source.code_challenge_method) ?? "S256";
  const state = firstString(source.state);
  // `resource` (RFC 8707) es opcional para clientes antiguos: se asume el servidor MCP.
  const resource = firstString(source.resource) ?? expectedMcpResource();
  const scope = firstString(source.scope) ?? "mcp";

  if (!clientId || !redirectUri || !responseType || !codeChallenge) {
    throw new OAuthHttpError(400, "invalid_request", "Faltan client_id, redirect_uri, response_type o code_challenge");
  }
  if (responseType !== "code") {
    throw new OAuthHttpError(400, "unsupported_response_type", "Solo se admite response_type=code");
  }
  if (codeChallengeMethod !== "S256") {
    throw new OAuthHttpError(400, "invalid_request", "code_challenge_method debe ser S256");
  }
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(codeChallenge)) {
    throw new OAuthHttpError(400, "invalid_request", "code_challenge inválido");
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new OAuthHttpError(400, "invalid_request", "redirect_uri no permitido");
  }
  if (!resourcesMatch(resource, expectedMcpResource())) {
    throw new OAuthHttpError(400, "invalid_target", "resource no coincide con el servidor MCP");
  }
  if (state && state.length > 500) {
    throw new OAuthHttpError(400, "invalid_request", "state demasiado largo");
  }

  return {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: responseType,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    resource,
    scope,
    ...(state ? { state } : {}),
  };
}

function redirectWith(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

/** Las páginas de autorización no se pueden incrustar (clickjacking) ni cachear. */
function securePageHeaders(res: Response): void {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
  );
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

/** Usuario con sesión válida en el panel (cookie), o null. */
async function sessionUser(cookie: string | undefined) {
  if (!cookie) return null;
  try {
    const payload = verifyWebToken(cookie);
    const user = await loadUserById(Number(payload.sub));
    return user?.isActive ? user : null;
  } catch {
    return null;
  }
}

async function loadValidatedRequest(source: Record<string, unknown>) {
  const query = oauthQueryFrom(source);
  const client = await getClient(query.client_id);
  if (!client.redirectUris.includes(query.redirect_uri)) {
    throw new OAuthHttpError(400, "invalid_request", "redirect_uri no registrado para este cliente");
  }
  return { query, client };
}

function pageOptions(query: OAuthQuery, clientName: string | null) {
  return {
    clientName: clientName ?? "Cliente MCP",
    redirectHost: redirectHost(query.redirect_uri),
    query: { ...query },
    storeName: env.STORE_NAME,
  };
}

export const oauthRouter = Router();

oauthRouter.post("/register", oauthRegisterLimiter, async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const created = await registerClient({
      client_name: firstString(body.client_name),
      redirect_uris: body.redirect_uris,
      token_endpoint_auth_method: firstString(body.token_endpoint_auth_method),
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

oauthRouter.get("/authorize", async (req, res, next) => {
  securePageHeaders(res);
  try {
    const { query, client } = await loadValidatedRequest(req.query as Record<string, unknown>);
    const user = await sessionUser(req.cookies?.[AUTH_COOKIE] as string | undefined);

    if (user) {
      const csrf = consentCsrfToken({
        userId: user.id,
        clientId: query.client_id,
        redirectUri: query.redirect_uri,
        codeChallenge: query.code_challenge,
      });
      res
        .type("html")
        .send(consentPage({ ...pageOptions(query, client.clientName), userName: user.name, userEmail: user.email, csrf }));
      return;
    }

    res.type("html").send(authorizePage(pageOptions(query, client.clientName)));
  } catch (error) {
    if (error instanceof OAuthHttpError) {
      // Sin redirect_uri validado no se redirige: se muestra el error aquí mismo.
      res.status(error.status).type("html").send(errorPage(error.errorDescription));
      return;
    }
    next(error);
  }
});

oauthRouter.post("/authorize", loginIpLimiter, loginEmailLimiter, loginLimiter, async (req, res, next) => {
  securePageHeaders(res);
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { query, client } = await loadValidatedRequest(body);
    const options = pageOptions(query, client.clientName);

    if (firstString(body.decision) === "deny") {
      res.redirect(
        302,
        redirectWith(query.redirect_uri, {
          error: "access_denied",
          error_description: "El usuario rechazó la solicitud",
          state: query.state,
        }),
      );
      return;
    }

    const email = firstString(body.email);
    const password = firstString(body.password);
    let userId: number;

    if (email || password) {
      if (!email || !password) {
        res.status(400).type("html").send(authorizePage({ ...options, error: "Correo y contraseña son obligatorios" }));
        return;
      }
      let user;
      try {
        user = await authenticateResourceOwner(email, password);
      } catch (error) {
        const message = error instanceof AppError ? error.message : "Credenciales inválidas";
        res.status(401).type("html").send(authorizePage({ ...options, error: message }));
        return;
      }
      res.cookie(
        AUTH_COOKIE,
        signWebToken({ sub: String(user.id), role: user.role, email: user.email, name: user.name }),
        authCookieOptions(),
      );
      userId = user.id;
    } else {
      // Consentimiento con sesión existente: exige el token anti-CSRF de la página.
      const user = await sessionUser(req.cookies?.[AUTH_COOKIE] as string | undefined);
      const csrfOk =
        user !== null &&
        verifyConsentCsrf(firstString(body.csrf), {
          userId: user.id,
          clientId: query.client_id,
          redirectUri: query.redirect_uri,
          codeChallenge: query.code_challenge,
        });
      if (!user || !csrfOk) {
        res
          .status(400)
          .type("html")
          .send(authorizePage({ ...options, error: "La solicitud caducó. Inicia sesión para autorizar." }));
        return;
      }
      userId = user.id;
    }

    const code = await issueAuthorizationCode({
      clientId: query.client_id,
      userId,
      redirectUri: query.redirect_uri,
      codeChallenge: query.code_challenge,
      resource: query.resource,
    });
    res.redirect(302, redirectWith(query.redirect_uri, { code, state: query.state }));
  } catch (error) {
    if (error instanceof OAuthHttpError) {
      res.status(error.status).type("html").send(errorPage(error.errorDescription));
      return;
    }
    next(error);
  }
});

oauthRouter.post("/token", oauthTokenLimiter, async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const grantType = firstString(body.grant_type);
    const clientId = firstString(body.client_id);
    if (!clientId) {
      throw new OAuthHttpError(400, "invalid_client", "client_id es obligatorio");
    }
    await getClient(clientId);

    if (grantType === "authorization_code") {
      const code = firstString(body.code);
      const redirectUri = firstString(body.redirect_uri);
      const codeVerifier = firstString(body.code_verifier);
      if (!code || !redirectUri || !codeVerifier) {
        throw new OAuthHttpError(400, "invalid_request", "code, redirect_uri y code_verifier son obligatorios");
      }
      res.json(
        await exchangeAuthorizationCode({
          code,
          clientId,
          redirectUri,
          codeVerifier,
          resource: firstString(body.resource),
        }),
      );
      return;
    }

    if (grantType === "refresh_token") {
      const refreshToken = firstString(body.refresh_token);
      if (!refreshToken) {
        throw new OAuthHttpError(400, "invalid_request", "refresh_token es obligatorio");
      }
      res.json(await rotateRefreshToken({ refreshToken, clientId, resource: firstString(body.resource) }));
      return;
    }

    throw new OAuthHttpError(400, "unsupported_grant_type", "grant_type no soportado");
  } catch (error) {
    next(error);
  }
});

oauthRouter.use(oauthErrorHandler);
