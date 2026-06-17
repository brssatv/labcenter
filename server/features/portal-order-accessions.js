const {
  buildAccessionNumber,
  resolveAccessionPrefix,
  resolveAccessionTimeZone,
} = require("../../lib/accession-number");

function prepareOrdersForBulkSave({
  orders,
  portalStore,
  requestReceivedAt = new Date().toISOString(),
  timeZone,
} = {}) {
  const receivedAt = String(requestReceivedAt || new Date().toISOString());
  const normalizedTimeZone = resolveAccessionTimeZone(timeZone);
  const drafts = (Array.isArray(orders) ? orders : []).map((order) => {
    const input = order && typeof order === "object" ? order : {};
    const orderId = String(input.orderId || "").trim();
    const current = orderId ? portalStore.getOrderById(orderId) : null;
    const existingAccession = String(current?.accessionNo || current?.accession || "").trim();
    const createdAt = String(current?.createdAt || receivedAt);
    const primaryServiceLine = Array.isArray(input.services) && input.services.length
      ? input.services[0]
      : Array.isArray(current?.services) && current.services.length
      ? current.services[0]
      : null;
    return {
      createdAt,
      current,
      existingAccession,
      input,
      orderId,
      prefix: resolveAccessionPrefix({
        explicitPrefix: input.accessionPrefix || "",
        serviceLine: primaryServiceLine,
      }),
    };
  });

  const reservations = portalStore.reserveAccessionSequences(
    drafts
      .filter((draft) => draft.orderId && !draft.existingAccession)
      .map((draft) => ({
        createdAt: draft.createdAt,
      })),
    { timeZone: normalizedTimeZone }
  );

  let reservationIndex = 0;
  return drafts.map((draft) => {
    const generatedAccession = draft.existingAccession || (
      draft.orderId
        ? buildAccessionNumber({
            prefix: draft.prefix,
            createdAt: draft.createdAt,
            dailySequence: reservations[reservationIndex++]?.sequence || 1,
            timeZone: normalizedTimeZone,
          })
        : ""
    );
    const { accessionPrefix, ...inputWithoutPrefix } = draft.input;
    return {
      ...(draft.current || {}),
      ...inputWithoutPrefix,
      orderId: draft.orderId,
      accessionNo: generatedAccession,
      createdAt: draft.createdAt,
      updatedAt: receivedAt,
    };
  });
}

module.exports = {
  prepareOrdersForBulkSave,
};
