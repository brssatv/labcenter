function hasPortalUsernameConflict(
  facilityData,
  normalizePortalUsername,
  username,
  { accountIndex = -1, providerIndex = -1 } = {}
) {
  const usernameTakenInAccounts = facilityData.accounts.some(
    (item, idx) =>
      idx !== accountIndex && normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
  );
  const usernameTakenInProviders = facilityData.providers.some(
    (item, idx) =>
      idx !== providerIndex && normalizePortalUsername(item?.portal?.username || item?.portal_username || "") === username
  );
  return usernameTakenInAccounts || usernameTakenInProviders;
}

const supportedProviderDesignations = ["Dr.", "Mr.", "Ms.", "Mrs."];

function normalizeNpi(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function normalizeLookupText(value) {
  return String(value || "").trim();
}

function normalizeProviderDesignation(value) {
  const raw = normalizeLookupText(value);
  if (!raw) return "";
  const normalizedRaw = raw.replace(/\./g, "").toLowerCase();
  return (
    supportedProviderDesignations.find(
      (candidate) => candidate.replace(/\./g, "").toLowerCase() === normalizedRaw
    ) || ""
  );
}

function joinLookupParts(parts) {
  return parts
    .map((value) => normalizeLookupText(value))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function selectRegistryAddress(addresses, preferredPurpose) {
  const list = Array.isArray(addresses) ? addresses : [];
  const purpose = normalizeLookupText(preferredPurpose).toUpperCase();
  return (
    list.find(
      (item) => normalizeLookupText(item?.address_purpose).toUpperCase() === purpose
    ) ||
    list[0] ||
    null
  );
}

function formatPostalCode(value) {
  const raw = normalizeLookupText(value);
  if (/^\d{9}$/.test(raw)) {
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  }
  return raw;
}

function selectPrimaryTaxonomy(taxonomies) {
  const list = Array.isArray(taxonomies) ? taxonomies : [];
  return (
    list.find(
      (item) =>
        item?.primary === true ||
        normalizeLookupText(item?.primary).toLowerCase() === "true"
    ) ||
    list[0] ||
    null
  );
}

function mapNpiRegistryProvider(result) {
  const basic = result?.basic && typeof result.basic === "object" ? result.basic : {};
  const enumerationType = normalizeLookupText(result?.enumeration_type);
  const personName = joinLookupParts([
    basic.first_name,
    basic.middle_name,
    basic.last_name,
  ]);
  const organizationName = joinLookupParts([
    basic.organization_name,
    basic.organization_name_legal_business_name,
  ]);
  const providerName =
    enumerationType === "NPI-2" ? organizationName || personName : personName || organizationName;
  const designation =
    enumerationType === "NPI-2" ? "" : normalizeProviderDesignation(basic.name_prefix);
  const locationAddress = selectRegistryAddress(result?.addresses, "LOCATION");
  const mailingAddress =
    selectRegistryAddress(result?.addresses, "MAILING") || locationAddress;
  const contactAddress = locationAddress || mailingAddress;
  const primaryTaxonomy = selectPrimaryTaxonomy(result?.taxonomies);

  return {
    npi: normalizeLookupText(result?.number),
    designation,
    providerName,
    displayName: joinLookupParts([designation, providerName]) || providerName,
    contactNo: normalizeLookupText(contactAddress?.telephone_number),
    faxNumber: normalizeLookupText(contactAddress?.fax_number),
    speciality: normalizeLookupText(primaryTaxonomy?.desc),
    mailingAddress: joinLookupParts([
      mailingAddress?.address_1,
      mailingAddress?.address_2,
    ]),
    city: normalizeLookupText(mailingAddress?.city),
    state: normalizeLookupText(mailingAddress?.state),
    zipcode: formatPostalCode(mailingAddress?.postal_code),
    credential: normalizeLookupText(basic.credential),
    enumerationType,
    source: "CMS NPI Registry",
  };
}

function registerFacilityRoutes({ app, dependencies }) {
  const {
    auditLog,
    fetchJsonWithTimeout,
    getFacilityDataForSession,
    hashPassword,
    isPortalAccessEnabled,
    loadFacilityData,
    normalizePortalUsername,
    parseProviderDisplayName,
    requireAuthenticatedUser,
    requireDoctorAuth,
    resolveAccountIndex,
    resolveProviderIndex,
    saveFacilityData,
  } = dependencies;

  app.get("/api/facility/data", requireAuthenticatedUser, (req, res) => {
    return res.json(getFacilityDataForSession(req));
  });

  app.get("/api/facility/providers/lookup", requireAuthenticatedUser, async (req, res) => {
    const npi = normalizeNpi(req.query?.npi);
    if (npi.length !== 10) {
      return res.status(400).json({ error: "Provider NPI must be 10 digits." });
    }

    try {
      const params = new URLSearchParams({
        number: npi,
        version: "2.1",
      });
      const payload = await fetchJsonWithTimeout(
        `https://npiregistry.cms.hhs.gov/api/?${params.toString()}`
      );
      const result = Array.isArray(payload?.results) ? payload.results[0] : null;

      if (!result) {
        return res.status(404).json({ error: `No provider was found for NPI ${npi}.` });
      }

      const provider = mapNpiRegistryProvider(result);
      auditLog(req, "facility_provider_lookup", "success", {
        npi,
        providerName: provider.providerName,
        source: provider.source,
      });

      return res.json({ provider });
    } catch (error) {
      auditLog(req, "facility_provider_lookup", "failed", {
        npi,
        reason: error?.message || "unexpected_error",
      });
      return res.status(502).json({
        error: error?.message || "Unable to fetch provider details from the NPI Registry.",
      });
    }
  });

  app.post("/api/facility/accounts", requireDoctorAuth, (req, res) => {
    try {
      const basicInfo = req.body?.basicInfo || {};
      const paymentConfigurations = req.body?.paymentConfigurations || {};
      const accountSettings = req.body?.accountSettings || {};
      const loginAccess = req.body?.loginAccess || {};
      const orgHierarchy = req.body?.orgHierarchy || {};

      const accountName = String(basicInfo.accountName || "").trim();
      if (!accountName) {
        return res.status(400).json({ error: "Account Name is required." });
      }

      const accessType = String(loginAccess.accessType || "no_login");
      const portalEnabled = isPortalAccessEnabled(accessType);
      const username = normalizePortalUsername(loginAccess.username || "");
      const password = String(loginAccess.password || "");
      if (portalEnabled) {
        if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
        if (password.length < 8) return res.status(400).json({ error: "Portal password must be at least 8 characters." });
      }

      const facilityData = loadFacilityData();
      if (portalEnabled && hasPortalUsernameConflict(facilityData, normalizePortalUsername, username)) {
        return res.status(409).json({ error: "Portal username already exists." });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const nextId = String(200000 + facilityData.accounts.length + 1);
      const accountCode = String(basicInfo.accountCode || nextId).trim();
      const marketingPerson = String(basicInfo.marketingPerson || "-").trim() || "-";
      const paymentMode = String(paymentConfigurations.paymentMode || "CASH").trim() || "CASH";
      const privileges = loginAccess.privileges && typeof loginAccess.privileges === "object" ? loginAccess.privileges : {};
      const portalContact = String(loginAccess.portalContact || "").trim();
      const passwordHash = portalEnabled ? hashPassword(password) : "";

      const account = {
        srno: String(facilityData.accounts.length + 1),
        name: accountName,
        id: nextId,
        contact: String(basicInfo.contact || "").trim(),
        credit_limit: String(paymentConfigurations.creditLimit || "0"),
        current_due: "0",
        credit_days_remaining: String(paymentConfigurations.creditDays || ""),
        account_code: accountCode,
        email: String(basicInfo.email || "").trim(),
        mailing_address: String(basicInfo.mailingAddress || "-").trim() || "-",
        area: String(basicInfo.area || "").trim(),
        city: String(basicInfo.city || "").trim(),
        state: String(basicInfo.state || "").trim(),
        zipcode: String(basicInfo.zipcode || "").trim(),
        payment_mode: paymentMode,
        source: "Portal",
        org_logins_type: portalEnabled ? "Portal Login" : "No Login",
        logins: portalEnabled ? "1" : "0",
        last_updated_time: nowIso,
        created_time: nowIso,
        exported_time: "",
        marketing_person: marketingPerson,
        notes: String(basicInfo.notes || "-").trim() || "-",
        status: "Active",
        portal_enabled: portalEnabled ? "Yes" : "No",
        portal_access: accessType,
        portal_username: portalEnabled ? username : "",
        portal_default_language: String(loginAccess.defaultLanguage || "English"),
        portal_password_hash: passwordHash,
        portal: portalEnabled
          ? {
              username,
              passwordHash,
              accessType,
              defaultLanguage: String(loginAccess.defaultLanguage || "English"),
              linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
              whatsappEnabled: Boolean(loginAccess.whatsappEnabled),
              portalContact,
              privileges,
              createdAt: nowIso,
            }
          : null,
        basic_information: basicInfo,
        payment_configurations: paymentConfigurations,
        account_settings: accountSettings,
        login_access: {
          accessType,
          defaultLanguage: String(loginAccess.defaultLanguage || "English"),
          portalContact,
          linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
          whatsappEnabled: Boolean(loginAccess.whatsappEnabled),
          privileges,
        },
        org_hierarchy: orgHierarchy,
      };

      facilityData.accounts.unshift(account);
      facilityData.importedAt = facilityData.importedAt || nowIso;
      saveFacilityData(facilityData);

      auditLog(req, "facility_account_create", "success", {
        accountId: account.id,
        accountName: account.name,
        portalEnabled,
        portalAccess: accessType,
      });

      return res.status(201).json({ account });
    } catch (error) {
      auditLog(req, "facility_account_create", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to create account." });
    }
  });

  app.put("/api/facility/accounts/:accountId", requireDoctorAuth, (req, res) => {
    try {
      const facilityData = loadFacilityData();
      const accountIndex = resolveAccountIndex(facilityData.accounts, req.params.accountId);
      if (accountIndex < 0) {
        return res.status(404).json({ error: "Account not found." });
      }

      const existing = facilityData.accounts[accountIndex] || {};
      const basicInfo = req.body?.basicInfo || {};
      const paymentConfigurations = req.body?.paymentConfigurations || {};
      const accountSettings = req.body?.accountSettings || {};
      const loginAccess = req.body?.loginAccess || {};
      const orgHierarchy = req.body?.orgHierarchy || {};

      const accountName = String(basicInfo.accountName || existing.name || "").trim();
      if (!accountName) {
        return res.status(400).json({ error: "Account Name is required." });
      }

      const fallbackAccessType =
        existing.login_access?.accessType ||
        existing.portal_access ||
        (existing.portal_enabled === "Yes" ? "report_view" : "no_login");
      const accessType = String(loginAccess.accessType || fallbackAccessType || "no_login");
      const portalEnabled = isPortalAccessEnabled(accessType);
      const username = normalizePortalUsername(
        loginAccess.username || existing.portal_username || existing.portal?.username || ""
      );
      const password = String(loginAccess.password || "");

      if (portalEnabled) {
        if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
        if (password && password.length < 8) {
          return res.status(400).json({ error: "Portal password must be at least 8 characters." });
        }
      }

      if (portalEnabled && hasPortalUsernameConflict(facilityData, normalizePortalUsername, username, { accountIndex })) {
        return res.status(409).json({ error: "Portal username already exists." });
      }

      const nowIso = new Date().toISOString();
      const existingPortal = existing.portal && typeof existing.portal === "object" ? existing.portal : null;
      const existingPrivileges =
        existing.login_access?.privileges || existingPortal?.privileges || {};
      const privileges =
        loginAccess.privileges && typeof loginAccess.privileges === "object"
          ? loginAccess.privileges
          : existingPrivileges;
      const defaultLanguage = String(
        loginAccess.defaultLanguage ||
          existing.login_access?.defaultLanguage ||
          existing.portal_default_language ||
          existingPortal?.defaultLanguage ||
          "English"
      );
      const linkExistingAccount =
        "linkExistingAccount" in loginAccess
          ? Boolean(loginAccess.linkExistingAccount)
          : Boolean(existing.login_access?.linkExistingAccount || existingPortal?.linkExistingAccount);
      const whatsappEnabled =
        "whatsappEnabled" in loginAccess
          ? Boolean(loginAccess.whatsappEnabled)
          : Boolean(existing.login_access?.whatsappEnabled || existingPortal?.whatsappEnabled);
      const portalContact = String(
        loginAccess.portalContact ||
          existing.login_access?.portalContact ||
          existingPortal?.portalContact ||
          ""
      ).trim();

      const nextPasswordHash = portalEnabled
        ? password
          ? hashPassword(password)
          : existingPortal?.passwordHash || ""
        : "";
      if (portalEnabled && !nextPasswordHash) {
        return res.status(400).json({ error: "Portal password is required to enable login." });
      }

      const marketingPerson = String(
        basicInfo.marketingPerson || existing.marketing_person || "-"
      ).trim() || "-";
      const paymentMode = String(
        paymentConfigurations.paymentMode || existing.payment_mode || "CASH"
      ).trim() || "CASH";
      const accountId = String(existing.id || "").trim() || String(req.params.accountId || "").trim();
      const accountCode = String(
        basicInfo.accountCode || existing.account_code || accountId
      ).trim() || accountId;

      const updated = {
        ...existing,
        name: accountName,
        id: accountId,
        contact: String(basicInfo.contact || existing.contact || "").trim(),
        credit_limit: String(paymentConfigurations.creditLimit || existing.credit_limit || "0"),
        credit_days_remaining: String(
          paymentConfigurations.creditDays || existing.credit_days_remaining || ""
        ),
        account_code: accountCode,
        email: String(basicInfo.email || existing.email || "").trim(),
        mailing_address: String(
          basicInfo.mailingAddress || existing.mailing_address || "-"
        ).trim() || "-",
        area: String(basicInfo.area || existing.area || "").trim(),
        city: String(basicInfo.city || existing.city || "").trim(),
        state: String(basicInfo.state || existing.state || "").trim(),
        zipcode: String(basicInfo.zipcode || existing.zipcode || "").trim(),
        payment_mode: paymentMode,
        source: existing.source || "Portal",
        org_logins_type: portalEnabled ? "Portal Login" : "No Login",
        logins: portalEnabled ? "1" : "0",
        last_updated_time: nowIso,
        created_time: existing.created_time || nowIso,
        marketing_person: marketingPerson,
        notes: String(basicInfo.notes || existing.notes || "-").trim() || "-",
        status: String(existing.status || "Active"),
        portal_enabled: portalEnabled ? "Yes" : "No",
        portal_access: accessType,
        portal_username: portalEnabled ? username : "",
        portal_default_language: defaultLanguage,
        portal_password_hash: portalEnabled ? nextPasswordHash : "",
        portal: portalEnabled
          ? {
              username,
              passwordHash: nextPasswordHash,
              accessType,
              defaultLanguage,
              linkExistingAccount,
              whatsappEnabled,
              portalContact,
              privileges,
              createdAt: existingPortal?.createdAt || nowIso,
              updatedAt: nowIso,
            }
          : null,
        basic_information: {
          ...(existing.basic_information || {}),
          ...basicInfo,
        },
        payment_configurations: {
          ...(existing.payment_configurations || {}),
          ...paymentConfigurations,
        },
        account_settings: {
          ...(existing.account_settings || {}),
          ...accountSettings,
        },
        login_access: {
          accessType,
          defaultLanguage,
          portalContact,
          linkExistingAccount,
          whatsappEnabled,
          privileges,
        },
        org_hierarchy: {
          ...(existing.org_hierarchy || {}),
          ...orgHierarchy,
        },
      };

      facilityData.accounts[accountIndex] = updated;
      saveFacilityData(facilityData);

      auditLog(req, "facility_account_update", "success", {
        accountId: updated.id,
        accountName: updated.name,
        portalEnabled,
        portalAccess: accessType,
      });

      return res.json({ account: updated });
    } catch (error) {
      auditLog(req, "facility_account_update", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to update account." });
    }
  });

  app.post("/api/facility/providers", requireDoctorAuth, (req, res) => {
    try {
      const providerInfo = req.body?.providerInfo || {};
      const configuration = req.body?.configuration || {};
      const signature = req.body?.signature || {};
      const loginAccess = req.body?.loginAccess || {};

      const providerName = String(providerInfo.providerName || "").trim();
      if (!providerName) {
        return res.status(400).json({ error: "Provider Name is required." });
      }

      const accessType = String(loginAccess.accessType || "no_login");
      const portalEnabled = isPortalAccessEnabled(accessType);
      const username = normalizePortalUsername(loginAccess.username || "");
      const password = String(loginAccess.password || "");
      if (portalEnabled) {
        if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
        if (password.length < 8) return res.status(400).json({ error: "Portal password must be at least 8 characters." });
      }

      const facilityData = loadFacilityData();
      if (portalEnabled && hasPortalUsernameConflict(facilityData, normalizePortalUsername, username)) {
        return res.status(409).json({ error: "Portal username already exists." });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const nextId = String(300000 + facilityData.providers.length + 1);
      const designation = String(providerInfo.designation || "").trim();
      const fullProviderName = `${designation} ${providerName}`.replace(/\s+/g, " ").trim();
      const state = String(providerInfo.state || "-").trim() || "-";
      const portalContact = String(loginAccess.portalContact || "").trim();
      const passwordHash = portalEnabled ? hashPassword(password) : "";

      const provider = {
        validator_name: fullProviderName || providerName,
        contact_no: String(providerInfo.contactNo || "").trim(),
        email_id: String(providerInfo.email || "-").trim() || "-",
        price_list: "",
        revenue_list: "-",
        business_source: String(configuration.source || "None (Default)").trim() || "None (Default)",
        state,
        npi: String(providerInfo.npi || "").trim(),
        speciality: String(providerInfo.speciality || "").trim(),
        fax_number: String(providerInfo.faxNumber || "").trim(),
        account: String(configuration.accounts || "").trim(),
        provider_id: nextId,
        provider_name: providerName,
        display_name: String(providerInfo.displayName || providerName).trim(),
        extension: String(providerInfo.extension || "").trim(),
        mailing_address: String(providerInfo.mailingAddress || "-").trim() || "-",
        city: String(providerInfo.city || "").trim(),
        zipcode: String(providerInfo.zipcode || "").trim(),
        alternate_emails: String(providerInfo.alternateEmails || "").trim(),
        comment: String(providerInfo.comment || "").trim(),
        dob_month: String(providerInfo.dobMonth || "").trim(),
        dob_day: String(providerInfo.dobDay || "").trim(),
        dob_year: String(providerInfo.dobYear || "").trim(),
        encrypted_reports_password: String(configuration.encryptedReportsPassword || "").trim(),
        send_email: Boolean(configuration.sendEmail),
        send_fax: Boolean(configuration.sendFax),
        send_whatsapp: Boolean(configuration.sendWhatsapp),
        signature_file_name: String(signature.fileName || "").trim(),
        portal_enabled: portalEnabled ? "Yes" : "No",
        portal_access: accessType,
        portal_username: portalEnabled ? username : "",
        portal_default_language: String(loginAccess.defaultLanguage || "English"),
        portal_password_hash: passwordHash,
        created_time: nowIso,
        last_updated_time: nowIso,
        portal: portalEnabled
          ? {
              username,
              passwordHash,
              accessType,
              defaultLanguage: String(loginAccess.defaultLanguage || "English"),
              linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
              portalContact,
              createdAt: nowIso,
            }
          : null,
        provider_information: providerInfo,
        provider_configuration: configuration,
        provider_signature: signature,
        provider_login_access: {
          accessType,
          defaultLanguage: String(loginAccess.defaultLanguage || "English"),
          portalContact,
          linkExistingAccount: Boolean(loginAccess.linkExistingAccount),
        },
      };

      facilityData.providers.unshift(provider);
      facilityData.importedAt = facilityData.importedAt || nowIso;
      saveFacilityData(facilityData);

      auditLog(req, "facility_provider_create", "success", {
        providerId: provider.provider_id,
        providerName: provider.validator_name,
        portalEnabled,
        portalAccess: accessType,
      });

      return res.status(201).json({ provider });
    } catch (error) {
      auditLog(req, "facility_provider_create", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to create provider." });
    }
  });

  app.put("/api/facility/providers/:providerId", requireDoctorAuth, (req, res) => {
    try {
      const facilityData = loadFacilityData();
      const providerIndex = resolveProviderIndex(facilityData.providers, req.params.providerId);
      if (providerIndex < 0) {
        return res.status(404).json({ error: "Provider not found." });
      }

      const existing = facilityData.providers[providerIndex] || {};
      const providerInfo = req.body?.providerInfo || {};
      const configuration = req.body?.configuration || {};
      const signature = req.body?.signature || {};
      const loginAccess = req.body?.loginAccess || {};

      const existingDisplay = parseProviderDisplayName(existing.validator_name || "");
      const providerName = String(
        providerInfo.providerName || existing.provider_name || existingDisplay.providerName || ""
      ).trim();
      if (!providerName) {
        return res.status(400).json({ error: "Provider Name is required." });
      }

      const fallbackAccessType =
        existing.provider_login_access?.accessType ||
        existing.portal_access ||
        (existing.portal_enabled === "Yes" ? "report_view" : "no_login");
      const accessType = String(loginAccess.accessType || fallbackAccessType || "no_login");
      const portalEnabled = isPortalAccessEnabled(accessType);
      const username = normalizePortalUsername(
        loginAccess.username || existing.portal_username || existing.portal?.username || ""
      );
      const password = String(loginAccess.password || "");

      if (portalEnabled) {
        if (!username) return res.status(400).json({ error: "Portal username is required for selected access." });
        if (password && password.length < 8) {
          return res.status(400).json({ error: "Portal password must be at least 8 characters." });
        }
      }

      if (portalEnabled && hasPortalUsernameConflict(facilityData, normalizePortalUsername, username, { providerIndex })) {
        return res.status(409).json({ error: "Portal username already exists." });
      }

      const nowIso = new Date().toISOString();
      const existingPortal = existing.portal && typeof existing.portal === "object" ? existing.portal : null;
      const defaultLanguage = String(
        loginAccess.defaultLanguage ||
          existing.provider_login_access?.defaultLanguage ||
          existing.portal_default_language ||
          existingPortal?.defaultLanguage ||
          "English"
      );
      const linkExistingAccount =
        "linkExistingAccount" in loginAccess
          ? Boolean(loginAccess.linkExistingAccount)
          : Boolean(existing.provider_login_access?.linkExistingAccount || existingPortal?.linkExistingAccount);
      const portalContact = String(
        loginAccess.portalContact ||
          existing.provider_login_access?.portalContact ||
          existingPortal?.portalContact ||
          ""
      ).trim();
      const nextPasswordHash = portalEnabled
        ? password
          ? hashPassword(password)
          : existingPortal?.passwordHash || ""
        : "";
      if (portalEnabled && !nextPasswordHash) {
        return res.status(400).json({ error: "Portal password is required to enable login." });
      }

      const derivedDesignation = String(
        providerInfo.designation || existing.provider_information?.designation || existingDisplay.designation || ""
      ).trim();
      const designation = derivedDesignation;
      const displayName = String(
        providerInfo.displayName || existing.display_name || existing.provider_name || providerName
      ).trim() || providerName;
      const fullProviderName = `${designation} ${providerName}`.replace(/\s+/g, " ").trim() || providerName;
      const state = String(providerInfo.state || existing.state || "-").trim() || "-";
      const source = String(configuration.source || existing.business_source || "None (Default)").trim() || "None (Default)";
      const accounts = String(configuration.accounts || existing.account || "").trim();
      const encryptedReportsPassword = String(
        configuration.encryptedReportsPassword || existing.encrypted_reports_password || ""
      ).trim();
      const sendEmail =
        "sendEmail" in configuration ? Boolean(configuration.sendEmail) : Boolean(existing.send_email);
      const sendFax = "sendFax" in configuration ? Boolean(configuration.sendFax) : Boolean(existing.send_fax);
      const sendWhatsapp =
        "sendWhatsapp" in configuration ? Boolean(configuration.sendWhatsapp) : Boolean(existing.send_whatsapp);
      const signatureFileName = String(signature.fileName || existing.signature_file_name || "").trim();
      const providerId = String(existing.provider_id || "").trim();

      const updated = {
        ...existing,
        validator_name: fullProviderName || providerName,
        contact_no: String(providerInfo.contactNo || existing.contact_no || "").trim(),
        email_id: String(providerInfo.email || existing.email_id || "-").trim() || "-",
        price_list: String(existing.price_list || ""),
        revenue_list: String(existing.revenue_list || "-") || "-",
        business_source: source,
        state,
        npi: String(providerInfo.npi || existing.npi || "").trim(),
        speciality: String(providerInfo.speciality || existing.speciality || "").trim(),
        fax_number: String(providerInfo.faxNumber || existing.fax_number || "").trim(),
        account: accounts,
        provider_id: providerId || undefined,
        provider_name: providerName,
        display_name: displayName,
        extension: String(providerInfo.extension || existing.extension || "").trim(),
        mailing_address: String(providerInfo.mailingAddress || existing.mailing_address || "-").trim() || "-",
        city: String(providerInfo.city || existing.city || "").trim(),
        zipcode: String(providerInfo.zipcode || existing.zipcode || "").trim(),
        alternate_emails: String(providerInfo.alternateEmails || existing.alternate_emails || "").trim(),
        comment: String(providerInfo.comment || existing.comment || "").trim(),
        dob_month: String(providerInfo.dobMonth || existing.dob_month || "").trim(),
        dob_day: String(providerInfo.dobDay || existing.dob_day || "").trim(),
        dob_year: String(providerInfo.dobYear || existing.dob_year || "").trim(),
        encrypted_reports_password: encryptedReportsPassword,
        send_email: sendEmail,
        send_fax: sendFax,
        send_whatsapp: sendWhatsapp,
        signature_file_name: signatureFileName,
        portal_enabled: portalEnabled ? "Yes" : "No",
        portal_access: accessType,
        portal_username: portalEnabled ? username : "",
        portal_default_language: defaultLanguage,
        portal_password_hash: portalEnabled ? nextPasswordHash : "",
        created_time: existing.created_time || nowIso,
        last_updated_time: nowIso,
        portal: portalEnabled
          ? {
              username,
              passwordHash: nextPasswordHash,
              accessType,
              defaultLanguage,
              linkExistingAccount,
              portalContact,
              createdAt: existingPortal?.createdAt || nowIso,
              updatedAt: nowIso,
            }
          : null,
        provider_information: {
          ...(existing.provider_information || {}),
          ...providerInfo,
          designation,
          providerName,
          displayName,
        },
        provider_configuration: {
          ...(existing.provider_configuration || {}),
          ...configuration,
          source,
          accounts,
          encryptedReportsPassword,
          sendEmail,
          sendFax,
          sendWhatsapp,
        },
        provider_signature: {
          ...(existing.provider_signature || {}),
          ...signature,
          fileName: signatureFileName,
        },
        provider_login_access: {
          accessType,
          defaultLanguage,
          portalContact,
          linkExistingAccount,
        },
      };

      if (!providerId) {
        delete updated.provider_id;
      }

      facilityData.providers[providerIndex] = updated;
      saveFacilityData(facilityData);

      auditLog(req, "facility_provider_update", "success", {
        providerId: updated.provider_id || `idx-${providerIndex}`,
        providerName: updated.validator_name,
        portalEnabled,
        portalAccess: accessType,
      });

      return res.json({ provider: updated });
    } catch (error) {
      auditLog(req, "facility_provider_update", "failed", {
        reason: error?.message || "unexpected_error",
      });
      return res.status(500).json({ error: "Unable to update provider." });
    }
  });
}

module.exports = {
  registerFacilityRoutes,
};
