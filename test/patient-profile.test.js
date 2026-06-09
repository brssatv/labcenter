const test = require("node:test");
const assert = require("node:assert/strict");

const {
  sanitizePatientProfileUpdate,
  buildPatientFullName,
  buildPatientProfileArtifacts,
} = require("../lib/patient-profile");

test("sanitizePatientProfileUpdate trims editable patient fields", () => {
  const result = sanitizePatientProfileUpdate(
    {
      firstName: "  Jane  ",
      lastName: "  Doe ",
      phone: " 5551234567 ",
      primaryInsurance: "  Blue Shield ",
      patientType: " Existing ",
      unsupportedField: "ignore me",
    },
    " 9001 "
  );

  assert.equal(result.patientId, "9001");
  assert.equal(result.firstName, "Jane");
  assert.equal(result.lastName, "Doe");
  assert.equal(result.phone, "5551234567");
  assert.equal(result.primaryInsurance, "Blue Shield");
  assert.equal(result.patientType, "Existing");
  assert.equal(result.unsupportedField, undefined);
  assert.equal(result.referenceLab, "");
});

test("buildPatientFullName joins populated patient name parts", () => {
  assert.equal(
    buildPatientFullName({ firstName: "Jane", middleName: "Q", lastName: "Doe" }),
    "Jane Q Doe"
  );
  assert.equal(
    buildPatientFullName({ firstName: "Jane", middleName: "", lastName: "Doe" }),
    "Jane Doe"
  );
  assert.equal(buildPatientFullName({ firstName: "", middleName: "", lastName: "" }), "");
});

test("buildPatientProfileArtifacts preserves registration identity and updates linked orders", () => {
  const now = "2026-06-09T08:00:00.000Z";
  const registrations = [
    {
      recordKey: "reg-a",
      record: {
        patientId: "9001",
        firstName: "Old",
        lastName: "Patient",
        phone: "5550000000",
        provider: "Old Provider",
        facilityName: "Old Facility",
        createdAt: "2026-04-01T10:00:00.000Z",
      },
    },
  ];
  const orders = [
    {
      orderId: "00001",
      patientId: "9001",
      patientName: "Old Patient",
      patientDob: "1980-01-01",
      provider: "Old Provider",
      facilityName: "Old Facility",
      updatedAt: "2026-04-01T10:00:00.000Z",
    },
  ];

  const artifacts = buildPatientProfileArtifacts({
    patientId: "9001",
    patient: {
      firstName: "  Jane ",
      middleName: " Q ",
      lastName: " Patient ",
      dob: "1992-03-14",
      phone: " 5551234567 ",
      provider: "Dr. Rivera",
      facilityName: "LabCenter North",
      primaryInsurance: "Acme Health",
    },
    registrations,
    orders,
    now,
  });

  assert.equal(artifacts.nextProfile.patientId, "9001");
  assert.equal(artifacts.nextProfile.firstName, "Jane");
  assert.equal(artifacts.registrationUpdates.length, 1);
  assert.deepEqual(artifacts.registrationUpdates[0], {
    recordKey: "reg-a",
    record: {
      patientId: "9001",
      firstName: "Jane",
      lastName: "Patient",
      phone: "5551234567",
      provider: "Dr. Rivera",
      facilityName: "LabCenter North",
      createdAt: "2026-04-01T10:00:00.000Z",
      middleName: "Q",
      referenceLab: "",
      providerNpi: "",
      mrn: "",
      suffix: "",
      sex: "",
      phoneBelongsTo: "",
      patientType: "",
      dob: "1992-03-14",
      age: "",
      email: "",
      state: "",
      address: "",
      address2: "",
      city: "",
      zipcode: "",
      county: "",
      ethnicity: "",
      country: "",
      race: "",
      billingType: "",
      primaryInsurance: "Acme Health",
      primaryMemberPolicy: "",
      primaryGroup: "",
      primaryGroupNo: "",
      primaryAttachments: "",
      insurancePhone: "",
      secondaryInsurance: "",
      secondaryMemberPolicy: "",
      secondaryGroup: "",
      secondaryGroupNo: "",
      secondaryAttachments: "",
      tertiaryInsurance: "",
      tertiaryMemberPolicy: "",
      tertiaryGroup: "",
      tertiaryGroupNo: "",
      tertiaryAttachments: "",
      workersCompensation: "",
      workersMemberPolicy: "",
      compensationManager: "",
      injuryDate: "",
      collectionDate: "",
      collectionTime: "",
      receivedDate: "",
      additionalInformation: "",
    },
  });
  assert.equal(artifacts.orderUpdates.length, 1);
  assert.equal(artifacts.orderUpdates[0].patientName, "Jane Q Patient");
  assert.equal(artifacts.orderUpdates[0].patientDob, "1992-03-14");
  assert.equal(artifacts.orderUpdates[0].provider, "Dr. Rivera");
  assert.equal(artifacts.orderUpdates[0].facilityName, "LabCenter North");
  assert.equal(artifacts.orderUpdates[0].updatedAt, now);
});

