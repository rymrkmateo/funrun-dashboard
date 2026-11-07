# FUNRUN Admin Dashboard (Express + Supabase)

Admin dashboard for the FUNRUN registration system: participant CRUD, event date,
bulk email, and a reset button.

## Setup

1. In your Supabase project, open **SQL Editor**, paste the contents of `supabase-schema.sql`, and run it.
   It is safe to run again. If you already ran the first version, run it again to add the `event_settings` table.
2. Open **Project Settings > API** and copy the Project URL and the `service_role` key.
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL` and `SUPABASE_KEY`.
4. Add the email settings (see below).
5. Run:

   ```bash
   npm install
   npm start
   ```

6. Open http://localhost:3000

## Email setup (Gmail example)

1. Turn on 2-Step Verification for the Google account.
2. Open https://myaccount.google.com/apppasswords and create an app password. Google shows 16 letters.
3. Put these in `.env`, with the app password written without spaces:

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=youraddress@gmail.com
   SMTP_PASS=your-16-character-app-password
   MAIL_FROM=FUNRUN <youraddress@gmail.com>
   ```

4. Restart the server. The "Email isn't set up" notice disappears from the Event section.

Gmail allows about 500 recipients per day. Any SMTP provider works the same way.

## What the Event section does

- **Event date:** saves the date. Tick "Email everyone the new date" to send a date-change notice to
  everyone who isn't cancelled.
- **Email participants:** write a subject and message, pick a group, and send. Each person gets their own
  copy. `{{name}}`, `{{category}}` and `{{date}}` are replaced for each person.
- **Delete all participants:** removes every registration after you type DELETE ALL.

## API

| Method | Route                    | Purpose                                              |
|--------|--------------------------|------------------------------------------------------|
| GET    | /api/stats               | Totals by status and runners per category            |
| GET    | /api/participants        | List (`?search=`, `?category=`, `?status=`)          |
| GET    | /api/participants/:id    | One participant                                      |
| POST   | /api/participants        | Create                                               |
| PUT    | /api/participants/:id    | Update                                               |
| DELETE | /api/participants/:id    | Delete one                                           |
| DELETE | /api/participants        | Delete all (body: `{ "confirm": "DELETE ALL" }`)     |
| GET    | /api/event               | Event date and whether email is configured           |
| PUT    | /api/event               | Set date, optional `notify: true` to email everyone  |
| POST   | /api/email               | Send `{ audience, subject, message }`                |

## Structure

```
server.js           Express routes and validation
supabase.js         Supabase client, startup check, sample data
mailer.js           SMTP sending (Nodemailer)
supabase-schema.sql Tables to run in the SQL Editor
public/             Dashboard UI (index.html, style.css, app.js)
```
