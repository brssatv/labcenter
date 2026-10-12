const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const root = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const file = path.join(root, 'facility.json');
const original = fs.readFileSync(file, 'utf8');
const data = JSON.parse(original);
const db = new Database(path.join(root, 'labcenter.sqlite'), { readonly: true });
const records = ['orders', 'registrations'].flatMap(table => db.prepare(`SELECT payload_json FROM ${table}`).all().map(row => JSON.parse(row.payload_json)));
const appointmentsFile = path.join(root, 'appointments.json');
if (fs.existsSync(appointmentsFile)) records.push(...JSON.parse(fs.readFileSync(appointmentsFile, 'utf8')).appointments);
const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const facilities = new Set(records.flatMap(row => [row.facilityName, row.location, row.facilityId, row.accountId]).map(normalize).filter(Boolean));
const providers = new Set(records.flatMap(row => [row.provider, row.doctorName, row.providerId, row.doctorId]).map(normalize).filter(Boolean));
const next = {
  ...data,
  accounts: data.accounts.filter(row => [row.id, row.account_code, row.name, row.basic_information?.accountName, row.facilityName, row.facility_name].some(value => facilities.has(normalize(value)))),
  providers: data.providers.filter(row => [row.provider_id, row.provider_name, row.display_name, row.validator_name, row.provider_information?.providerName].some(value => providers.has(normalize(value)))),
};
console.log(`Accounts: ${data.accounts.length} → ${next.accounts.length}; providers: ${data.providers.length} → ${next.providers.length}`);
if (process.argv.includes('--apply')) {
  if (process.env.NODE_ENV === 'production' && !process.argv.includes('--no-backup')) {
    throw new Error('Production cleanup requires --no-backup.');
  }
  if (!process.argv.includes('--no-backup')) {
  const backup = path.join(root, `facility-backup-${Date.now()}.json`);
  fs.writeFileSync(backup, original, { flag: 'wx' });
  console.log(`Backup: ${backup}`);
  }
  const temporary = `${file}.cleanup.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(temporary, file);
  console.log('Facility cleanup complete.');
}
db.close();