test("buildPatientProfileArtifacts creates a new registration when no stored record exists", () => {
  const now = "2026-06-09T09:00:00.000Z";
  const artifacts = buildPatientProfileArtifacts({
    patientId: "9010",
    patient: {
      firstName: "New",
      lastName: "Patient",
      phone: "5552223333",
    },
    registrations: [],
    orders: [],
    now,
  });

  assert.equal(artifacts.registrationUpdates.length, 1);
  assert.deepEqual(artifacts.registrationUpdates[0], {
    patientId: "9010",
    referenceLab: "",
    facilityName: "",
    provider: "",
    providerNpi: "",
    mrn: "",
    firstName: "New",
    middleName: "",
    lastName: "Patient",
    suffix: "",
    sex: "",
    phoneBelongsTo: "",
    patientType: "",
    dob: "",
    age: "",
    phone: "5552223333",
    email: "",
    state: "",
    address: "",
    address2: "",
    city: "",
    zipcode: "",
    county: "",
    ethnicity: "",
    country: "",
    race: "",
    billingType: "",
    primaryInsurance: "",
    primaryMemberPolicy: "",
    primaryGroup: "",
    primaryGroupNo: "",
    primaryAttachments: "",
    insurancePhone: "",
    secondaryInsurance: "",
    secondaryMemberPolicy: "",
    secondaryGroup: "",
    secondaryGroupNo: "",
    secondaryAttachments: "",
    tertiaryInsurance: "",
    tertiaryMemberPolicy: "",
    tertiaryGroup: "",
    tertiaryGroupNo: "",
    tertiaryAttachments: "",
    workersCompensation: "",
    workersMemberPolicy: "",
    compensationManager: "",
    injuryDate: "",
    collectionDate: "",
    collectionTime: "",
    receivedDate: "",
    additionalInformation: "",
    createdAt: now,
  });
  assert.deepEqual(artifacts.orderUpdates, []);
});

test("buildPatientProfileArtifacts falls back to order name and current timestamp when needed", () => {
  const now = "2026-06-09T10:00:00.000Z";
  const artifacts = buildPatientProfileArtifacts({
    patientId: "9020",
    patient: {
      firstName: "",
      middleName: "",
      lastName: "",
      provider: "",
      facilityName: "",
    },
    registrations: [
      {
        recordKey: "reg-fallback",
        record: {
          patientId: "9020",
          firstName: "Legacy",
          lastName: "Patient",
        },
      },
    ],
    orders: [
      {
        orderId: "00002",
        patientId: "9020",
        patientName: "Existing Snapshot",
        provider: "Existing Provider",
        facilityName: "Existing Facility",
      },
    ],
    now,
  });

  assert.equal(artifacts.registrationUpdates[0].record.createdAt, now);
  assert.equal(artifacts.orderUpdates[0].patientName, "Existing Snapshot");
  assert.equal(artifacts.orderUpdates[0].provider, "Existing Provider");
  assert.equal(artifacts.orderUpdates[0].facilityName, "Existing Facility");
});
