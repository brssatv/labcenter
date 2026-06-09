const editablePatientProfileFields = [
  "referenceLab",
  "facilityName",
  "provider",
  "providerNpi",
  "mrn",
  "firstName",
  "middleName",
  "lastName",
  "suffix",
  "sex",
  "phoneBelongsTo",
  "patientType",
  "dob",
  "age",
  "phone",
  "email",
  "state",
  "address",
  "address2",
  "city",
  "zipcode",
  "county",
  "ethnicity",
  "country",
  "race",
  "billingType",
  "primaryInsurance",
  "primaryMemberPolicy",
  "primaryGroup",
  "primaryGroupNo",
  "primaryAttachments",
  "insurancePhone",
  "secondaryInsurance",
  "secondaryMemberPolicy",
  "secondaryGroup",
  "secondaryGroupNo",
  "secondaryAttachments",
  "tertiaryInsurance",
  "tertiaryMemberPolicy",
  "tertiaryGroup",
  "tertiaryGroupNo",
  "tertiaryAttachments",
  "workersCompensation",
  "workersMemberPolicy",
  "compensationManager",
  "injuryDate",
  "collectionDate",
  "collectionTime",
  "receivedDate",
  "additionalInformation",
];

function sanitizePatientProfileUpdate(profile, patientId) {
  const next = {
    patientId: String(patientId || "").trim(),
  };

  editablePatientProfileFields.forEach((field) => {
    next[field] = String(profile?.[field] || "").trim();
  });

  return next;
}

function buildPatientFullName(record) {
  return [record?.firstName, record?.middleName, record?.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function buildPatientProfileArtifacts({
  patientId,
  patient,
  registrations = [],
  orders = [],
  now = new Date().toISOString(),
} = {}) {
  const resolvedPatientId = String(patientId || "").trim();
  const nextProfile = sanitizePatientProfileUpdate(patient || {}, resolvedPatientId);
  const fullPatientName = buildPatientFullName(nextProfile);

  const registrationUpdates = registrations.length
    ? registrations.map((entry) => ({
        recordKey: String(entry?.recordKey || "").trim(),
        record: {
          ...(entry?.record || {}),
          ...nextProfile,
          patientId: resolvedPatientId,
          createdAt: entry?.record?.createdAt || now,
        },
      }))
    : [
        {
          ...nextProfile,
          patientId: resolvedPatientId,
          createdAt: now,
        },
      ];

  const orderUpdates = orders.map((order) => ({
    ...order,
    patientId: resolvedPatientId,
    patientName: fullPatientName || String(order?.patientName || "").trim(),
    patientDob: nextProfile.dob || String(order?.patientDob || "").trim(),
    provider: nextProfile.provider || String(order?.provider || "").trim(),
    facilityName: nextProfile.facilityName || String(order?.facilityName || "").trim(),
    updatedAt: now,
  }));

  return {
    nextProfile,
    registrationUpdates,
    orderUpdates,
  };
}

module.exports = {
  editablePatientProfileFields,
  sanitizePatientProfileUpdate,
  buildPatientFullName,
  buildPatientProfileArtifacts,
};
