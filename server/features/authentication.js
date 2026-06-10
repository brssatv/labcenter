function registerAuthRoutes({ app, dependencies }) {
  const {
    OIDC_AUTH_TIMEOUT_MS,
    OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET,
    OIDC_ENABLED,
    OIDC_ISSUER,
    OIDC_REQUIRED_ROLE,
    OIDC_SCOPE,
    SESSION_TTL_MS,
    auditLog,
    buildOidcErrorRedirect,
    buildOidcLogoutUrl,
    buildSessionStatePayload,
    clearFailures,
    destroySessionAsync,
    extractOidcRoles,
    fetchJsonWithTimeout,
    getClientIp,
    getLockoutRemaining,
    getOidcDiscovery,
    getOidcDisplayName,
    getOidcRedirectUri,
    hasAuthenticatedSession,
    isPortalAccessEnabled,
    isProd,
    loadFacilityData,
    loadUsers,
    lockKey,
    loginLimiter,
    normalizePortalUsername,
    randomBase64Url,
    randomToken,
    regenerateSessionAsync,
    registerFailure,
    saveSessionAsync,
    toCodeChallenge,
    validateOidcIdToken,
    verifyPassword,
  } = dependencies;

  app.get("/api/auth/csrf-token", (req, res) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomToken();
    }
    res.json({ csrfToken: req.session.csrfToken });
  });

  function requireCsrf(req, res, next) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

    const provided = req.get("x-csrf-token");
    const expected = req.session.csrfToken;
    if (!provided || !expected || provided !== expected) {
      auditLog(req, "csrf_check", "denied");
      return res.status(403).json({ error: "Invalid CSRF token." });
    }

    next();
  }

  app.use("/api", requireCsrf);

  app.get("/api/auth/config", (_req, res) => {
    return res.json({
      adminAuthMode: OIDC_ENABLED ? "oidc" : "local",
      oidcLoginUrl: OIDC_ENABLED ? "/auth/oidc/login" : null,
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session.user) {
      return res.status(401).json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      user: req.session.user,
      session: buildSessionStatePayload(req),
    });
  });

  app.post("/api/session/refresh", async (req, res) => {
    if (!hasAuthenticatedSession(req)) {
      return res.status(401).json({ authenticated: false, error: "Session expired." });
    }

    try {
      req.session.csrfToken = randomToken();
      req.session.cookie.maxAge = SESSION_TTL_MS;
      await saveSessionAsync(req);

      auditLog(req, "session_refresh", "success", {
        sessionType: req.session.user ? "doctor" : "client",
      });

      return res.json({
        ok: true,
        csrfToken: req.session.csrfToken,
        session: buildSessionStatePayload(req),
      });
    } catch (error) {
      auditLog(req, "session_refresh", "failed", {
        reason: error?.message || "unknown_error",
      });
      return res.status(500).json({ error: "Unable to refresh session." });
    }
  });

  app.get("/auth/oidc/login", async (req, res) => {
    if (!OIDC_ENABLED) {
      return res.redirect(buildOidcErrorRedirect(req, "LabCenter Cloud ID is not configured for this environment."));
    }

    if (req.session.user) {
      return res.redirect("/");
    }

    try {
      const discovery = await getOidcDiscovery();
      const state = randomBase64Url(32);
      const nonce = randomBase64Url(32);
      const codeVerifier = randomBase64Url(64);
      const authorizationUrl = new URL(discovery.authorization_endpoint);

      req.session.oidc = {
        state,
        nonce,
        codeVerifier,
        requestedAt: Date.now(),
      };

      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("client_id", OIDC_CLIENT_ID);
      authorizationUrl.searchParams.set("redirect_uri", getOidcRedirectUri(req));
      authorizationUrl.searchParams.set("scope", OIDC_SCOPE);
      authorizationUrl.searchParams.set("state", state);
      authorizationUrl.searchParams.set("nonce", nonce);
      authorizationUrl.searchParams.set("code_challenge", toCodeChallenge(codeVerifier));
      authorizationUrl.searchParams.set("code_challenge_method", "S256");

      await saveSessionAsync(req);

      auditLog(req, "oidc_login", "redirect", { issuer: discovery.issuer || OIDC_ISSUER });
      return res.redirect(authorizationUrl.toString());
    } catch (error) {
      auditLog(req, "oidc_login", "failed", { reason: error?.message || "unknown_error" });
      return res.redirect(buildOidcErrorRedirect(req, "Unable to start LabCenter Cloud ID sign-in."));
    }
  });

  app.get("/auth/oidc/callback", async (req, res) => {
    if (!OIDC_ENABLED) {
      return res.redirect(buildOidcErrorRedirect(req, "LabCenter Cloud ID is not configured for this environment."));
    }

    const providerError = String(req.query?.error || "").trim();
    const providerErrorDescription = String(req.query?.error_description || "").trim();
    const code = String(req.query?.code || "").trim();
    const returnedState = String(req.query?.state || "").trim();
    const pendingOidc = req.session?.oidc;

    if (providerError) {
      delete req.session.oidc;
      await saveSessionAsync(req).catch(() => {});
      auditLog(req, "oidc_callback", "failed", {
        reason: providerError,
        detail: providerErrorDescription,
      });
      return res.redirect(
        buildOidcErrorRedirect(req, providerErrorDescription || "LabCenter Cloud ID sign-in was cancelled or denied.")
      );
    }

    if (!pendingOidc?.state || !pendingOidc?.nonce || !pendingOidc?.codeVerifier) {
      auditLog(req, "oidc_callback", "failed", { reason: "missing_pending_session" });
      return res.redirect(buildOidcErrorRedirect(req, "Your sign-in session expired. Please try again."));
    }

    if (!code || !returnedState || returnedState !== pendingOidc.state) {
      delete req.session.oidc;
      await saveSessionAsync(req).catch(() => {});
      auditLog(req, "oidc_callback", "failed", { reason: "invalid_state" });
      return res.redirect(buildOidcErrorRedirect(req, "We could not verify your sign-in request. Please try again."));
    }

    if (Date.now() - Number(pendingOidc.requestedAt || 0) > OIDC_AUTH_TIMEOUT_MS) {
      delete req.session.oidc;
      await saveSessionAsync(req).catch(() => {});
      auditLog(req, "oidc_callback", "failed", { reason: "request_expired" });
      return res.redirect(buildOidcErrorRedirect(req, "Your sign-in session expired. Please try again."));
    }

    try {
      const discovery = await getOidcDiscovery();
      const tokenRequestBody = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getOidcRedirectUri(req),
        client_id: OIDC_CLIENT_ID,
        code_verifier: String(pendingOidc.codeVerifier),
      });

      if (OIDC_CLIENT_SECRET) {
        tokenRequestBody.set("client_secret", OIDC_CLIENT_SECRET);
      }

      const tokenResponse = await fetchJsonWithTimeout(discovery.token_endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: tokenRequestBody.toString(),
      });

      if (!tokenResponse.id_token) {
        throw new Error("The identity provider did not return an ID token.");
      }

      const claims = await validateOidcIdToken(tokenResponse.id_token, pendingOidc.nonce, discovery);
      const oidcRoles = extractOidcRoles(claims);

      if (OIDC_REQUIRED_ROLE && !oidcRoles.includes(OIDC_REQUIRED_ROLE)) {
        const accessError = new Error("Your account is not assigned LabCenter admin access.");
        accessError.userMessage = "Your account is not assigned LabCenter admin access.";
        throw accessError;
      }

      const displayName = getOidcDisplayName(claims);
      const email = String(claims.email || "").trim().toLowerCase();
      const username = String(claims.preferred_username || email || claims.sub || "").trim();
      const user = {
        id: String(claims.sub || username || email || randomBase64Url(16)),
        email,
        username,
        role: "doctor",
        displayName,
        authProvider: "oidc",
        oidcIssuer: String(discovery.issuer || OIDC_ISSUER),
        oidcRoles,
      };

      await regenerateSessionAsync(req);
      req.session.user = user;
      req.session.csrfToken = randomToken();
      req.session.oidc = {
        issuer: String(discovery.issuer || OIDC_ISSUER),
        idToken: String(tokenResponse.id_token),
        sid: String(claims.sid || ""),
        username,
      };
      await saveSessionAsync(req);

      auditLog(req, "oidc_callback", "success", {
        userId: user.id,
        email: user.email,
        username: user.username,
        roles: oidcRoles,
      });
      return res.redirect("/");
    } catch (error) {
      delete req.session.oidc;
      await saveSessionAsync(req).catch(() => {});
      auditLog(req, "oidc_callback", "failed", { reason: error?.message || "unknown_error" });
      return res.redirect(
        buildOidcErrorRedirect(req, error?.userMessage || "Unable to complete LabCenter Cloud ID sign-in.")
      );
    }
  });

  app.post("/api/auth/login", loginLimiter, (req, res) => {
    if (OIDC_ENABLED) {
      return res.status(409).json({ error: "Admin login uses LabCenter Cloud ID. Continue with SSO instead." });
    }

    const identifier = String(req.body?.identifier || req.body?.username || req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const ip = getClientIp(req);

    if (!identifier || !password) {
      auditLog(req, "login", "failed", { reason: "missing_fields", identifier });
      return res.status(400).json({ error: "Username and password are required." });
    }

    const key = lockKey(identifier, ip);
    const lockoutMs = getLockoutRemaining(key);
    if (lockoutMs > 0) {
      auditLog(req, "login", "blocked", { reason: "lockout", identifier });
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${Math.ceil(lockoutMs / 60000)} minutes.`,
      });
    }

    const user = loadUsers().find((item) => {
      const email = String(item?.email || "").trim().toLowerCase();
      const username = String(item?.username || item?.id || "").trim().toLowerCase();
      return identifier === email || (username && identifier === username);
    });
    const validPassword = user ? verifyPassword(password, user.passwordHash) : false;

    if (!user || !validPassword) {
      registerFailure(key);
      auditLog(req, "login", "failed", { reason: "invalid_credentials", identifier });
      return res.status(401).json({ error: "Invalid credentials." });
    }

    req.session.regenerate((err) => {
      if (err) {
        auditLog(req, "login", "failed", { reason: "session_regenerate_error", identifier });
        return res.status(500).json({ error: "Unable to create session." });
      }

      req.session.user = {
        id: user.id,
        email: user.email,
        username: user.username || user.id || user.email,
        role: user.role,
        displayName: user.displayName,
        authProvider: "local",
      };
      req.session.csrfToken = randomToken();
      clearFailures(key);

      auditLog(req, "login", "success", { identifier, userId: user.id, role: user.role });
      return res.json({
        authenticated: true,
        user: req.session.user,
        csrfToken: req.session.csrfToken,
        session: buildSessionStatePayload(req),
      });
    });
  });

  app.post("/api/auth/logout", async (req, res) => {
    if (!req.session.user) {
      return res.status(204).end();
    }

    const { user } = req.session;
    let logoutUrl = "";

    if (user.authProvider === "oidc" && OIDC_ENABLED) {
      try {
        const discovery = await getOidcDiscovery();
        logoutUrl = buildOidcLogoutUrl(req, discovery, req.session.oidc);
      } catch (error) {
        auditLog(req, "oidc_logout", "failed", { reason: error?.message || "unknown_error" });
      }
    }

    auditLog(req, "logout", "success", { userId: user.id, email: user.email, role: user.role });

    try {
      await destroySessionAsync(req);
      res.clearCookie("labcenter.sid", {
        httpOnly: true,
        sameSite: OIDC_ENABLED ? "lax" : "strict",
        secure: isProd,
      });
      if (logoutUrl) {
        return res.json({ loggedOut: true, logoutUrl });
      }
      return res.status(204).end();
    } catch {
      return res.status(500).json({ error: "Unable to logout cleanly." });
    }
  });

  app.get("/api/client-auth/me", (req, res) => {
    if (!req.session.clientUser) {
      return res.status(401).json({ authenticated: false });
    }
    return res.json({
      authenticated: true,
      clientUser: req.session.clientUser,
      session: buildSessionStatePayload(req),
    });
  });

  app.post("/api/client-auth/login", loginLimiter, (req, res) => {
    const username = normalizePortalUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const ip = getClientIp(req);

    if (!username || !password) {
      auditLog(req, "client_login", "failed", { reason: "missing_fields", username });
      return res.status(400).json({ error: "Username and password are required." });
    }

    const key = lockKey(`client:${username}`, ip);
    const lockoutMs = getLockoutRemaining(key);
    if (lockoutMs > 0) {
      auditLog(req, "client_login", "blocked", { reason: "lockout", username });
      return res.status(429).json({
        error: `Account temporarily locked. Try again in ${Math.ceil(lockoutMs / 60000)} minutes.`,
      });
    }

    const facilityData = loadFacilityData();
    const account = facilityData.accounts.find(
      (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username) === username
    );
    const provider = facilityData.providers.find(
      (item) => normalizePortalUsername(item?.portal?.username || item?.portal_username) === username
    );
    const entity = account
      ? { type: "account", record: account }
      : provider
      ? { type: "provider", record: provider }
      : null;
    const record = entity?.record || null;
    const portal = record
      ? {
          username: normalizePortalUsername(record?.portal?.username || record?.portal_username || ""),
          accessType:
            record?.portal?.accessType ||
            record?.portal_access ||
            record?.login_access?.accessType ||
            record?.provider_login_access?.accessType ||
            "no_login",
          passwordHash: record?.portal?.passwordHash || record?.portal_password_hash || "",
          defaultLanguage:
            record?.portal?.defaultLanguage ||
            record?.portal_default_language ||
            record?.login_access?.defaultLanguage ||
            record?.provider_login_access?.defaultLanguage ||
            "English",
          privileges:
            record?.portal?.privileges ||
            record?.login_access?.privileges ||
            record?.provider_login_access?.privileges ||
            {},
        }
      : null;

    if (!portal || !isPortalAccessEnabled(portal.accessType) || !verifyPassword(password, portal.passwordHash)) {
      registerFailure(key);
      auditLog(req, "client_login", "failed", { reason: "invalid_credentials", username });
      return res.status(401).json({ error: "Invalid client portal credentials." });
    }

    req.session.regenerate((err) => {
      if (err) {
        auditLog(req, "client_login", "failed", { reason: "session_regenerate_error", username });
        return res.status(500).json({ error: "Unable to create session." });
      }

      req.session.clientUser = {
        username: portal.username || username,
        entityType: entity.type,
        accountId: String(record?.id || record?.provider_id || ""),
        accountName: String(record?.name || record?.validator_name || ""),
        accessType: portal.accessType,
        privileges: portal.privileges || {},
        defaultLanguage: portal.defaultLanguage || "English",
      };
      req.session.csrfToken = randomToken();
      clearFailures(key);

      auditLog(req, "client_login", "success", {
        username,
        accountId: String(record?.id || record?.provider_id || ""),
        accessType: portal.accessType,
        entityType: entity.type,
      });

      return res.json({
        authenticated: true,
        clientUser: req.session.clientUser,
        csrfToken: req.session.csrfToken,
        session: buildSessionStatePayload(req),
      });
    });
  });

  app.post("/api/client-auth/logout", (req, res) => {
    if (!req.session.clientUser) {
      return res.status(204).end();
    }

    const { clientUser } = req.session;
    auditLog(req, "client_logout", "success", {
      username: clientUser.username,
      accountId: clientUser.accountId,
      accessType: clientUser.accessType,
    });

    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Unable to logout cleanly." });
      res.clearCookie("labcenter.sid");
      return res.status(204).end();
    });
  });
}

module.exports = {
  registerAuthRoutes,
};
