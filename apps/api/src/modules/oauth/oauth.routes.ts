import { Router } from "express";
import { AppError } from "../../lib/errors.js";
import { authCookieOptions, signWebToken, verifyWebToken } from "../../lib/jwt.js";
import { OAuthHttpError, oauthErrorHandler } from "./oauth.errors.js";
import { authorizePage } from "./oauth.html.js";
import {
  authenticateResourceOwner,
  exchangeAuthorizationCode,
  expectedMcpResource,
  getClient,
  isAllowedRedirectUri,
  issueAuthorizationCode,
  loadUserById,
  registerClient,
  resourcesMatch,
  rotateRefreshToken,
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

function oauthQueryFrom(source: Record<string, unknown>) {
  const clientId = firstString(source.client_id);
  const redirectUri = firstString(source.redirect_uri);
  const responseType = firstString(source.response_type);
  const codeChallenge = firstString(source.code_challenge);
  const codeChallengeMethod = firstString(source.code_challenge_method) ?? "S256";
  const state = firstString(source.state);
  const resource = firstString(source.resource);
  const scope = firstString(source.scope) ?? "mcp";

  if (!clientId || !redirectUri || !responseType || !codeChallenge || !resource) {
    throw new OAuthHttpError(
      400,
      "invalid_request",
      "Faltan client_id, redirect_uri, response_type, code_challenge o resource",
    );
  }
  if (responseType !== "code") {
    throw new OAuthHttpError(400, "unsupported_response_type", "Solo se admite response_type=code");
  }
  if (codeChallengeMethod !== "S256") {
    throw new OAuthHttpError(400, "invalid_request", "code_challenge_method debe ser S256");
  }
  if (!isAllowedRedirectUri(redirectUri)) {
    throw new OAuthHttpError(400, "invalid_request", "redirect_uri no permitido");
  }
  if (!resourcesMatch(resource, expectedMcpResource())) {
    throw new OAuthHttpError(400, "invalid_target", "resource no coincide con el servidor MCP");
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

function redirectWithCode(redirectUri: string, code: string, state?: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  if (state) {
    url.searchParams.set("state", state);
  }
  return url.toString();
}

export const oauthRouter = Router();

oauthRouter.post("/register", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const created = await registerClient({
      client_name: firstString(body.client_name),
      redirect_uris: body.redirect_uris,
      token_endpoint_auth_method: firstString(body.token_endpoint_auth_method),
      grant_types: body.grant_types,
      response_types: body.response_types,
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

oauthRouter.get("/authorize", async (req, res, next) => {
  try {
    const query = oauthQueryFrom(req.query as Record<string, unknown>);
    const client = await getClient(query.client_id);
    if (!client.redirectUris.includes(query.redirect_uri)) {
      throw new OAuthHttpError(400, "invalid_request", "redirect_uri no registrado");
    }

    const cookie = req.cookies?.token as string | undefined;
    if (cookie) {
      try {
        const payload = verifyWebToken(cookie);
        const user = await loadUserById(Number(payload.sub));
        if (user?.isActive) {
          const code = await issueAuthorizationCode({
            clientId: query.client_id,
            userId: user.id,
            redirectUri: query.redirect_uri,
            codeChallenge: query.code_challenge,
            resource: query.resource,
          });
          res.redirect(redirectWithCode(query.redirect_uri, code, query.state));
          return;
        }
      } catch {
        // show login form
      }
    }

    res
      .type("html")
      .send(authorizePage({ clientName: client.clientName ?? query.client_id, query }));
  } catch (error) {
    next(error);
  }
});

oauthRouter.post("/authorize", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const query = oauthQueryFrom(body);
    const client = await getClient(query.client_id);
    if (!client.redirectUris.includes(query.redirect_uri)) {
      throw new OAuthHttpError(400, "invalid_request", "redirect_uri no registrado");
    }

    const email = firstString(body.email);
    const password = firstString(body.password);
    if (!email || !password) {
      res.status(400).type("html").send(
        authorizePage({
          clientName: client.clientName ?? query.client_id,
          query,
          error: "Correo y contraseña son obligatorios",
        }),
      );
      return;
    }

    let user;
    try {
      user = await authenticateResourceOwner(email, password);
    } catch (error) {
      const message = error instanceof AppError ? error.message : "Credenciales inválidas";
      res.status(401).type("html").send(
        authorizePage({
          clientName: client.clientName ?? query.client_id,
          query,
          error: message,
        }),
      );
      return;
    }

    const webToken = signWebToken({
      sub: String(user.id),
      role: user.role,
      email: user.email,
      name: user.name,
    });
    res.cookie("token", webToken, authCookieOptions());

    const code = await issueAuthorizationCode({
      clientId: query.client_id,
      userId: user.id,
      redirectUri: query.redirect_uri,
      codeChallenge: query.code_challenge,
      resource: query.resource,
    });
    res.redirect(redirectWithCode(query.redirect_uri, code, query.state));
  } catch (error) {
    next(error);
  }
});

oauthRouter.post("/token", async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
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
        throw new OAuthHttpError(
          400,
          "invalid_request",
          "code, redirect_uri y code_verifier son obligatorios",
        );
      }
      const tokens = await exchangeAuthorizationCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
        resource: firstString(body.resource),
      });
      res.json(tokens);
      return;
    }

    if (grantType === "refresh_token") {
      const refreshToken = firstString(body.refresh_token);
      if (!refreshToken) {
        throw new OAuthHttpError(400, "invalid_request", "refresh_token es obligatorio");
      }
      const tokens = await rotateRefreshToken({
        refreshToken,
        clientId,
        resource: firstString(body.resource),
      });
      res.json(tokens);
      return;
    }

    throw new OAuthHttpError(400, "unsupported_grant_type", "grant_type no soportado");
  } catch (error) {
    next(error);
  }
});

oauthRouter.use(oauthErrorHandler);
