const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function readAppointments(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed.appointments) ? parsed.appointments : [];
  } catch {
    return [];
  }
}

function writeAppointments(filePath, appointments) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ appointments }, null, 2)}\n`, "utf8");
}

function normalizeAppointment(input, existing = {}) {
  const appointment = {
    ...existing,
    ...input,
    id: String(input?.id || existing?.id || crypto.randomUUID()),
    patientName: String(input?.patientName ?? existing?.patientName ?? "").trim(),
    patientPhone: String(input?.patientPhone ?? existing?.patientPhone ?? "").trim(),
    doctorName: String(input?.doctorName ?? existing?.doctorName ?? "").trim(),
    location: String(input?.location ?? existing?.location ?? "").trim(),
    appointmentDate: String(input?.appointmentDate ?? existing?.appointmentDate ?? "").trim(),
    startTime: String(input?.startTime ?? existing?.startTime ?? "").trim(),
    endTime: String(input?.endTime ?? existing?.endTime ?? "").trim(),
    type: String(input?.type ?? existing?.type ?? "Consultation").trim() || "Consultation",
    status: String(input?.status ?? existing?.status ?? "Scheduled").trim() || "Scheduled",
    notes: String(input?.notes ?? existing?.notes ?? "").trim(),
    createdAt: String(existing?.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };
  if (!appointment.patientName || !appointment.doctorName || !appointment.appointmentDate || !appointment.startTime || !appointment.endTime) {
    throw new Error("Patient, doctor, date, start time, and end time are required.");
  }
  if (appointment.endTime <= appointment.startTime) throw new Error("End time must be after start time.");
  return appointment;
}

function overlaps(a, b) {
  return a.appointmentDate === b.appointmentDate
    && a.doctorName.toLowerCase() === b.doctorName.toLowerCase()
    && a.status !== "Cancelled"
    && b.status !== "Cancelled"
    && a.startTime < b.endTime
    && b.startTime < a.endTime;
}

function registerAppointmentRoutes({ app, appointmentsPath, auditLog, requireDoctorAuth }) {
  app.get("/api/appointments", requireDoctorAuth, (_req, res) => {
    return res.json({ appointments: readAppointments(appointmentsPath).sort((a, b) => `${a.appointmentDate}${a.startTime}`.localeCompare(`${b.appointmentDate}${b.startTime}`)) });
  });

  app.post("/api/appointments", requireDoctorAuth, (req, res) => {
    try {
      const appointments = readAppointments(appointmentsPath);
      const appointment = normalizeAppointment(req.body || {});
      if (appointments.some((item) => overlaps(item, appointment))) return res.status(409).json({ error: "This doctor already has an overlapping appointment." });
      appointments.push(appointment);
      writeAppointments(appointmentsPath, appointments);
      auditLog(req, "appointment_created", "success", { appointmentId: appointment.id, doctorName: appointment.doctorName });
      return res.status(201).json({ appointment });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Unable to create appointment." });
    }
  });

  app.put("/api/appointments/:id", requireDoctorAuth, (req, res) => {
    try {
      const appointments = readAppointments(appointmentsPath);
      const index = appointments.findIndex((item) => item.id === req.params.id);
      if (index < 0) return res.status(404).json({ error: "Appointment not found." });
      const appointment = normalizeAppointment(req.body || {}, appointments[index]);
      if (appointments.some((item, itemIndex) => itemIndex !== index && overlaps(item, appointment))) return res.status(409).json({ error: "This doctor already has an overlapping appointment." });
      appointments[index] = appointment;
      writeAppointments(appointmentsPath, appointments);
      auditLog(req, "appointment_updated", "success", { appointmentId: appointment.id, status: appointment.status });
      return res.json({ appointment });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Unable to update appointment." });
    }
  });
}

module.exports = { registerAppointmentRoutes };
