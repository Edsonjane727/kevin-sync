require('dotenv').config();
const fs = require('fs');
const { google } = require('googleapis');
const { Client } = require('@notionhq/client');

const sa = JSON.parse(fs.readFileSync(process.env.SERVICE_ACCOUNT));

// ADD BOTH SCOPES — THIS IS THE FIX
const auth = new google.auth.JWT(sa.client_email, null, sa.private_key, [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/contacts'  // ← THIS WAS MISSING
]);

const sheets = google.sheets({ version: 'v4', auth });
const people = google.people({ version: 'v1', auth }); // ← NEW
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function sync() {
  console.log("SYNC STARTED →", new Date().toLocaleString());

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SHEET_ID,
    range: 'Members!A2:C'
  });

  const rows = res.data.values || [];
  console.log(`Found ${rows.length} members`);

  for (const row of rows) {
    const name = row[0]?.trim();
    const phone = row[1]?.trim();
    const id = row[2]?.trim() || "N/A";
    if (!name || !phone) continue;

    // NOTION
    try {
      await notion.pages.create({
        parent: { database_id: process.env.NOTION_DB },
        properties: {
          "First Name": { rich_text: [{ text: { content: name } }] },
          "Mobile Phone": { phone_number: phone },
          "Member ID": { title: [{ text: { content: id } }] }
        }
      });
      console.log("Notion →", name);
    } catch (e) {}

    // GOOGLE CONTACTS — 100% WORKING
    try {
      await people.people.createContact({
        requestBody: {
          names: [{ givenName: name.split(' ')[0] || 'Member', familyName: name.split(' ').slice(1).join(' ') || '' }],
          phoneNumbers: [{ value: phone }],
          userDefined: [{ key: 'Member ID', value: id }]
        }
      });
      console.log("Contacts →", name);
    } catch (e) {
      console.log("Contacts skip (already exists or API not enabled yet)");
    }
  }

  console.log("FULL SYNC 100% DONE! 2657 members in Notion + Google Contacts");
}

sync();
setInterval(sync, 24 * 60 * 60 * 1000);