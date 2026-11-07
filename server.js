require('dotenv').config();
const path = require('path');
const express = require('express');
const { init, getClient, TABLE, EVENT_TABLE } = require('./supabase');
const mailer = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3000;

const CATEGORIES = ['3K', '5K', '10K'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
const STATUSES = ['Pending', 'Confirmed', 'Cancelled'];
const GENDERS = ['Male', 'Female', 'Other'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const toApi = (row) => ({
  id: row.id,
  fullName: row.full_name,
  email: row.email,
  contact: row.contact,
  age: row.age,
  gender: row.gender,
  category: row.category,
  shirtSize: row.shirt_size,
  status: row.status,
  registeredAt: row.registered_at,
});

const toRow = (v) => ({
  full_name: v.fullName,
  email: v.email,
  contact: v.contact,
  age: v.age,
  gender: v.gender,
  category: v.category,
  shirt_size: v.shirtSize,
  status: v.status,
});

function validate(body) {
  const fullName = String(body.fullName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const contact = String(body.contact ?? '').trim();
  const age = Number(body.age);
  const gender = String(body.gender ?? '');
  const category = String(body.category ?? '');
  const shirtSize = String(body.shirtSize ?? '');
  const status = String(body.status || 'Pending');

  if (!fullName) return { error: 'Full name is required.' };
  if (fullName.length > 120) return { error: 'Full name must be 120 characters or fewer.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (!/^[0-9+\-\s]{7,20}$/.test(contact)) return { error: 'Enter a valid contact number.' };
  if (!Number.isInteger(age) || age < 5 || age > 100) return { error: 'Age must be a whole number from 5 to 100.' };
  if (!GENDERS.includes(gender)) return { error: 'Choose a gender.' };
  if (!CATEGORIES.includes(category)) return { error: 'Choose a race category.' };
  if (!SIZES.includes(shirtSize)) return { error: 'Choose a shirt size.' };
  if (!STATUSES.includes(status)) return { error: 'Choose a status.' };

  return { value: { fullName, email, contact, age, gender, category, shirtSize, status } };
}

const isValidId = (id) => /^[0-9]+$/.test(id);

const handle = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'That email is already registered.' });
    }
    if (err && err.code === 'PGRST205') {
      return res.status(500).json({ error: 'A database table is missing. Run supabase-schema.sql in the Supabase SQL Editor.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });

async function countRows(apply) {
  let query = getClient().from(TABLE).select('*', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return count;
}

app.get('/api/stats', handle(async (req, res) => {
  const [total, confirmed, pending, cancelled, ...perCategory] = await Promise.all([
    countRows(),
    countRows((q) => q.eq('status', 'Confirmed')),
    countRows((q) => q.eq('status', 'Pending')),
    countRows((q) => q.eq('status', 'Cancelled')),
    ...CATEGORIES.map((category) => countRows((q) => q.eq('category', category).neq('status', 'Cancelled'))),
  ]);
  res.json({
    total,
    confirmed,
    pending,
    cancelled,
    byCategory: CATEGORIES.map((category, i) => ({ category, participants: perCategory[i] })),
  });
}));

app.get('/api/participants', handle(async (req, res) => {
  const { search = '', category = '', status = '' } = req.query;
  let query = getClient().from(TABLE).select('*').order('id', { ascending: false });

  const term = String(search).replace(/[,()%*\\]/g, ' ').trim();
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  res.json(data.map(toApi));
}));

app.get('/api/participants/:id', handle(async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Participant not found.' });
  const { data, error } = await getClient().from(TABLE).select('*').eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!data) return res.status(404).json({ error: 'Participant not found.' });
  res.json(toApi(data));
}));

app.post('/api/participants', handle(async (req, res) => {
  const { error: invalid, value } = validate(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  const { data, error } = await getClient().from(TABLE).insert(toRow(value)).select().single();
  if (error) throw error;
  res.status(201).json(toApi(data));
}));

app.put('/api/participants/:id', handle(async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Participant not found.' });
  const { error: invalid, value } = validate(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  const { data, error } = await getClient().from(TABLE).update(toRow(value)).eq('id', req.params.id).select();
  if (error) throw error;
  if (!data.length) return res.status(404).json({ error: 'Participant not found.' });
  res.json(toApi(data[0]));
}));

app.delete('/api/participants/:id', handle(async (req, res) => {
  if (!isValidId(req.params.id)) return res.status(404).json({ error: 'Participant not found.' });
  const { data, error } = await getClient().from(TABLE).delete().eq('id', req.params.id).select();
  if (error) throw error;
  if (!data.length) return res.status(404).json({ error: 'Participant not found.' });
  res.status(204).end();
}));

const AUDIENCES = ['all', 'active', 'confirmed', 'pending', ...CATEGORIES];

async function fetchRecipients(audience) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let query = getClient()
      .from(TABLE)
      .select('full_name, email, category, status')
      .order('id')
      .range(from, from + 999);
    if (audience === 'active') query = query.neq('status', 'Cancelled');
    else if (audience === 'confirmed') query = query.eq('status', 'Confirmed');
    else if (audience === 'pending') query = query.eq('status', 'Pending');
    else if (CATEGORIES.includes(audience)) query = query.eq('category', audience).neq('status', 'Cancelled');
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

function formatLongDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function fill(template, participant, dateText) {
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, participant.full_name)
    .replace(/\{\{\s*category\s*\}\}/gi, participant.category)
    .replace(/\{\{\s*date\s*\}\}/gi, dateText || 'to be announced');
}

async function getEventDate() {
  const { data, error } = await getClient().from(EVENT_TABLE).select('event_date').eq('id', 1).maybeSingle();
  if (error) throw error;
  return data && data.event_date ? data.event_date : null;
}

app.get('/api/event', handle(async (req, res) => {
  res.json({ eventDate: await getEventDate(), mailConfigured: mailer.isConfigured() });
}));

app.put('/api/event', handle(async (req, res) => {
  const eventDate = String(req.body.eventDate ?? '').trim();
  const notify = req.body.notify === true;
  if (!isValidIsoDate(eventDate)) return res.status(400).json({ error: 'Choose a valid date.' });

  const { error } = await getClient()
    .from(EVENT_TABLE)
    .upsert({ id: 1, event_date: eventDate, updated_at: new Date().toISOString() });
  if (error) throw error;

  let email = null;
  if (notify) {
    if (!mailer.isConfigured()) {
      email = { error: 'Email is not set up. Add the SMTP settings to .env and restart the server.' };
    } else {
      const recipients = await fetchRecipients('active');
      const longDate = formatLongDate(eventDate);
      const subject = `FUNRUN update: new event date, ${longDate}`;
      const body =
        `Hi {{name}},\n\nThe FUNRUN event date has changed. The new date is ${longDate}.\n\n` +
        `Your {{category}} registration stays the same, and you don't need to do anything.\n\nSee you there!\nThe FUNRUN team`;
      const result = await mailer.sendBulk(recipients, (p) => ({ subject, text: fill(body, p, longDate) }));
      email = { total: recipients.length, sent: result.sent, failed: result.failed };
    }
  }
  res.json({ eventDate, email });
}));

app.post('/api/email', handle(async (req, res) => {
  const audience = String(req.body.audience ?? '');
  const subject = String(req.body.subject ?? '').replace(/[\r\n]+/g, ' ').trim();
  const message = String(req.body.message ?? '').trim();

  if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: 'Choose who to send to.' });
  if (!subject) return res.status(400).json({ error: 'Subject is required.' });
  if (subject.length > 150) return res.status(400).json({ error: 'Subject must be 150 characters or fewer.' });
  if (!message) return res.status(400).json({ error: 'Message is required.' });
  if (message.length > 5000) return res.status(400).json({ error: 'Message must be 5000 characters or fewer.' });
  if (!mailer.isConfigured()) {
    return res.status(400).json({ error: 'Email is not set up. Add the SMTP settings to .env and restart the server.' });
  }

  const recipients = await fetchRecipients(audience);
  if (!recipients.length) return res.status(400).json({ error: 'No participants match that group.' });

  const eventDate = await getEventDate();
  const dateText = eventDate ? formatLongDate(eventDate) : null;
  const result = await mailer.sendBulk(recipients, (p) => ({
    subject: fill(subject, p, dateText),
    text: fill(message, p, dateText),
  }));
  res.json({ total: recipients.length, sent: result.sent, failed: result.failed });
}));

app.delete('/api/participants', handle(async (req, res) => {
  if (!req.body || req.body.confirm !== 'DELETE ALL') {
    return res.status(400).json({ error: 'Confirmation text is missing.' });
  }
  const { count, error } = await getClient().from(TABLE).delete({ count: 'exact' }).gt('id', 0);
  if (error) throw error;
  res.json({ deleted: count });
}));

init()
  .then(() => app.listen(PORT, () => console.log(`FUNRUN dashboard running at http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Could not connect to Supabase.\n', err.message);
    console.error('Check SUPABASE_URL and SUPABASE_KEY in .env, and run supabase-schema.sql in the Supabase SQL Editor.');
    process.exit(1);
  });
